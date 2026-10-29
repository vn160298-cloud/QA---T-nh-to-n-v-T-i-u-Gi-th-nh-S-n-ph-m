import { h, clear, fmtDateTime, num, normalize, esc } from '../util.js';
import * as store from '../store.js';
import { S, all, can, getList, getSettings, isCloud } from '../store.js';
import { LIST_DEFS, ROLES, COLLS } from '../defaults.js';
import { openModal, toast, guard, confirmBox, promptBox, field, numInput, plainSelect, listSelect, textInput, checkbox, chip, table, empty, banner, tabs, go, hooks } from '../ui.js';
import { CONFIG } from '../config.js';

// ---------- menu "Thêm" (điện thoại) ----------
export const more = { async render(el) {
  const link = (ic, t, sub, href, on) => h('a', { class: 'item', href: href || '#', onClick: on, style: { textDecoration: 'none', color: 'inherit', display: 'flex' } }, h('span', { style: { fontSize: '22px', width: '30px' } }, ic), h('div', { class: 'grow' }, h('div', { class: 't1' }, t), sub ? h('div', { class: 't2' }, sub) : null), h('span', { class: 'muted' }, '›'));
  el.append(h('h1', {}, 'Thêm'));
  if (S.role !== 'viewer') el.append(h('div', { class: 'card' }, h('div', { class: 'list' },
    link('🔬', 'Chỉ tiêu chất lượng', 'Tự điền chỉ tiêu, dung sai, hàm lượng', '#/crit'),
    link('✅', 'Duyệt đề xuất', 'Công thức mới chỉ áp dụng khi được duyệt', '#/appr'),
    link('📈', 'Mô phỏng giá', 'Nếu giá nguyên liệu đổi…', '#/sim'),
    link('📊', 'Báo cáo', 'So sánh phiên bản, tiết kiệm, biến động', '#/rep'))));
  if (S.role !== 'viewer') el.append(h('div', { class: 'card' }, h('div', { class: 'list' },
    link('📥', 'Nhập / Xuất Excel', 'Mẫu nhập, bảng giá, sao lưu', '#/io'),
    link('🗂️', 'Danh sách xổ xuống', 'Nhóm, nhà cung cấp, biến thể…', '#/lists'),
    link('🕘', 'Nhật ký thao tác', 'Ai sửa gì, giá trị cũ/mới', '#/audit'),
    link('👥', 'Người dùng & quyền', '', '#/users'),
    link('⚙️', 'Cài đặt', 'Số người duyệt, đám mây…', '#/settings'))));
  el.append(h('div', { class: 'card' }, h('div', { class: 'list' },
    link('📲', 'Thêm vào màn hình chính', hooks.isStandalone?.() ? 'Đang chạy ở chế độ ứng dụng' : 'Mở toàn màn hình như app thật', null, (e) => { e.preventDefault(); hooks.install(); }),
    isCloud() ? link('🚪', 'Đăng xuất', S.user?.email, null, (e) => { e.preventDefault(); hooks.logout(); }) : null)));
} };

// ---------- danh sách xổ xuống ----------
export const lists = { async render(el, _p, { rerender }) {
  el.append(h('h1', {}, 'Danh sách xổ xuống'));
  el.append(h('p', { class: 'muted' }, 'Mỗi dòng là một lựa chọn. Thêm/xóa/sửa tại đây; ở các ô chọn trong app cũng có mục "➕ Thêm giá trị mới". Đổi tên một mục không tự đổi các bản ghi cũ đã dùng tên đó.'));
  const w = can('lists', 'w');
  for (const [key, def] of Object.entries(LIST_DEFS)) {
    const ta = h('textarea', { rows: 5, readOnly: !w }); ta.value = getList(key).join('\n');
    el.append(h('div', { class: 'card' }, h('div', { class: 'cardhead' }, h('h3', {}, def.label), w ? h('button', { class: 'btn sm primary', onClick: async () => { await guard(() => store.saveList(key, ta.value.split('\n')), 'Đã lưu "' + def.label + '"'); rerender(); } }, 'Lưu') : null), ta));
  }
} };

// ---------- nhập / xuất ----------
export const io = { async render(el, _p, { rerender }) {
  el.append(h('h1', {}, 'Nhập / Xuất Excel'));
  const xl = () => import('../xl.js');
  el.append(h('div', { class: 'card' }, h('h3', {}, '1. Nhập dữ liệu từ Excel'),
    h('p', { class: 'muted' }, 'Dùng mẫu chuẩn để nhập nguyên liệu, giá, chỉ tiêu, hàm lượng, sản phẩm và công thức (kể cả công thức cũ). App kiểm tra từng dòng và cho xem trước trước khi ghi.'),
    h('div', { class: 'row' }, h('button', { class: 'btn', onClick: async () => (await xl()).downloadTemplate() }, '⬇ Tải mẫu nhập (.xlsx)'),
      can('ingredients', 'w') ? (() => { const f = h('input', { type: 'file', accept: '.xlsx,.xls,.xlsm', class: 'hide' }); f.addEventListener('change', async () => { if (f.files[0]) await doImport(f.files[0], rerender); f.value = ''; }); return h('div', {}, f, h('button', { class: 'btn primary', onClick: () => f.click() }, '⬆ Chọn file để nhập')); })() : h('span', { class: 'muted small' }, 'Bạn không có quyền nhập dữ liệu.'))));
  el.append(h('div', { class: 'card' }, h('h3', {}, '2. Xuất Excel'), h('div', { class: 'row' },
    h('button', { class: 'btn', onClick: async () => (await xl()).exportPriceList() }, '⬇ Bảng giá nguyên liệu'),
    h('button', { class: 'btn', onClick: async () => (await xl()).exportCostBoard() }, '⬇ Giá thành tất cả công thức')),
    h('p', { class: 'small muted' }, 'Từng công thức, so sánh phiên bản, tiết kiệm và mô phỏng có nút xuất Excel ngay trong màn hình tương ứng.')));
  el.append(h('div', { class: 'card' }, h('h3', {}, '3. Sao lưu / khôi phục (JSON)'),
    h('p', { class: 'muted' }, 'Sao lưu toàn bộ dữ liệu vào một file. Có thể dùng để chuyển dữ liệu từ chế độ thử sang đám mây: sao lưu → đăng nhập tài khoản đám mây → khôi phục.'),
    h('div', { class: 'row' }, h('button', { class: 'btn', onClick: async () => (await xl()).backupJson() }, '⬇ Sao lưu'),
      can('settings', 'w') ? (() => { const f = h('input', { type: 'file', accept: '.json', class: 'hide' }); f.addEventListener('change', async () => { if (!f.files[0]) return; if (!(await confirmBox('Khôi phục sẽ ghi đè các bản ghi trùng mã trong file sao lưu. Tiếp tục?'))) { f.value = ''; return; } const n = await guard(async () => (await xl()).restoreJson(f.files[0])); if (n != null) { toast('Đã khôi phục ' + n + ' bản ghi', 'ok'); rerender(); } f.value = ''; }); return h('div', {}, f, h('button', { class: 'btn', onClick: () => f.click() }, '⬆ Khôi phục từ file')); })() : null)));
} };
async function doImport(file, rerender) {
  const x = await import('../xl.js');
  const plan = await guard(() => x.planImport(file));
  if (!plan) return;
  const nothing = !plan.ingredients.length && !plan.prices.length && !plan.criteria.length && !plan.products.length && !plan.formulas.length;
  openModal({
    title: 'Xem trước khi nhập', wide: true,
    body: h('div', { class: 'stack' },
      h('div', { class: 'card flat' }, h('h3', {}, 'Sẽ ghi'), h('ul', {}, Object.entries(plan.summary).map(([k, v]) => h('li', {}, h('b', {}, k + ': '), String(v))))),
      plan.errors.length ? h('div', { class: 'card flat' }, h('h3', { style: { color: 'var(--bad)' } }, plan.errors.length + ' dòng bị bỏ qua'), table(['Sheet', 'Dòng', 'Lý do'], plan.errors.slice(0, 50).map((e) => [e.sheet, e.row, e.msg])), plan.errors.length > 50 ? h('p', { class: 'small muted' }, '… và ' + (plan.errors.length - 50) + ' dòng khác') : null) : banner('ok', 'Không có lỗi.'),
      nothing ? banner('warn', 'Không có dữ liệu hợp lệ để nhập. Kiểm tra tên sheet và dòng tiêu đề theo mẫu.') : null),
    actions: [{ label: 'Hủy' }, { label: 'Nhập ' + (plan.errors.length ? 'các dòng hợp lệ' : 'dữ liệu'), kind: 'primary', disabled: nothing, onClick: async () => { await guard(() => x.applyImport(plan), 'Đã nhập dữ liệu'); rerender(); } }],
  });
}

// ---------- nhật ký ----------
export const audit = { async render(el) {
  el.append(h('h1', {}, 'Nhật ký thao tác'));
  if (!can('audit', 'r')) { el.append(banner('warn', 'Vai trò của bạn không xem được nhật ký. Chỉ Quản trị, QA và Quản lý duyệt được xem.')); return; }
  const rows = await guard(() => store.auditLog(400)) || [];
  const names = { ingredients: 'Nguyên liệu', prices: 'Giá', criteria: 'Chỉ tiêu', products: 'Sản phẩm', formulas: 'Công thức', proposals: 'Đề xuất', lists: 'Danh sách', settings: 'Cài đặt', snapshots: 'Giá thành' };
  const q = h('input', { type: 'search', placeholder: 'Tìm theo người, nội dung…' });
  const cs = plainSelect({ items: Object.entries(names), value: '', placeholder: 'Mọi loại', onChange: draw });
  const box = h('div', { class: 'card' });
  el.append(h('p', { class: 'muted' }, isCloud() ? 'Nhật ký do máy chủ ghi tự động, không sửa/xóa được.' : 'Chế độ thử: nhật ký lưu trên thiết bị này.'), h('div', { class: 'searchbar' }, q, cs), box);
  q.addEventListener('input', draw);
  function draw() {
    clear(box);
    const s = normalize(q.value);
    const list = rows.filter((r) => (!cs.value || r.coll === cs.value) && (!s || normalize([r.user, r.label, r.action, names[r.coll]].join(' ')).includes(s)));
    if (!list.length) { box.append(empty('Chưa có thao tác nào.')); return; }
    box.append(table(['Thời gian', 'Người', 'Hành động', 'Đối tượng', 'Nội dung'], list.slice(0, 300).map((r) => ({ data: r, cells: [fmtDateTime(r.ts), r.user || '', chip(r.action, r.action === 'Xóa' ? 'bad' : r.action === 'Thêm' ? 'ok' : 'info'), names[r.coll] || r.coll, r.label || ''] })), { onRow: (r) => detail(r) }));
  }
  draw();
  function detail(r) {
    const o = r.old || {}, n = r.new || {}; const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !['updatedAt', 'updatedBy', 'createdAt', 'createdBy'].includes(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]));
    const fmt = (v) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : String(v));
    openModal({ title: (names[r.coll] || r.coll) + ' · ' + r.action, wide: true, actions: [{ label: 'Đóng' }], body: h('div', { class: 'stack' }, h('div', { class: 'small muted' }, fmtDateTime(r.ts) + ' · ' + (r.user || '')), keys.length ? table(['Trường', 'Giá trị cũ', 'Giá trị mới'], keys.map((k) => [k, h('span', { class: 'delta-up' }, fmt(o[k])), h('span', { class: 'delta-down' }, fmt(n[k]))])) : h('div', { class: 'muted' }, 'Không có chi tiết thay đổi.')) });
  }
} };

// ---------- người dùng ----------
export const users = { async render(el, _p, { rerender }) {
  el.append(h('h1', {}, 'Người dùng & quyền'));
  el.append(h('div', { class: 'card' }, h('h3', {}, 'Vai trò'), table(['Vai trò', 'Quyền chính'], [
    ['Quản trị', 'Mọi thứ, gồm quản lý người dùng, cài đặt, xóa dữ liệu'],
    ['Kỹ thuật / R&D', 'Sản phẩm, công thức, tối ưu, gửi duyệt'],
    ['Chất lượng (QA)', 'Chỉ tiêu, hàm lượng nguyên liệu, yêu cầu chất lượng, xem nhật ký'],
    ['Mua hàng', 'Nguyên liệu, nhập giá'],
    ['Quản lý duyệt', 'Duyệt/từ chối đề xuất, đưa công thức vào sản xuất, xem nhật ký'],
    ['Chỉ xem giá thành', 'Chỉ thấy giá thành tổng, không thấy tỷ lệ nguyên liệu']])));
  if (!isCloud()) {
    el.append(h('div', { class: 'card' }, h('h3', {}, 'Thử các vai trò'), h('p', { class: 'muted' }, 'Chế độ thử không có đăng nhập. Đổi vai trò bên dưới để xem giao diện thay đổi theo quyền. Khi kết nối đám mây, quyền được máy chủ kiểm soát thật.'),
      field('Vai trò đang thử', plainSelect({ items: Object.entries(ROLES).filter(([k]) => k !== 'pending'), value: S.role, onChange: (v) => { store.setLocalRole(v); hooks.boot(); } }))));
    return;
  }
  if (S.role !== 'admin') { el.append(banner('warn', 'Chỉ Quản trị mới quản lý người dùng.')); return; }
  const profs = await guard(() => store.listProfiles()) || [];
  el.append(h('div', { class: 'card' }, h('h3', {}, 'Tài khoản (' + profs.length + ')'), table(['Họ tên / Email', 'Vai trò', 'Hoạt động', ''], profs.map((p) => {
    let role = p.role, active = p.active !== false;
    const sel = plainSelect({ items: Object.entries(ROLES), value: role, onChange: (v) => (role = v) });
    const chk = checkbox('', active, (v) => (active = v));
    return [h('div', {}, h('b', {}, p.full_name || '(chưa đặt tên)'), h('div', { class: 'small muted' }, p.email)), sel, chk, h('button', { class: 'btn sm primary', onClick: async () => { await guard(() => store.updateProfile(p.id, { role, active }), 'Đã cập nhật'); } }, 'Lưu')];
  }))));
  el.append(h('p', { class: 'small muted' }, 'Tài khoản mới đăng ký ở trạng thái "Chờ cấp quyền" cho đến khi bạn gán vai trò. Tài khoản đầu tiên tự thành Quản trị.'));
} };

// ---------- cài đặt ----------
export const settings = { async render(el, _p, { rerender }) {
  const st = getSettings(); const w = can('settings', 'w');
  const d = { ...st };
  el.append(h('h1', {}, 'Cài đặt'));
  el.append(h('div', { class: 'card' }, h('h3', {}, 'Quy tắc nghiệp vụ'),
    h('div', { class: 'grid2' },
      field('Số người duyệt cần có cho một đề xuất', numInput({ value: d.requiredApprovals, onInput: (v) => (d.requiredApprovals = Math.max(1, Math.round(v || 1))), readOnly: !w }), 'Đặt 2 nếu cần hai người cùng duyệt'),
      field('Lưu công thức thử nghiệm (tháng)', numInput({ value: d.trialMonths, onInput: (v) => (d.trialMonths = v || 4), readOnly: !w })),
      field('Loại giá mặc định', listSelect({ key: 'priceTypes', value: d.defaultBasis, allowAdd: false, onChange: (v) => (d.defaultBasis = v || 'Kế hoạch'), disabled: !w })),
      field('Cảnh báo giá cũ hơn (ngày)', numInput({ value: d.priceStaleDays, onInput: (v) => (d.priceStaleDays = v || 90), readOnly: !w })),
      field('Tối ưu: thay đổi tối đa mặc định (± %)', numInput({ value: d.maxChangePct, onInput: (v) => (d.maxChangePct = v ?? 25), readOnly: !w })),
      field('Tối ưu: tỷ lệ tối đa nguyên liệu thay thế (%)', numInput({ value: d.subMaxPct, onInput: (v) => (d.subMaxPct = v ?? 30), readOnly: !w }))),
    w ? h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onClick: async () => { await guard(() => store.saveSettings(d), 'Đã lưu cài đặt'); } }, 'Lưu cài đặt')) : h('p', { class: 'small muted' }, 'Chỉ Quản trị sửa được.')));

  // đám mây
  const cfg = store.cloudConfig();
  const url = h('input', { value: cfg.url, placeholder: 'https://xxxx.supabase.co', autocomplete: 'off' }); url.value = cfg.url;
  const key = h('input', { value: cfg.key, placeholder: 'anon public key (eyJ…)', autocomplete: 'off' }); key.value = cfg.key;
  el.append(h('div', { class: 'card' }, h('h3', {}, '☁ Lưu trên đám mây (bảo mật)'),
    h('p', { class: 'muted' }, isCloud() ? 'Đang kết nối đám mây: dữ liệu lưu trong cơ sở dữ liệu Supabase, đăng nhập bằng email, phân quyền theo vai trò, nhật ký do máy chủ ghi.' : 'Đang ở chế độ thử (dữ liệu chỉ trên thiết bị này). Làm theo HUONG_DAN.md để tạo cơ sở dữ liệu đám mây (miễn phí), rồi dán 2 giá trị vào đây.'),
    h('div', { class: 'stack' }, field('Project URL', url), field('Anon public key', key)),
    h('div', { class: 'row', style: { marginTop: '10px' } },
      h('button', { class: 'btn primary', onClick: async () => { if (!url.value.trim() || !key.value.trim()) { toast('Hãy nhập cả URL và key.', 'bad'); return; } store.setCloudConfig(url.value, key.value); toast('Đang kết nối lại…'); await store.signOut().catch(() => {}); hooks.boot(); } }, 'Lưu và kết nối'),
      cfg.url ? h('button', { class: 'btn', onClick: async () => { store.setCloudConfig('', ''); hooks.boot(); } }, 'Ngắt, quay về chế độ thử') : null)));

  if (!isCloud()) el.append(h('div', { class: 'card' }, h('h3', {}, 'Dữ liệu trên thiết bị này'), h('div', { class: 'row' },
    h('button', { class: 'btn', onClick: async () => { await guard(async () => { await store.loadSample(); const c = await import('../calc.js'); await c.refreshSnapshots(); }, 'Đã nạp dữ liệu mẫu'); } }, 'Nạp dữ liệu mẫu Coconut Jelly'),
    h('button', { class: 'btn danger', onClick: async () => { if (await confirmBox('Xóa toàn bộ dữ liệu lưu trên thiết bị này? Hãy sao lưu trước nếu cần.', { danger: true, okLabel: 'Xóa hết' })) { await store.wipeLocal(); toast('Đã xóa', 'ok'); rerender(); } } }, 'Xóa toàn bộ dữ liệu'))));
  el.append(h('div', { class: 'card' }, h('h3', {}, 'Ứng dụng'), h('p', {}, CONFIG.APP_NAME + ' · phiên bản 1.0'), h('div', { class: 'row' }, h('button', { class: 'btn', onClick: () => hooks.install() }, '📲 Thêm vào màn hình chính'), isCloud() ? h('button', { class: 'btn', onClick: () => hooks.logout() }, 'Đăng xuất') : null)));
} };
