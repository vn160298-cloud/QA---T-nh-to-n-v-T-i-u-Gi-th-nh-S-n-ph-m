import { h, clear, appendKids, vnd, num, pct, parseNum, uid, clone, addMonths, fmtDate, fmtDateTime, signed, today, byName } from '../util.js';
import { S, all, get, save, remove, can, getList, getSettings } from '../store.js';
import { mkCtx, formulaCost, qualitySummary, fLabel, versionsOf, REQ_LABEL, refreshSnapshots, isMass, latestPrice } from '../calc.js';
import { STATUSES, ROLES, UNIT_F } from '../defaults.js';
import { openModal, toast, guard, confirmBox, promptBox, picker, listSelect, plainSelect, field, numInput, textInput, checkbox, statusChip, chip, go, banner, hooks } from '../ui.js';
import { quickCriterion } from './criteria.js';

const COLORS = ['#0f766e', '#f59e0b', '#2563eb', '#db2777', '#7c3aed', '#16a34a', '#ea580c', '#0891b2', '#64748b'];

export async function render(el, id, { rerender }) {
  const orig = get('formulas', id);
  if (!orig) { el.append(banner('bad', 'Không tìm thấy công thức này.'), h('a', { href: '#/prod', class: 'btn' }, '← Danh sách')); return; }
  const draft = clone(orig);
  draft.lines ||= []; draft.extras ||= []; draft.reqs ||= [];
  for (const l of draft.lines) l.id ||= uid();
  for (const e of draft.extras) e.id ||= uid();
  const product = get('products', draft.productId);
  const editable = can('formulas', 'w') && ['Nháp', 'Thử nghiệm'].includes(draft.status);
  const basis = getSettings().defaultBasis;
  let dirty = false;
  const mark = () => { dirty = true; saveBtn.disabled = false; saveBtn.textContent = 'Lưu thay đổi ●'; };
  const mk = () => { const c = mkCtx(); c.formulas.set(draft.id, draft); return c; };

  // ---------- đầu trang ----------
  const saveBtn = h('button', { class: 'btn primary', disabled: true, onClick: () => doSave() }, 'Lưu thay đổi');
  const statusSel = plainSelect({ items: STATUSES, value: draft.status, onChange: (v) => changeStatus(v) });
  statusSel.disabled = !can('formulas', 'w');
  const ctx0 = mk();
  el.append(
    h('div', { class: 'row between', style: { marginBottom: '8px' } },
      h('a', { href: '#/prod/' + (product?.id || '') }, '← ' + (product?.name || 'Sản phẩm')),
      h('div', { class: 'row' }, statusChip(draft.status))),
    h('h1', {}, fLabel(ctx0, draft)),
    !editable ? banner('info', draft.status === 'Đang sản xuất' ? 'Công thức đang sản xuất không sửa trực tiếp. Hãy tạo phiên bản mới để thay đổi (đảm bảo truy vết theo ISO 22000).' : draft.status === 'Ngừng dùng' ? 'Công thức đã ngừng dùng, chỉ xem.' : 'Bạn chỉ có quyền xem công thức này.') : null,
    h('div', { class: 'row', style: { marginBottom: '12px' } },
      editable ? saveBtn : null,
      can('formulas', 'w') ? h('button', { class: 'btn', onClick: () => newVersion() }, '＋ Phiên bản mới') : null,
      can('formulas', 'w') ? h('button', { class: 'btn', onClick: () => duplicateTo() }, 'Nhân bản sang biến thể') : null,
      h('button', { class: 'btn', onClick: () => go('#/opt/' + draft.id) }, '✨ Tối ưu'),
      h('button', { class: 'btn', onClick: async () => { const x = await import('../xl.js'); x.exportFormula(mk(), draft, basis); } }, '⬇ Excel'),
      editable && draft.status === 'Nháp' && can('formulas', 'w') ? h('button', { class: 'btn danger', onClick: () => del() }, 'Xóa') : null));

  // ---------- thông tin chung ----------
  const info = h('div', { class: 'card' }, h('h3', {}, 'Thông tin phiên bản'),
    h('div', { class: 'grid3' },
      field('Biến thể', listSelect({ key: 'variants', value: draft.variant, onChange: (v) => { draft.variant = v; mark(); }, disabled: !editable })),
      field('Trạng thái', statusSel, draft.status === 'Thử nghiệm' && draft.expiresAt ? 'Lưu đến ' + fmtDate(draft.expiresAt) : null),
      field('Lý do thay đổi', listSelect({ key: 'changeReasons', value: draft.reason, onChange: (v) => { draft.reason = v; mark(); }, disabled: !editable }))),
    h('div', { class: 'grid2', style: { marginTop: '10px' } },
      field('Ghi chú / mô tả thay đổi', Object.assign(h('textarea', { readOnly: !editable, onInput: (e) => { draft.note = e.target.value; mark(); } }), { value: draft.note || '' })),
      h('div', { class: 'stack' },
        field('Ngày hiệu lực', Object.assign(h('input', { type: 'date', readOnly: !editable, onChange: (e) => { draft.effectiveFrom = e.target.value; mark(); } }), { value: draft.effectiveFrom || '' })),
        h('div', { class: 'small muted' }, 'Tạo: ' + (draft.createdBy || '—') + ' · ' + fmtDateTime(draft.createdAt)),
        draft.approvedBy ? h('div', { class: 'small muted' }, 'Duyệt: ' + draft.approvedBy + (draft.approvedAt ? ' · ' + fmtDate(draft.approvedAt) : '')) : null,
        draft.fromProposal ? h('a', { class: 'small', href: '#/appr' }, 'Tạo từ đề xuất tối ưu') : null)));

  // ---------- nguyên liệu ----------
  const linesBox = h('div', { class: 'lines' });
  const lineCostEls = new Map(); const lineHaoEls = new Map(); const lineDoseEls = new Map();
  const ingOptions = () => all('ingredients').filter((i) => i.active !== false).sort((a, b) => byName(a.name, b.name)).map((i) => ({ value: i.id, label: i.name, sub: i.code + ' · ' + i.category }));
  function renderLines() {
    clear(linesBox); lineCostEls.clear(); lineHaoEls.clear(); lineDoseEls.clear();
    if (!draft.lines.length) linesBox.append(h('div', { class: 'empty' }, 'Chưa có nguyên liệu. Bấm "Thêm nguyên liệu".'));
    for (const l of draft.lines) linesBox.append(lineRow(l));
  }
  function lineRow(l) {
    const ing = get('ingredients', l.ingId);
    const unit = ing?.priceUnit && isMass(ing) ? 'g' : ing?.priceUnit || 'g';
    const costEl = h('div', { class: 'cost' }, '—'); lineCostEls.set(l.id, costEl);
    const haoEl = h('div', { class: 'small muted' }, ''); lineHaoEls.set(l.id, haoEl);
    const doseEl = h('div', { class: 'small muted' }, ''); lineDoseEls.set(l.id, doseEl);
    const row = h('div', { class: 'line' },
      h('div', { class: 'c-ing' }, h('span', { class: 'lb small muted' }, 'Nguyên liệu'), picker({ options: ingOptions(), value: l.ingId, placeholder: 'Chọn nguyên liệu…', title: 'Chọn nguyên liệu', disabled: !editable, onChange: (v) => { l.ingId = v; mark(); renderLines(); refresh(); } }), ing?.bomFormulaId ? chip('Bán thành phẩm', 'pri') : null, doseEl),
      h('label', { class: 'fld c-sm' }, h('span', { class: 'lb' }, 'Lượng (' + unit + ')'), numInput({ value: l.qty, readOnly: !editable, onInput: (v) => { l.qty = v ?? 0; mark(); refresh(); } })),
      h('label', { class: 'fld c-sm' }, h('span', { class: 'lb' }, 'Định mức (yield)'), numInput({ value: l.yield, placeholder: String(ing?.yield ?? 1), readOnly: !editable, onInput: (v) => { l.yield = v; mark(); refresh(); } }), haoEl),
      h('label', { class: 'fld c-sm' }, h('span', { class: 'lb' }, 'Min %'), numInput({ value: l.minPct, readOnly: !editable, onInput: (v) => { l.minPct = v; mark(); } })),
      h('label', { class: 'fld c-sm' }, h('span', { class: 'lb' }, 'Max %'), numInput({ value: l.maxPct, readOnly: !editable, onInput: (v) => { l.maxPct = v; mark(); } })),
      h('div', { class: 'c-sm', title: 'Khóa: giữ nguyên lượng này khi chạy tối ưu', style: { alignSelf: 'center' } }, checkbox('Khóa', l.fixed, (v) => { l.fixed = v; mark(); })),
      h('div', { class: 'c-sm' }, h('span', { class: 'lb small muted' }, 'Thành tiền'), costEl),
      editable ? h('div', { class: 'c-del' }, h('button', { class: 'btn sm danger', 'aria-label': 'Xóa dòng', onClick: () => { draft.lines = draft.lines.filter((x) => x !== l); mark(); renderLines(); refresh(); } }, '✕')) : h('div', { class: 'c-del' }));
    if (!editable) row.querySelectorAll('input[type=checkbox]').forEach((c) => (c.disabled = true));
    return row;
  }
  const lineCard = h('div', { class: 'card' },
    h('div', { class: 'cardhead' }, h('h3', {}, 'Nguyên liệu (lượng chín/thành phẩm)'), editable ? h('button', { class: 'btn sm primary', onClick: addLine }, '＋ Thêm nguyên liệu') : null),
    h('p', { class: 'small muted' }, 'Lượng nguyên liệu thô = lượng × định mức. Hao hụt = 1 − 1/định mức. Min/Max % tính theo tổng khối lượng, dùng cho tối ưu.'),
    h('div', { class: 'linehead' }, h('div', {}, 'Nguyên liệu'), h('div', {}, 'Lượng'), h('div', {}, 'Định mức'), h('div', {}, 'Min %'), h('div', {}, 'Max %'), h('div', {}, 'Khóa'), h('div', {}, 'Thành tiền'), h('div', {})),
    linesBox);
  function addLine() {
    const line = { id: uid(), ingId: '', qty: 0, yield: null, minPct: null, maxPct: null, fixed: false, note: '' };
    draft.lines.push(line); mark(); renderLines(); refresh();
    linesBox.lastChild?.querySelector('.picker')?.click();
  }

  // ---------- chi phí khác ----------
  const extrasBox = h('div', { class: 'stack' });
  function renderExtras() {
    clear(extrasBox);
    if (!draft.extras.length) extrasBox.append(h('div', { class: 'muted small' }, 'Chưa có chi phí khác (bao bì, giao hàng, sản xuất, lợi nhuận…).'));
    for (const e of draft.extras) {
      extrasBox.append(h('div', { class: 'grid3', style: { alignItems: 'end' } },
        field('Loại', listSelect({ key: 'costKinds', value: e.kind, onChange: (v) => { e.kind = v; mark(); refresh(); }, disabled: !editable })),
        field('Diễn giải', textInput({ value: e.name, onInput: (v) => { e.name = v; mark(); } })),
        h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, field('Số tiền (đ/phần)', numInput({ value: e.amount, readOnly: !editable, onInput: (v) => { e.amount = v ?? 0; mark(); refresh(); } })),
          editable ? h('button', { class: 'btn sm danger', style: { marginTop: '18px' }, onClick: () => { draft.extras = draft.extras.filter((x) => x !== e); mark(); renderExtras(); refresh(); } }, '✕') : null)));
      if (e.note) extrasBox.append(h('div', { class: 'small muted' }, e.note));
    }
  }
  const extraCard = h('div', { class: 'card' }, h('div', { class: 'cardhead' }, h('h3', {}, 'Chi phí khác'), editable ? h('button', { class: 'btn sm', onClick: () => { draft.extras.push({ id: uid(), kind: '', name: '', amount: 0, note: '' }); mark(); renderExtras(); } }, '＋ Thêm') : null), extrasBox);

  // ---------- yêu cầu chất lượng ----------
  const qBox = h('div', { class: 'stack' }); const qStatusEls = new Map();
  function renderReqs() {
    clear(qBox); qStatusEls.clear();
    const crits = all('criteria');
    if (!draft.reqs.length) qBox.append(h('div', { class: 'muted small' }, crits.length ? 'Chưa đặt yêu cầu chất lượng cho công thức này.' : 'Chưa có chỉ tiêu nào. Hãy tạo chỉ tiêu (đạm, béo, ẩm…) rồi đặt giới hạn.'));
    for (const r of draft.reqs) {
      const crit = crits.find((c) => c.id === r.critId);
      const st = h('span', {}); qStatusEls.set(r, st);
      const valEl = h('span', { class: 'mono bold' }, '—'); qStatusEls.set(r.critId + '#v', valEl);
      qBox.append(h('div', { class: 'line', style: { gridTemplateColumns: 'repeat(6,1fr)' } },
        h('div', { class: 'c-ing', style: { gridColumn: 'span 6' } }, picker({ options: crits.map((c) => ({ value: c.id, label: c.name, sub: (c.unit || '') + (c.additive ? '' : ' · kiểm tra thủ công') })), value: r.critId, placeholder: 'Chọn chỉ tiêu…', title: 'Chọn chỉ tiêu', disabled: !editable, onChange: (v) => { r.critId = v; const c = crits.find((x) => x.id === v); if (c && r.tol == null) r.tol = c.tol ?? null; mark(); renderReqs(); refresh(); } })),
        h('label', { class: 'fld', style: { gridColumn: 'span 2' } }, 'Tối thiểu', numInput({ value: r.min, readOnly: !editable, onInput: (v) => { r.min = v; mark(); refresh(); } })),
        h('label', { class: 'fld', style: { gridColumn: 'span 2' } }, 'Tối đa', numInput({ value: r.max, readOnly: !editable, onInput: (v) => { r.max = v; mark(); refresh(); } })),
        h('label', { class: 'fld', style: { gridColumn: 'span 2' } }, 'Dung sai ±', numInput({ value: r.tol, readOnly: !editable, onInput: (v) => { r.tol = v; mark(); refresh(); } })),
        crit && !crit.additive ? h('label', { class: 'fld', style: { gridColumn: 'span 4' } }, 'Kết quả đo thực tế (' + (crit.unit || '') + ')', numInput({ value: r.measured, readOnly: !editable, onInput: (v) => { r.measured = v; mark(); refresh(); } })) : h('div', { style: { gridColumn: 'span 4' }, class: 'row' }, h('span', { class: 'small muted' }, 'Giá trị tính từ công thức:'), valEl),
        h('div', { style: { gridColumn: 'span 2' }, class: 'row between' }, st, editable ? h('button', { class: 'btn sm danger', onClick: () => { draft.reqs = draft.reqs.filter((x) => x !== r); mark(); renderReqs(); refresh(); } }, '✕') : null)));
    }
  }
  const reqCard = h('div', { class: 'card' }, h('div', { class: 'cardhead' }, h('h3', {}, 'Yêu cầu chất lượng & dung sai'),
    editable ? h('div', { class: 'row' }, h('button', { class: 'btn sm', onClick: async () => { const c = await quickCriterion(); if (c) { renderReqs(); } } }, '＋ Chỉ tiêu mới'), h('button', { class: 'btn sm primary', onClick: () => { draft.reqs.push({ critId: '', min: null, max: null, tol: null, measured: null }); mark(); renderReqs(); } }, '＋ Thêm yêu cầu')) : null), qBox,
    h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Giá trị chỉ tiêu của thành phẩm = Σ(lượng × hàm lượng chỉ tiêu của nguyên liệu) ÷ tổng khối lượng. "Trong dung sai" nghĩa là lệch khỏi khoảng nhưng chưa vượt dung sai.'));

  // ---------- bảng tóm tắt (cột phải) ----------
  const sumBox = h('div', { class: 'card sumpanel' });
  sumBox.append = (...kids) => { appendKids(sumBox, kids); };
  function refresh() {
    const ctx = mk();
    const c = formulaCost(ctx, draft, basis);
    for (const l of c.lines) {
      const ce = lineCostEls.get(l.id); if (ce) ce.textContent = l.missing ? (l.ingId ? 'Thiếu giá' : '—') : vnd(l.cost);
      const he = lineHaoEls.get(l.id); if (he) he.textContent = l.y > 0 ? 'Hao hụt ' + num((1 - 1 / l.y) * 100, 1) + '%' : '';
      const row = ce?.closest('.line'); row?.classList.toggle('miss', !!l.missing && !!l.ingId);
      const de = lineDoseEls.get(l.id);
      if (de) {
        const dmin = l.ing?.doseMin, dmax = l.ing?.doseMax;
        if (dmin != null || dmax != null) {
          const pc = c.weight ? (l.qty / c.weight) * 100 : 0;
          const out = (dmax != null && pc > dmax + 1e-6) ? 'vượt liều tối đa' : (dmin != null && pc < dmin - 1e-6) ? 'dưới liều tối thiểu' : '';
          de.textContent = 'Liều ' + (dmin != null ? num(dmin, 3) : '0') + '–' + (dmax != null ? num(dmax, 3) : '∞') + '% · hiện ' + num(pc, 2) + '%' + (out ? ' ⚠ ' + out : '');
          de.className = 'small ' + (out ? 'delta-up' : 'muted');
        } else de.textContent = '';
      }
    }
    const qs = qualitySummary(ctx, draft, c);
    for (const row of qs.rows) {
      const el1 = qStatusEls.get(row.req); const ve = qStatusEls.get(row.req.critId + '#v');
      if (el1) { clear(el1); const [t, k] = REQ_LABEL[row.status]; el1.append(chip(t, k)); }
      if (ve) ve.textContent = row.value == null ? '—' : num(row.value, row.crit?.decimals ?? 2) + ' ' + (row.crit?.unit || '');
    }
    clear(mbar);
    mbar.append(h('div', {}, h('div', { class: 'small muted' }, 'Giá thành / phần'), h('b', { class: 'mono', style: { fontSize: '18px' } }, vnd(c.total))), h('div', { class: 'right small' }, h('div', {}, c.missing.length ? '⚠ thiếu giá ' + c.missing.length : ''), chip(REQ_LABEL[qs.overall][0], REQ_LABEL[qs.overall][1])));
    clear(sumBox);
    const parts = [...c.lines.filter((l) => l.cost > 0).map((l) => ({ n: l.ing?.name || '?', v: l.cost })).sort((a, b) => b.v - a.v)];
    const top = parts.slice(0, 5); const rest = parts.slice(5).reduce((s, x) => s + x.v, 0);
    if (rest > 0) top.push({ n: 'Nguyên liệu khác', v: rest });
    const kinds = {}; for (const e of draft.extras) kinds[e.kind || 'Chi phí khác'] = (kinds[e.kind || 'Chi phí khác'] || 0) + (Number(e.amount) || 0);
    for (const [k, v] of Object.entries(kinds)) if (v > 0) top.push({ n: k, v });
    const total = c.total || 1;
    const gp = product?.sellingPrice ? ((product.sellingPrice - c.total) / product.sellingPrice) * 100 : null;
    sumBox.append(
      h('div', { class: 'small muted' }, 'Giá thành / phần (' + basis + ')'),
      h('div', { class: 'big mono' }, vnd(c.total)),
      h('div', { class: 'small muted' }, 'Nguyên liệu ' + vnd(c.material) + ' · Chi phí khác ' + vnd(c.extras)),
      h('div', { class: 'small muted' }, 'Khối lượng ' + num(c.weight, 1) + ' g' + (c.perKg ? ' · ' + vnd(c.perKg) + '/kg' : '')),
      gp != null ? h('div', { class: 'small' }, 'Giá bán ' + vnd(product.sellingPrice) + ' → lãi gộp ', h('b', { class: gp < 0 ? 'delta-up' : '' }, num(gp, 1) + '%')) : null,
      h('div', { class: 'barwrap', style: { margin: '10px 0 4px' } }, top.map((p, i) => h('div', { class: 'bar', title: p.n + ': ' + vnd(p.v), style: { width: (p.v / total) * 100 + '%', background: COLORS[i % COLORS.length] } }))),
      h('div', { class: 'legend' }, top.map((p, i) => h('span', {}, h('i', { style: { background: COLORS[i % COLORS.length] } }), p.n + ' ' + num((p.v / total) * 100, 0) + '%'))),
      c.missing.length ? banner('warn', 'Thiếu giá: ' + c.missing.map((l) => l.ing?.name || '(chưa chọn nguyên liệu)').join(', ')) : null,
      h('h4', { style: { margin: '12px 0 4px' } }, 'So sánh loại giá'),
      ...getList('priceTypes').map((t) => { const cc = formulaCost(ctx, draft, t); return h('div', { class: 'row between small' }, h('span', {}, t + (t === basis ? ' (đang dùng)' : '')), h('b', { class: 'mono' }, vnd(cc.total))); }),
      h('h4', { style: { margin: '12px 0 4px' } }, 'Chất lượng'),
      qs.rows.length ? h('div', {}, qs.rows.map((r) => h('div', { class: 'qa-row' }, h('div', { class: 'n' }, r.crit?.name || '(chỉ tiêu đã xóa)'), h('div', { class: 'mono' }, r.value == null ? '—' : num(r.value, r.crit?.decimals ?? 2)), chip(REQ_LABEL[r.status][0], REQ_LABEL[r.status][1]))), qs.rows.some((r) => r.missing.length) ? h('div', { class: 'small muted' }, 'Thiếu dữ liệu chỉ tiêu ở: ' + [...new Set(qs.rows.flatMap((r) => r.missing))].join(', ')) : null) : h('div', { class: 'small muted' }, 'Chưa đặt yêu cầu.'));
  }

  const mbar = h('div', { class: 'mbar' });
  el.append(mbar, h('div', { class: 'split' }, h('div', {}, info, lineCard, extraCard, reqCard), h('div', { class: 'sidecol' }, sumBox)));
  renderLines(); renderExtras(); renderReqs(); refresh();
  window.onbeforeunload = null;

  // ---------- hành động ----------
  async function doSave() {
    const err = validate(); if (err) { toast(err, 'bad'); return; }
    await guard(async () => {
      const toSave = clone(draft);
      toSave.lines = toSave.lines.filter((l) => l.ingId);
      await save('formulas', toSave);
      await refreshSnapshots();
    }, 'Đã lưu công thức');
    rerender();
  }
  function validate() {
    const active = draft.lines.filter((l) => l.ingId);
    if (!active.length) return 'Công thức cần ít nhất một nguyên liệu.';
    const seen = new Set();
    for (const l of active) {
      if (seen.has(l.ingId)) return 'Nguyên liệu "' + (get('ingredients', l.ingId)?.name || '') + '" bị lặp. Hãy gộp thành một dòng.';
      seen.add(l.ingId);
      if (l.qty < 0) return 'Lượng không được âm.';
      if (l.minPct != null && l.maxPct != null && l.minPct > l.maxPct) return 'Min % lớn hơn Max % ở "' + (get('ingredients', l.ingId)?.name || '') + '".';
    }
    const rs = new Set();
    for (const r of draft.reqs) {
      if (!r.critId) return 'Có yêu cầu chất lượng chưa chọn chỉ tiêu.';
      if (rs.has(r.critId)) return 'Chỉ tiêu bị lặp trong yêu cầu chất lượng.';
      rs.add(r.critId);
      if (r.min != null && r.max != null && r.min > r.max) return 'Tối thiểu lớn hơn tối đa ở một chỉ tiêu.';
    }
    if (!draft.variant) return 'Hãy chọn biến thể công thức.';
    return null;
  }
  async function changeStatus(to) {
    if (to === draft.status) return;
    const back = () => { statusSel.value = draft.status; };
    if (dirty) { toast('Hãy lưu thay đổi trước khi đổi trạng thái.', 'bad'); back(); return; }
    if (to === 'Đang sản xuất' && !['admin', 'approver'].includes(S.role)) { toast('Chỉ Quản lý duyệt hoặc Quản trị mới chuyển sang "Đang sản xuất".', 'bad'); back(); return; }
    const f = clone(orig);
    if (to === 'Đang sản xuất') {
      const others = versionsOf(f.productId, f.variant || 'Chuẩn').filter((x) => x.id !== f.id && x.status === 'Đang sản xuất');
      const reqErr = (f.reqs || []).length === 0 ? 'Công thức chưa có yêu cầu chất lượng. ' : '';
      if (!(await confirmBox(reqErr + (others.length ? 'Các phiên bản đang sản xuất khác của biến thể này (' + others.map((o) => 'v' + o.version).join(', ') + ') sẽ chuyển sang "Ngừng dùng". ' : '') + 'Tiếp tục?', { title: 'Đưa vào sản xuất' }))) { back(); return; }
      await guard(async () => {
        for (const o of others) { o.status = 'Ngừng dùng'; await save('formulas', o); }
        f.status = to; f.approvedBy = S.user?.name; f.approvedAt = new Date().toISOString(); f.expiresAt = null;
        await save('formulas', f); await refreshSnapshots();
      }, 'Đã chuyển sang Đang sản xuất');
    } else {
      f.status = to;
      if (to === 'Thử nghiệm' && !f.expiresAt) f.expiresAt = addMonths(new Date().toISOString(), getSettings().trialMonths);
      if (to !== 'Thử nghiệm') f.expiresAt = null;
      await guard(async () => { await save('formulas', f); await refreshSnapshots(); }, 'Đã đổi trạng thái');
    }
    rerender();
  }
  async function newVersion() {
    if (dirty && !(await confirmBox('Có thay đổi chưa lưu. Phiên bản mới sẽ được tạo từ bản đã lưu gần nhất. Tiếp tục?'))) return;
    let reason = ''; let note = '';
    const rs = listSelect({ key: 'changeReasons', value: '', onChange: (v) => (reason = v) });
    const nt = h('textarea', { placeholder: 'Mô tả ngắn thay đổi dự kiến', onInput: (e) => (note = e.target.value) });
    openModal({ title: 'Tạo phiên bản mới', body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Phiên bản mới sao chép từ v' + orig.version + ' và ở trạng thái Nháp.'), field('Lý do thay đổi', rs), field('Ghi chú', nt)),
      actions: [{ label: 'Hủy' }, { label: 'Tạo phiên bản', kind: 'primary', onClick: async () => {
        if (!reason) { toast('Hãy chọn lý do thay đổi.', 'bad'); return false; }
        const max = Math.max(0, ...versionsOf(orig.productId, orig.variant || 'Chuẩn').map((x) => x.version));
        const nf = { ...clone(orig), id: undefined, createdAt: undefined, createdBy: undefined, updatedAt: undefined, version: max + 1, status: 'Nháp', reason, note, parentId: orig.id, approvedBy: null, approvedAt: null, expiresAt: null, fromProposal: null, effectiveFrom: '' };
        nf.lines = nf.lines.map((l) => ({ ...l, id: uid() })); nf.extras = nf.extras.map((e) => ({ ...e, id: uid() }));
        const s = await guard(() => save('formulas', nf), 'Đã tạo phiên bản v' + nf.version);
        if (s) go('#/formula/' + s.id);
      } }] });
  }
  async function duplicateTo() {
    let variant = '';
    const vs = listSelect({ key: 'variants', value: '', onChange: (v) => (variant = v) });
    openModal({ title: 'Nhân bản sang biến thể khác', body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Dùng khi cùng sản phẩm có công thức khác tỷ lệ (theo khách hàng, quy cách…).'), field('Biến thể đích', vs)),
      actions: [{ label: 'Hủy' }, { label: 'Nhân bản', kind: 'primary', onClick: async () => {
        if (!variant) { toast('Hãy chọn biến thể.', 'bad'); return false; }
        const max = Math.max(0, ...versionsOf(orig.productId, variant).map((x) => x.version));
        const nf = { ...clone(orig), id: undefined, createdAt: undefined, createdBy: undefined, updatedAt: undefined, variant, version: max + 1, status: 'Nháp', parentId: orig.id, approvedBy: null, approvedAt: null, expiresAt: null, fromProposal: null, reason: 'Khác', note: 'Nhân bản từ ' + orig.variant + ' v' + orig.version };
        nf.lines = nf.lines.map((l) => ({ ...l, id: uid() })); nf.extras = nf.extras.map((e) => ({ ...e, id: uid() }));
        const s = await guard(() => save('formulas', nf), 'Đã nhân bản');
        if (s) go('#/formula/' + s.id);
      } }] });
  }
  async function del() {
    if (!(await confirmBox('Xóa vĩnh viễn phiên bản nháp này? Thao tác được ghi vào nhật ký.', { danger: true, okLabel: 'Xóa' }))) return;
    await guard(async () => { await remove('formulas', draft.id); await refreshSnapshots(); }, 'Đã xóa');
    go('#/prod/' + draft.productId);
  }
}
