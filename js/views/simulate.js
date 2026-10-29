import { h, clear, vnd, num, signed, byName } from '../util.js';
import { all, getSettings } from '../store.js';
import { mkCtx, formulaCost, fLabel } from '../calc.js';
import { toast, field, numInput, picker, listSelect, table, empty, banner, tabs } from '../ui.js';

let rows = [{ ingId: '', pct: 10 }]; let basis = ''; let result = null; let sel = '';

export async function render(el, _p, { rerender }) {
  const st = getSettings(); basis ||= st.defaultBasis;
  el.append(h('h1', {}, 'Mô phỏng biến động giá'));
  el.append(h('p', { class: 'muted' }, 'Thử trước: nếu giá nguyên liệu tăng/giảm bao nhiêu % thì giá thành các công thức đổi thế nào. Không làm thay đổi dữ liệu thật.'));
  const ctx = mkCtx();
  const ingOpts = all('ingredients').sort((a, b) => byName(a.name, b.name)).map((i) => ({ value: i.id, label: i.name, sub: i.code }));
  const box = h('div', { class: 'card' }, h('h3', {}, 'Kịch bản'));
  const draw = () => {
    for (const k of [...box.querySelectorAll('.simrow')]) k.remove();
    rows.forEach((r, i) => box.insertBefore(h('div', { class: 'simrow grid3', style: { alignItems: 'end', marginBottom: '8px' } },
      field('Nguyên liệu', picker({ options: ingOpts, value: r.ingId, placeholder: 'Chọn nguyên liệu…', title: 'Nguyên liệu', onChange: (v) => (r.ingId = v) })),
      field('Thay đổi giá (%)', numInput({ value: r.pct, onInput: (v) => (r.pct = v ?? 0) }), 'VD: 10 = tăng 10%, −5 = giảm 5%'),
      h('button', { class: 'btn sm danger', onClick: () => { rows.splice(i, 1); if (!rows.length) rows.push({ ingId: '', pct: 10 }); draw(); } }, 'Xóa dòng')), actions));
  };
  const actions = h('div', { class: 'row' },
    h('button', { class: 'btn', onClick: () => { rows.push({ ingId: '', pct: 10 }); draw(); } }, '＋ Thêm nguyên liệu'),
    h('div', { style: { minWidth: '160px' } }, listSelect({ key: 'priceTypes', value: basis, allowAdd: false, onChange: (v) => (basis = v || st.defaultBasis) })),
    h('button', { class: 'btn primary', onClick: run }, '▶ Chạy mô phỏng'));
  box.append(actions); el.append(box); draw();
  if (result) drawResult(el, ctx);
  drawSensitivity(el, ctx);

  function run() {
    const mult = {};
    for (const r of rows) if (r.ingId) mult[r.ingId] = (mult[r.ingId] || 1) * (1 + (r.pct || 0) / 100);
    if (!Object.keys(mult).length) { toast('Hãy chọn ít nhất một nguyên liệu.', 'bad'); return; }
    const c = mkCtx();
    const list = [...c.formulas.values()].filter((f) => f.status !== 'Ngừng dùng' && c.products.get(f.productId)).map((f) => {
      const a = formulaCost(c, f, basis).total; const b = formulaCost(c, f, basis, mult).total;
      return { f, a, b, d: b - a, p: a ? ((b - a) / a) * 100 : 0 };
    }).filter((r) => Math.abs(r.d) > 0.005).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
    result = { list, rows: rows.filter((r) => r.ingId).map((r) => ({ ...r })), basis };
    rerender();
  }
}

function drawResult(el, ctx) {
  const r = result;
  const desc = r.rows.map((x) => (ctx.ing.get(x.ingId)?.name || '?') + ' ' + signed(x.pct, 1) + '%').join(', ');
  el.append(h('div', { class: 'card' }, h('div', { class: 'cardhead' }, h('h3', {}, 'Kết quả: ' + desc), h('button', { class: 'btn sm', onClick: async () => { const x = await import('../xl.js'); x.exportSimulation(ctx, r); } }, '⬇ Excel')),
    r.list.length ? table(['Công thức', ['Giá thành cũ', 'num'], ['Giá thành mới', 'num'], ['Chênh', 'num'], ['%', 'num']], r.list.map((x) => [h('a', { href: '#/formula/' + x.f.id }, fLabel(ctx, x.f)), vnd(x.a), vnd(x.b), h('span', { class: x.d > 0 ? 'delta-up' : 'delta-down' }, signed(x.d, 0) + ' đ'), h('span', { class: x.d > 0 ? 'delta-up' : 'delta-down' }, signed(x.p, 2) + '%')])) : h('div', { class: 'empty' }, 'Không có công thức nào dùng các nguyên liệu này.')));
}

function drawSensitivity(el, ctx) {
  const forms = [...ctx.formulas.values()].filter((f) => f.status !== 'Ngừng dùng' && ctx.products.get(f.productId));
  if (!forms.length) return;
  const card = h('div', { class: 'card' }, h('h3', {}, 'Nguyên liệu nào quyết định giá thành?'));
  const body = h('div', {});
  const draw = () => {
    clear(body);
    const f = forms.find((x) => x.id === sel); if (!f) return;
    const base = formulaCost(ctx, f, basis);
    const rs = base.lines.filter((l) => l.cost > 0).map((l) => ({ l, share: base.total ? (l.cost / base.total) * 100 : 0, up10: l.cost * 0.1 })).sort((a, b) => b.l.cost - a.l.cost);
    body.append(table(['Nguyên liệu', ['Thành tiền', 'num'], ['% giá thành', 'num'], ['Nếu giá +10%', 'num']], rs.map((x) => [x.l.ing?.name, vnd(x.l.cost), num(x.share, 1) + '%', h('span', { class: 'delta-up' }, '+' + vnd(x.up10))])));
  };
  card.append(field('Công thức', picker({ options: forms.map((f) => ({ value: f.id, label: fLabel(ctx, f) })), value: sel, placeholder: 'Chọn công thức…', title: 'Công thức', onChange: (v) => { sel = v; draw(); } })), body);
  el.append(card); draw();
}
