import { h, clear, vnd, num, signed, fmtDate } from '../util.js';
import { all, get, getSettings } from '../store.js';
import { mkCtx, formulaCost, fLabel, qualitySummary, REQ_LABEL } from '../calc.js';
import { picker, tabs, table, empty, chip, statusChip, field } from '../ui.js';

let tab = 'compare'; let A = '', B = '';

export async function render(el, _p, { rerender }) {
  el.append(h('h1', {}, 'Báo cáo'));
  el.append(tabs([['compare', 'So sánh 2 phiên bản'], ['savings', 'Tiết kiệm đã đạt'], ['trend', 'Biến động giá thành']], tab, (k) => { tab = k; rerender(); }));
  const ctx = mkCtx(); const basis = getSettings().defaultBasis;
  if (tab === 'compare') compare(el, ctx, basis, rerender);
  else if (tab === 'savings') savings(el, ctx, basis);
  else trend(el, ctx);
}

function compare(el, ctx, basis, rerender) {
  const forms = [...ctx.formulas.values()].filter((f) => ctx.products.get(f.productId)).sort((a, b) => fLabel(ctx, a).localeCompare(fLabel(ctx, b), 'vi'));
  const opts = forms.map((f) => ({ value: f.id, label: fLabel(ctx, f), sub: f.status }));
  el.append(h('div', { class: 'card' }, h('div', { class: 'grid2' },
    field('Phiên bản A (gốc)', picker({ options: opts, value: A, placeholder: 'Chọn…', title: 'Phiên bản A', onChange: (v) => { A = v; rerender(); } })),
    field('Phiên bản B (so sánh)', picker({ options: opts, value: B, placeholder: 'Chọn…', title: 'Phiên bản B', onChange: (v) => { B = v; rerender(); } })))));
  const fa = ctx.formulas.get(A), fb = ctx.formulas.get(B);
  if (!fa || !fb) { el.append(h('div', { class: 'card' }, empty('Chọn hai phiên bản để so sánh.'))); return; }
  const ca = formulaCost(ctx, fa, basis), cb = formulaCost(ctx, fb, basis);
  const ids = [...new Set([...ca.lines.map((l) => l.ingId), ...cb.lines.map((l) => l.ingId)])];
  const la = new Map(ca.lines.map((l) => [l.ingId, l])), lb = new Map(cb.lines.map((l) => [l.ingId, l]));
  const rows = ids.map((id) => { const x = la.get(id), y = lb.get(id); return { name: (x || y).ing?.name || '?', qa: x?.qty || 0, qb: y?.qty || 0, ca: x?.cost || 0, cb: y?.cost || 0 }; }).sort((p, q) => Math.abs(q.cb - q.ca) - Math.abs(p.cb - p.ca));
  const d = cb.total - ca.total;
  el.append(h('div', { class: 'kpis' },
    h('div', { class: 'kpi' }, h('div', { class: 'v mono' }, vnd(ca.total)), h('div', { class: 'l' }, 'Giá thành A')),
    h('div', { class: 'kpi' }, h('div', { class: 'v mono' }, vnd(cb.total)), h('div', { class: 'l' }, 'Giá thành B')),
    h('div', { class: 'kpi' }, h('div', { class: 'v mono ' + (d > 0 ? 'delta-up' : 'delta-down') }, signed(d, 0) + ' đ'), h('div', { class: 'l' }, 'Chênh (B − A)')),
    h('div', { class: 'kpi' }, h('div', { class: 'v mono ' + (d > 0 ? 'delta-up' : 'delta-down') }, ca.total ? signed((d / ca.total) * 100, 2) + '%' : '—'), h('div', { class: 'l' }, 'Chênh %'))));
  el.append(h('div', { class: 'card' }, h('div', { class: 'cardhead' }, h('h3', {}, 'Chi tiết nguyên liệu'), h('button', { class: 'btn sm', onClick: async () => { const x = await import('../xl.js'); x.exportCompare(ctx, fa, fb, basis); } }, '⬇ Excel')),
    table(['Nguyên liệu', ['A (g)', 'num'], ['B (g)', 'num'], ['Chênh (g)', 'num'], ['Chi phí A', 'num'], ['Chi phí B', 'num'], ['Chênh', 'num']], rows.map((r) => [r.name, num(r.qa, 2), num(r.qb, 2), h('span', { class: r.qb > r.qa ? 'delta-up' : r.qb < r.qa ? 'delta-down' : '' }, signed(r.qb - r.qa, 2)), vnd(r.ca), vnd(r.cb), h('span', { class: r.cb > r.ca ? 'delta-up' : r.cb < r.ca ? 'delta-down' : '' }, signed(r.cb - r.ca, 0))]),
      { foot: ['Tổng nguyên liệu', num(ca.weight, 2), num(cb.weight, 2), signed(cb.weight - ca.weight, 2), vnd(ca.material), vnd(cb.material), signed(cb.material - ca.material, 0)] })));
  const qa = qualitySummary(ctx, fa, ca), qb = qualitySummary(ctx, fb, cb);
  const crit = [...new Set([...qa.rows, ...qb.rows].map((r) => r.req.critId))];
  if (crit.length) el.append(h('div', { class: 'card' }, h('h3', {}, 'Chỉ tiêu chất lượng'), table(['Chỉ tiêu', ['A', 'num'], 'Kết quả A', ['B', 'num'], 'Kết quả B'], crit.map((cid) => {
    const x = qa.rows.find((r) => r.req.critId === cid), y = qb.rows.find((r) => r.req.critId === cid); const c = (x || y).crit;
    const cell = (r) => (r ? chip(REQ_LABEL[r.status][0], REQ_LABEL[r.status][1]) : '—');
    return [c?.name || '?', x?.value == null ? '—' : num(x.value, c?.decimals ?? 2), cell(x), y?.value == null ? '—' : num(y.value, c?.decimals ?? 2), cell(y)];
  }))));
}

function savings(el, ctx, basis) {
  const done = all('proposals').filter((p) => p.status === 'Đã duyệt').sort((a, b) => (b.approvals?.at(-1)?.at || '').localeCompare(a.approvals?.at(-1)?.at || ''));
  if (!done.length) { el.append(h('div', { class: 'card' }, empty('Chưa có đề xuất nào được duyệt.'))); return; }
  const rows = done.map((p) => {
    const base = ctx.formulas.get(p.formulaId), res = ctx.formulas.get(p.resultFormulaId);
    const nowA = base ? formulaCost(ctx, base, basis).total : null, nowB = res ? formulaCost(ctx, res, basis).total : null;
    return { p, base, res, atApproval: p.alt?.saving || 0, now: nowA != null && nowB != null ? nowA - nowB : null, status: res?.status };
  });
  const tot = rows.reduce((s, r) => s + r.atApproval, 0);
  el.append(h('div', { class: 'kpis' }, h('div', { class: 'kpi' }, h('div', { class: 'v' }, rows.length), h('div', { class: 'l' }, 'Đề xuất đã duyệt')), h('div', { class: 'kpi' }, h('div', { class: 'v mono delta-down' }, '−' + vnd(tot)), h('div', { class: 'l' }, 'Tổng tiết kiệm/phần (khi duyệt)'))));
  el.append(h('div', { class: 'card' }, h('div', { class: 'cardhead' }, h('h3', {}, 'Chi tiết'), h('button', { class: 'btn sm', onClick: async () => { const x = await import('../xl.js'); x.exportSavings(ctx, rows); } }, '⬇ Excel')),
    table(['Công thức', 'Phương án', 'Ngày duyệt', ['Tiết kiệm khi duyệt', 'num'], ['Tiết kiệm theo giá hiện tại', 'num'], 'Trạng thái bản mới'], rows.map((r) => [r.base ? h('a', { href: '#/formula/' + r.res?.id }, fLabel(ctx, r.base)) : '(đã xóa)', r.p.alt?.name || '', fmtDate(r.p.approvals?.at(-1)?.at), vnd(r.atApproval) + ' (' + num(r.p.alt?.savingPct || 0, 1) + '%)', r.now == null ? '—' : vnd(r.now), r.status ? statusChip(r.status) : '—']))));
  el.append(h('p', { class: 'small muted' }, 'Tiết kiệm tính theo từng phần (đơn vị thành phẩm), chưa nhân sản lượng. "Tiết kiệm theo giá hiện tại" so sánh lại công thức gốc và công thức mới bằng giá đang áp dụng.'));
}

function trend(el, ctx) {
  const snaps = all('snapshots').filter((s) => (s.history || []).length).sort((a, b) => (a.productName + a.version).localeCompare(b.productName + b.version, 'vi'));
  if (!snaps.length) { el.append(h('div', { class: 'card' }, empty('Chưa có lịch sử giá thành. Lịch sử được ghi tự động mỗi khi giá hoặc công thức thay đổi.'))); return; }
  el.append(h('div', { class: 'card' }, h('h3', {}, 'Biến động giá thành'), table(['Công thức', 'Trạng thái', ['Lần đầu', 'num'], ['Hiện tại', 'num'], ['Biến động', 'num'], 'Xu hướng'], snaps.map((s) => {
    const hs = s.history; const first = hs[0].total, last = hs.at(-1).total;
    return [s.productName + ' · ' + s.variant + ' · v' + s.version, statusChip(s.status), vnd(first), vnd(last), hs.length > 1 ? h('span', { class: last > first ? 'delta-up' : 'delta-down' }, signed(((last - first) / first) * 100, 1) + '%') : '—', spark(hs)];
  }))));
}
function spark(hs) {
  if (hs.length < 2) return h('span', { class: 'muted' }, '—');
  const w = 90, hgt = 26, vals = hs.map((x) => x.total), min = Math.min(...vals), max = Math.max(...vals);
  const pts = vals.map((v, i) => (i / (vals.length - 1)) * w + ',' + (hgt - 3 - (max === min ? 0.5 : (v - min) / (max - min)) * (hgt - 6))).join(' ');
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('width', w); s.setAttribute('height', hgt); s.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  s.innerHTML = `<polyline fill="none" stroke="var(--primary)" stroke-width="2" points="${pts}"/>`;
  return s;
}
