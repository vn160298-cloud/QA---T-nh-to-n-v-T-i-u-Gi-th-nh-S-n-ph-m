import { h, vnd, num, pct, signed, fmtDate } from '../util.js';
import { S, all, can, getSettings, loadSample } from '../store.js';
import { mkCtx, formulaCost, latestPrice, fLabel, refreshSnapshots, qualitySummary } from '../calc.js';
import { go, statusChip, guard, confirmBox, hooks, table, chip } from '../ui.js';

export function getNotifications() {
  const out = []; const now = new Date();
  const st = getSettings();
  if (['admin', 'approver'].includes(S.role)) {
    const n = all('proposals').filter((p) => p.status === 'Chờ duyệt' && !(p.approvals || []).some((a) => a.by === S.user?.name)).length;
    if (n) out.push({ kind: 'approval', icon: '✅', text: n + ' đề xuất công thức đang chờ bạn duyệt', href: '#/appr' });
  }
  if (S.role === 'viewer') return out;
  const exp = all('formulas').filter((f) => f.status === 'Thử nghiệm' && f.expiresAt && new Date(f.expiresAt) < now);
  if (exp.length) out.push({ kind: 'trial', icon: '⏳', text: exp.length + ' công thức thử nghiệm đã quá hạn lưu ' + st.trialMonths + ' tháng', href: '#/prod' });
  const ctx = mkCtx();
  const used = new Set();
  for (const f of ctx.formulas.values()) if (f.status !== 'Ngừng dùng') for (const l of f.lines || []) used.add(l.ingId);
  const noPrice = []; const stale = [];
  for (const id of used) {
    const ing = ctx.ing.get(id); if (!ing || ing.bomFormulaId) continue;
    const lp = latestPrice(ctx, id, 'Kế hoạch');
    if (!lp) noPrice.push(ing.name);
    else if (lp.date && (now - new Date(lp.date)) / 86400000 > st.priceStaleDays) stale.push(ing.name);
  }
  if (noPrice.length) out.push({ kind: 'price', icon: '❗', text: noPrice.length + ' nguyên liệu đang dùng chưa có giá (' + noPrice.slice(0, 3).join(', ') + (noPrice.length > 3 ? '…' : '') + ')', href: '#/ing' });
  if (stale.length) out.push({ kind: 'stale', icon: '🕒', text: stale.length + ' nguyên liệu có giá cũ hơn ' + st.priceStaleDays + ' ngày', href: '#/ing' });
  return out;
}

export async function render(el, _p, { rerender }) {
  const ctx = mkCtx();
  const basis = getSettings().defaultBasis;
  el.append(h('h1', {}, 'Tổng quan'));

  if (S.role === 'viewer') { viewerBoard(el); return; }

  const empty = !all('products').length && !all('ingredients').length;
  if (empty) {
    el.append(h('div', { class: 'card' },
      h('h3', {}, 'Bắt đầu'),
      h('p', { class: 'muted' }, 'Chưa có dữ liệu. Bạn có thể nạp bộ dữ liệu mẫu (Coconut Jelly 180g và bảng giá từ file Excel mẫu) để thử, hoặc nhập dữ liệu của mình.'),
      h('div', { class: 'row' },
        can('ingredients', 'w') ? h('button', { class: 'btn primary', onClick: async () => { await guard(async () => { await loadSample(); await refreshSnapshots(); }, 'Đã nạp dữ liệu mẫu'); rerender(); } }, 'Nạp dữ liệu mẫu') : null,
        h('button', { class: 'btn', onClick: () => go('#/io') }, 'Nhập từ Excel'),
        h('button', { class: 'btn', onClick: () => go('#/ing') }, 'Tự nhập nguyên liệu'))));
  }

  const forms = [...ctx.formulas.values()];
  const props = all('proposals');
  const prod = forms.filter((f) => f.status === 'Đang sản xuất');
  const pend = props.filter((p) => p.status === 'Chờ duyệt');
  const done = props.filter((p) => p.status === 'Đã duyệt');
  const avgSave = done.length ? done.reduce((s, p) => s + (p.alt?.savingPct || 0), 0) / done.length : null;
  el.append(h('div', { class: 'kpis' },
    kpi(all('products').length, 'Sản phẩm', '#/prod'),
    kpi(prod.length, 'Công thức đang sản xuất', '#/prod'),
    kpi(pend.length, 'Đề xuất chờ duyệt', '#/appr'),
    kpi(avgSave == null ? '—' : pct(avgSave), 'Tiết kiệm TB của đề xuất đã duyệt', '#/rep')));

  const notes = getNotifications();
  if (notes.length) el.append(h('div', { class: 'card' }, h('h3', {}, 'Cần chú ý'), h('div', { class: 'list' }, notes.map((x) => h('div', { class: 'item', onClick: () => go(x.href) }, h('span', {}, x.icon), h('div', { class: 'grow' }, h('div', { class: 't1' }, x.text)), h('span', { class: 'muted' }, '›'))))));

  if (!hooks.isStandalone?.()) el.append(h('div', { class: 'banner ok' }, h('span', {}, '📲 Cài app lên màn hình chính để mở nhanh, toàn màn hình, không thanh địa chỉ.'), h('button', { class: 'btn sm', style: { marginLeft: 'auto' }, onClick: () => hooks.install() }, 'Cách cài')));

  const rows = forms.filter((f) => f.status !== 'Ngừng dùng').map((f) => {
    const c = formulaCost(ctx, f, basis);
    const snap = S.cache.snapshots.get(f.id);
    const hist = snap?.history || [];
    const prev = hist.length > 1 ? hist[hist.length - 2].total : null;
    const q = qualitySummary(ctx, f, c);
    return { f, c, prev, q };
  }).sort((a, b) => fLabel(ctx, a.f).localeCompare(fLabel(ctx, b.f), 'vi'));
  el.append(h('div', { class: 'card' },
    h('div', { class: 'cardhead' }, h('h3', {}, 'Giá thành hiện hành (' + basis + ')'), h('button', { class: 'btn sm', onClick: async () => { await guard(refreshSnapshots, 'Đã cập nhật giá thành'); rerender(); } }, 'Làm mới')),
    rows.length ? h('div', { class: 'list' }, rows.map((r) => h('div', { class: 'item', onClick: () => go('#/formula/' + r.f.id) },
      h('div', { class: 'grow' }, h('div', { class: 't1' }, fLabel(ctx, r.f)), h('div', { class: 'row', style: { gap: '6px', marginTop: '3px' } }, statusChip(r.f.status), qBadge(r.q.overall), r.c.missing.length ? chip('⚠ thiếu giá', 'warn') : null)),
      h('div', { class: 'right' }, h('div', { class: 'bold mono' }, vnd(r.c.total)), h('div', { class: 'small' }, deltaCell(r.c.total, r.prev)))))) : h('div', { class: 'empty' }, 'Chưa có công thức.')));
}

function viewerBoard(el) {
  const snaps = all('snapshots').filter((s) => s.status !== 'Ngừng dùng');
  el.append(h('div', { class: 'card' }, h('h3', {}, 'Giá thành sản phẩm'),
    snaps.length ? table(['Sản phẩm', 'Biến thể', 'Trạng thái', ['Giá thành/phần', 'num'], 'Cập nhật'], snaps.sort((a, b) => a.productName.localeCompare(b.productName, 'vi')).map((s) => [s.productName, s.variant + ' · v' + s.version, statusChip(s.status), vnd(s.total), fmtDate(s.date)])) : h('div', { class: 'empty' }, 'Chưa có dữ liệu giá thành.')));
}
const kpi = (v, l, href) => h('div', { class: 'kpi link', onClick: () => go(href) }, h('div', { class: 'v mono' }, v), h('div', { class: 'l' }, l));
export function deltaCell(now, prev) {
  if (prev == null || Math.abs(now - prev) < 0.005) return h('span', { class: 'muted' }, '—');
  const d = now - prev;
  return h('span', { class: d > 0 ? 'delta-up' : 'delta-down' }, signed(d, 0) + ' đ (' + signed((d / prev) * 100, 1) + '%)');
}
export function qBadge(o) {
  const m = { pass: ['Đạt', 'ok'], tol: ['Trong dung sai', 'warn'], fail: ['Không đạt', 'bad'], none: ['Chưa đặt yêu cầu', ''] }[o];
  return chip(m[0], m[1]);
}
