import { CONFIG } from './config.js';
import { h, clear, $, $$, appendKids } from './util.js';
import * as store from './store.js';
import { S, can, onChange } from './store.js';
import { ROLES } from './defaults.js';
import { toast, openModal, go, guard, hooks } from './ui.js';
import * as dashboard from './views/dashboard.js';
import * as products from './views/products.js';
import * as formula from './views/formula.js';
import * as ingredients from './views/ingredients.js';
import * as criteria from './views/criteria.js';
import * as optimize from './views/optimize.js';
import * as approvals from './views/approvals.js';
import * as simulate from './views/simulate.js';
import * as reports from './views/reports.js';
import * as admin from './views/admin.js';

const app = document.getElementById('app');
let mainEl, badgeEls = [], current = { route: '', param: '' };
let deferredInstall = null;

const ROUTES = {
  dash: dashboard, prod: products, formula, ing: ingredients, crit: criteria, opt: optimize,
  appr: approvals, sim: simulate, rep: reports,
  more: admin.more, lists: admin.lists, io: admin.io, audit: admin.audit, users: admin.users, settings: admin.settings,
};
const TABS = [['dash', '🏠', 'Tổng quan'], ['prod', '🧪', 'Công thức'], ['ing', '💰', 'Giá & NL'], ['opt', '✨', 'Tối ưu'], ['more', '☰', 'Thêm']];
const SIDE = [
  ['dash', '🏠', 'Tổng quan'], ['prod', '🧪', 'Sản phẩm & công thức'], ['ing', '💰', 'Nguyên liệu & giá'], ['crit', '🔬', 'Chỉ tiêu chất lượng'],
  ['opt', '✨', 'Tối ưu công thức'], ['appr', '✅', 'Duyệt đề xuất'], ['sim', '📈', 'Mô phỏng giá'], ['rep', '📊', 'Báo cáo'],
  ['-', '', 'Hệ thống'], ['io', '📥', 'Nhập / Xuất Excel'], ['lists', '🗂️', 'Danh sách xổ xuống'], ['audit', '🕘', 'Nhật ký thao tác'], ['users', '👥', 'Người dùng & quyền'], ['settings', '⚙️', 'Cài đặt'],
];

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export function installApp() {
  if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  openModal({
    title: 'Thêm vào màn hình chính',
    body: h('div', { class: 'stack' },
      isStandalone() ? h('p', {}, 'Ứng dụng đang chạy ở chế độ độc lập rồi.') : null,
      h('p', {}, ios ? 'Trên iPhone/iPad (dùng Safari):' : 'Trên điện thoại/máy tính:'),
      h('ol', {},
        ios
          ? [h('li', {}, 'Mở trang này bằng Safari.'), h('li', {}, 'Bấm nút Chia sẻ (hình vuông có mũi tên lên).'), h('li', {}, 'Chọn "Thêm vào MH chính" (Add to Home Screen), rồi bấm Thêm.')]
          : [h('li', {}, 'Mở bằng Chrome (Android) hoặc Edge/Chrome (máy tính).'), h('li', {}, 'Bấm menu ⋮ → "Cài đặt ứng dụng" / "Thêm vào màn hình chính".')]),
      h('p', { class: 'muted small' }, 'Ứng dụng cần được mở qua địa chỉ HTTPS (xem HUONG_DAN.md) thì trình duyệt mới cho cài.')),
    actions: [{ label: 'Đã hiểu', kind: 'primary' }],
  });
}

// ---------- đăng nhập ----------
function friendlyAuthError(e) {
  const m = String(e?.message || e || '');
  if (/signups? not allowed|signup.*disabled/i.test(m)) return 'Supabase đang tắt chức năng đăng ký. Quản trị hãy bật "Allow new users to sign up" (Authentication → Sign In / Providers) hoặc tạo người dùng tại Authentication → Users → Add user.';
  if (/invalid login credentials/i.test(m)) return 'Sai email hoặc mật khẩu.';
  if (/email not confirmed/i.test(m)) return 'Email chưa được xác nhận. Hãy bấm liên kết trong email Supabase đã gửi.';
  if (/already registered|already been registered/i.test(m)) return 'Email này đã có tài khoản. Hãy đăng nhập.';
  if (/rate limit/i.test(m)) return 'Thử quá nhiều lần, vui lòng chờ ít phút rồi thử lại.';
  if (/failed to fetch|networkerror/i.test(m)) return 'Không kết nối được máy chủ. Kiểm tra mạng và địa chỉ Project URL trong config.js.';
  return m;
}
function authScreen(msg) {
  clear(app);
  let mode = 'in';
  const email = h('input', { type: 'email', autocomplete: 'email', placeholder: 'email@congty.vn', required: true });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Mật khẩu (tối thiểu 8 ký tự)', required: true });
  const name = h('input', { type: 'text', placeholder: 'Họ và tên', autocomplete: 'name' });
  const nameWrap = h('label', { class: 'fld hide' }, 'Họ và tên', name);
  const err = h('div', { class: 'banner bad hide' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Đăng nhập');
  const sw = h('button', { class: 'btn ghost block', type: 'button' }, 'Chưa có tài khoản? Đăng ký');
  const form = h('form', { class: 'stack', onSubmit: async (e) => {
    e.preventDefault(); err.classList.add('hide'); btn.disabled = true;
    try {
      if (mode === 'in') await store.signIn(email.value.trim(), pass.value);
      else {
        if (pass.value.length < 8) throw new Error('Mật khẩu cần tối thiểu 8 ký tự.');
        const logged = await store.signUp(email.value.trim(), pass.value, name.value.trim());
        if (!logged) { toast('Đã tạo tài khoản. Hãy kiểm tra email để xác nhận (nếu được yêu cầu) rồi đăng nhập.', 'ok'); mode = 'in'; setMode(); btn.disabled = false; return; }
      }
      boot();
    } catch (ex) { err.textContent = friendlyAuthError(ex); err.classList.remove('hide'); btn.disabled = false; }
  } },
  h('label', { class: 'fld' }, 'Email', email), nameWrap, h('label', { class: 'fld' }, 'Mật khẩu', pass), err, btn, sw);
  const setMode = () => {
    nameWrap.classList.toggle('hide', mode === 'in');
    btn.textContent = mode === 'in' ? 'Đăng nhập' : 'Đăng ký';
    sw.textContent = mode === 'in' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập';
    pass.autocomplete = mode === 'in' ? 'current-password' : 'new-password';
  };
  sw.addEventListener('click', () => { mode = mode === 'in' ? 'up' : 'in'; setMode(); });
  app.append(h('div', { class: 'auth' }, h('div', { class: 'box' },
    h('img', { src: 'icons/icon-192.png', alt: '' }), h('h1', {}, CONFIG.APP_NAME),
    h('p', { class: 'sub' }, msg || 'Đăng nhập để dùng dữ liệu công thức an toàn trên đám mây.'), form,
    h('p', { class: 'small muted', style: { marginTop: '12px', textAlign: 'center' } }, 'Tài khoản mới cần quản trị viên cấp quyền trước khi xem được dữ liệu.'))));
}
function pendingScreen() {
  clear(app);
  app.append(h('div', { class: 'auth' }, h('div', { class: 'box stack' },
    h('img', { src: 'icons/icon-192.png', alt: '' }), h('h1', {}, 'Đang chờ cấp quyền'),
    h('p', { class: 'sub' }, 'Tài khoản ' + (S.user?.email || '') + ' đã đăng nhập nhưng chưa được gán vai trò. Hãy nhờ quản trị viên cấp quyền, sau đó tải lại.'),
    h('button', { class: 'btn primary block', onClick: () => boot() }, 'Tải lại'),
    h('button', { class: 'btn block', onClick: async () => { await store.signOut(); boot(); } }, 'Đăng xuất'))));
}

// ---------- khung ứng dụng ----------
function shell() {
  clear(app); badgeEls = [];
  const bell = h('button', { class: 'iconbtn', 'aria-label': 'Thông báo', onClick: showNotifications }, '🔔', h('span', { class: 'dot hide' }, '0'));
  badgeEls.push($('.dot', bell));
  const top = h('header', { class: 'topbar' },
    h('img', { class: 'logo', src: 'icons/icon-192.png', alt: '' }),
    h('div', { class: 'ttl' }, CONFIG.APP_NAME, h('small', {}, (S.mode === 'cloud' ? '☁ ' : '💾 ') + (S.user?.name || '') + ' · ' + (ROLES[S.role] || S.role))),
    bell);
  const side = h('nav', { class: 'side', 'aria-label': 'Điều hướng' }, SIDE.map(([k, ic, l]) => (k === '-' ? h('div', { class: 'sep' }, l) : h('a', { href: '#/' + k, 'data-r': k }, h('span', {}, ic), l, k === 'appr' ? (() => { const d = h('span', { class: 'chip warn hide', style: { marginLeft: 'auto' } }, '0'); badgeEls.push(d); return d; })() : null))));
  const tab = h('nav', { class: 'tabbar', 'aria-label': 'Điều hướng chính' }, TABS.map(([k, ic, l]) => h('a', { href: '#/' + k, 'data-r': k }, h('span', { class: 'ic' }, ic), l)));
  mainEl = h('main', { class: 'main', id: 'main' });
  app.append(h('div', { class: 'shell' }, top, side, mainEl, tab));
}

export function notifications() { return dashboard.getNotifications(); }
function updateBadges() {
  const n = notifications();
  const [dot, apprDot] = badgeEls;
  if (dot) { dot.textContent = n.length; dot.classList.toggle('hide', !n.length); }
  const p = n.filter((x) => x.kind === 'approval').length;
  if (apprDot) { apprDot.textContent = p; apprDot.classList.toggle('hide', !p); }
}
function showNotifications() {
  const n = notifications();
  openModal({
    title: 'Thông báo', body: n.length
      ? h('div', { class: 'list' }, n.map((x) => h('div', { class: 'item', onClick: () => { go(x.href); $('.modalback')?.remove(); } }, h('span', {}, x.icon), h('div', { class: 'grow' }, h('div', { class: 't1' }, x.text)), h('span', { class: 'muted' }, '›'))))
      : h('div', { class: 'empty' }, 'Không có thông báo mới.'),
    actions: [{ label: 'Đóng' }],
  });
}

let routing = false;
export async function route() {
  if (!S.ready || !mainEl) return;
  const raw = (location.hash || '#/dash').replace(/^#\/?/, '');
  const [r, ...rest] = raw.split('/');
  let key = ROUTES[r] ? r : 'dash';
  if (S.role === 'viewer' && !['dash', 'more'].includes(key)) key = 'dash'; // vai trò chỉ xem giá thành
  const param = rest.join('/');
  current = { route: key, param };
  $$('[data-r]').forEach((a) => a.classList.toggle('on', a.dataset.r === (['formula'].includes(key) ? 'prod' : key)));
  clear(mainEl);
  const view = ROUTES[key];
  try {
    if (S.mode === 'local' && !sessionStorage.getItem('tcc.noLocalBanner') && key !== 'more') {
      mainEl.append(h('div', { class: 'banner info' }, h('span', {}, '💾 Chế độ thử: dữ liệu chỉ lưu trên thiết bị này. Muốn lưu trên đám mây có bảo mật, kết nối trong Thêm › Cài đặt.'), h('button', { class: 'x', 'aria-label': 'Ẩn', onClick: (e) => { sessionStorage.setItem('tcc.noLocalBanner', '1'); e.target.closest('.banner').remove(); } }, '×')));
    }
    if (!navigator.onLine) mainEl.append(h('div', { class: 'banner warn' }, '⚠ Đang ngoại tuyến. Dữ liệu đám mây sẽ không cập nhật cho đến khi có mạng.'));
    const box = h('div', {}); mainEl.append(box);
    box.append = (...kids) => { appendKids(box, kids); }; // cho phép truyền null/false khi dựng giao diện
    await (view.render || view.default)(box, param, { rerender: route, route: key });
    window.scrollTo({ top: 0 });
  } catch (e) {
    console.error(e);
    mainEl.append(h('div', { class: 'banner bad' }, 'Lỗi hiển thị: ' + (e.message || e)));
  }
  updateBadges();
}
window.addEventListener('hashchange', route);
onChange((c) => { if (c !== 'snapshots') updateBadges(); });

// ---------- khởi động ----------
export async function boot() {
  clear(app); app.append(h('div', { class: 'boot' }, h('div', { class: 'spin' }), h('p', {}, 'Đang tải…')));
  try {
    await store.init();
  } catch (e) { console.error(e); }
  if (S.mode === 'cloud' && !S.user) return authScreen(S.error ? 'Lỗi: ' + S.error : '');
  if (S.mode === 'cloud' && S.role === 'pending') return pendingScreen();
  shell();
  await route();
}
window.addEventListener('online', () => route());
window.addEventListener('offline', () => route());

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
export { current };
export const logout = async () => { await guard(() => store.signOut()); boot(); };
hooks.install = installApp; hooks.logout = logout; hooks.boot = boot; hooks.isStandalone = isStandalone;
boot();
