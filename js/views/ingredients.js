import { h, clear, vnd, num, parseNum, normalize, byName, fmtDate, today, uid, clone, signed } from '../util.js';
import { S, all, get, save, remove, can, getList, getSettings } from '../store.js';
import { mkCtx, formulaCost, formulasUsing, latestPrice, refreshSnapshots, fLabel, activeLot } from '../calc.js';
import { UNITS, UNIT_F } from '../defaults.js';
import { openModal, toast, guard, confirmBox, field, textInput, numInput, listSelect, plainSelect, picker, checkbox, chip, tabs, table, empty, banner } from '../ui.js';

let q = '', cat = '';

export async function render(el, _p, { rerender }) {
  const w = can('ingredients', 'w');
  el.append(h('div', { class: 'row between', style: { marginBottom: '10px' } }, h('h1', { style: { margin: 0 } }, 'Nguyên liệu & giá'), w ? h('button', { class: 'btn primary', onClick: () => edit(null, 'info', rerender) }, '＋ Nguyên liệu') : null));
  const ctx = mkCtx(); const st = getSettings();
  const qi = h('input', { type: 'search', placeholder: 'Tìm theo tên, mã, nhà cung cấp…', value: q });
  const cs = listSelect({ key: 'categories', value: cat, placeholder: 'Mọi nhóm', allowAdd: false, onChange: (v) => { cat = v; draw(); } });
  const box = h('div', { class: 'card' });
  el.append(h('div', { class: 'searchbar' }, qi, cs), box);
  qi.addEventListener('input', () => { q = qi.value; draw(); });
  function draw() {
    clear(box);
    let ings = all('ingredients');
    if (cat) ings = ings.filter((i) => i.category === cat);
    const s = normalize(q); if (s) ings = ings.filter((i) => normalize(i.name + ' ' + i.code + ' ' + (i.supplier || '')).includes(s));
    ings.sort((a, b) => byName(a.name, b.name));
    if (!ings.length) { box.append(empty(all('ingredients').length ? 'Không tìm thấy nguyên liệu.' : 'Chưa có nguyên liệu. Bấm "＋ Nguyên liệu" hoặc nhập từ Excel.')); return; }
    box.append(h('div', { class: 'list' }, ings.slice(0, 400).map((i) => {
      const lp = i.bomFormulaId ? null : latestPrice(ctx, i.id, st.defaultBasis);
      const old = lp?.date && (Date.now() - new Date(lp.date)) / 86400000 > st.priceStaleDays;
      return h('div', { class: 'item', onClick: () => edit(i, 'info', rerender) },
        h('div', { class: 'grow' }, h('div', { class: 't1' }, i.name, i.active === false ? chip('Ngừng', 'bad') : null), h('div', { class: 't2' }, [i.code, i.category, i.supplier, i.doseText ? 'liều ' + i.doseText + '%' : ''].filter(Boolean).join(' · '))),
        h('div', { class: 'right' },
          i.bomFormulaId ? h('div', { class: 'muted small' }, 'theo công thức')
            : lp ? h('div', {}, h('div', { class: 'bold mono' }, vnd(lp.price, lp.price < 100 ? 2 : 0) + ' /' + i.priceUnit), h('div', { class: 'small ' + (old ? 'delta-up' : 'muted') }, (lp.fallback ? lp.type + ' · ' : '') + fmtDate(lp.date)))
              : h('div', { class: 'delta-up small bold' }, 'Chưa có giá')),
        can('prices', 'w') ? h('button', { class: 'btn sm', onClick: (e) => { e.stopPropagation(); edit(i, 'price', rerender); } }, 'Giá') : null);
    })));
    if (ings.length > 400) box.append(h('p', { class: 'muted small' }, 'Hiển thị 400 dòng đầu. Hãy lọc để thu hẹp.'));
  }
  draw();
}

// ---------- hộp thoại sửa nguyên liệu ----------
export function edit(orig, startTab, onDone) {
  const d = orig ? clone(orig) : { code: nextCode(), name: '', category: 'Nguyên liệu', supplier: '', priceUnit: 'g', yield: 1, substGroup: '', bomFormulaId: '', stock: null, moq: null, supplyNote: '', lots: [], activeLotId: '', active: true, note: '' };
  let tab = startTab; let changed = false;
  const canEdit = can('ingredients', 'w');
  const m = openModal({ title: orig ? orig.name : 'Nguyên liệu mới', wide: true, body: '', onClose: () => { if (changed) onDone?.(); } });
  const draw = () => {
    const body = [];
    if (orig) body.push(tabs([['info', 'Thông tin'], ['price', 'Giá'], ['spec', 'Chỉ tiêu']], tab, (k) => { tab = k; draw(); }));
    if (tab === 'info') body.push(infoTab());
    else if (tab === 'price') body.push(priceTab());
    else body.push(specTab());
    m.setBody(body);
    m.setActions(tab === 'info' && canEdit ? [
      orig ? { label: 'Xóa', kind: 'danger', onClick: del, keepOpen: true } : null,
      { label: 'Đóng' },
      { label: 'Lưu', kind: 'primary', onClick: async () => { if (!validate()) return false; const wasNew = !orig; const s = await guard(() => save('ingredients', d), 'Đã lưu nguyên liệu'); if (!s) return false; orig = s; Object.assign(d, s); changed = true; if (wasNew) { tab = 'price'; draw(); return false; } } },
    ].filter(Boolean) : [{ label: 'Đóng' }]);
  };
  function validate() {
    if (!d.code.trim() || !d.name.trim()) { toast('Hãy nhập mã và tên nguyên liệu.', 'bad'); return false; }
    if (all('ingredients').some((x) => x.id !== d.id && x.code.trim().toLowerCase() === d.code.trim().toLowerCase())) { toast('Mã nguyên liệu đã tồn tại.', 'bad'); return false; }
    d.code = d.code.trim(); d.name = d.name.trim(); return true;
  }
  async function del() {
    const used = all('formulas').filter((f) => (f.lines || []).some((l) => l.ingId === d.id));
    if (used.length) { toast('Nguyên liệu đang dùng trong ' + used.length + ' công thức. Hãy bỏ chọn "Đang sử dụng" thay vì xóa.', 'bad'); return; }
    if (!(await confirmBox('Xóa nguyên liệu "' + d.name + '" và lịch sử giá của nó?', { danger: true, okLabel: 'Xóa' }))) return;
    await guard(async () => { for (const p of all('prices').filter((x) => x.ingId === d.id)) await remove('prices', p.id); await remove('ingredients', d.id); }, 'Đã xóa');
    changed = true; m.close();
  }
  function infoTab() {
    const bomWrap = h('div', {});
    const paintBom = () => {
      clear(bomWrap);
      if (d.category === 'Bán thành phẩm') {
        const ctx = mkCtx();
        const opts = all('formulas').filter((f) => f.id !== d.id).map((f) => ({ value: f.id, label: fLabel(ctx, f), sub: f.status }));
        bomWrap.append(field('Công thức tạo ra bán thành phẩm này', picker({ options: opts, value: d.bomFormulaId, placeholder: 'Chọn công thức…', title: 'Công thức bán thành phẩm', allowEmpty: true, onChange: (v) => (d.bomFormulaId = v) }), 'Giá/gam bán thành phẩm = giá thành công thức ÷ khối lượng công thức.'));
      } else d.bomFormulaId = '';
    };
    paintBom();
    return h('div', { class: 'stack' },
      h('div', { class: 'grid3' },
        field('Mã (theo WMS) *', textInput({ value: d.code, onInput: (v) => (d.code = v), readOnly: !canEdit }), 'Mã mở rộng đuôi để phân nhánh nhà cung cấp/chất lượng'),
        field('Tên nguyên liệu *', textInput({ value: d.name, onInput: (v) => (d.name = v), readOnly: !canEdit })),
        field('Nhóm', listSelect({ key: 'categories', value: d.category, onChange: (v) => { d.category = v; paintBom(); }, disabled: !canEdit }))),
      bomWrap,
      h('div', { class: 'grid3' },
        field('Nhà cung cấp', listSelect({ key: 'suppliers', value: d.supplier, onChange: (v) => (d.supplier = v), disabled: !canEdit })),
        field('Đơn vị của giá', plainSelect({ items: UNITS, value: d.priceUnit, onChange: (v) => (d.priceUnit = v) }), 'Giá tính theo đơn vị này (vd g). Công thức nhập lượng theo gam'),
        field('Định mức mặc định (yield)', numInput({ value: d.yield, onInput: (v) => (d.yield = v ?? 1), readOnly: !canEdit }), 'Nguyên liệu thô = lượng dùng × định mức')),
      h('div', { class: 'grid3' },
        field('Nhóm thay thế', listSelect({ key: 'substGroups', value: d.substGroup, onChange: (v) => (d.substGroup = v), disabled: !canEdit }), 'Tối ưu có thể đề xuất đổi trong cùng nhóm (cần test lại)'),
        field('Tồn kho (g)', numInput({ value: d.stock, onInput: (v) => (d.stock = v), readOnly: !canEdit })),
        field('Số lượng đặt tối thiểu', numInput({ value: d.moq, onInput: (v) => (d.moq = v), readOnly: !canEdit }))),
      h('div', { class: 'grid2' },
        field('Liều sử dụng tối thiểu (% khối lượng công thức)', numInput({ value: d.doseMin, onInput: (v) => (d.doseMin = v), readOnly: !canEdit }), 'Để trống = không giới hạn dưới'),
        field('Liều sử dụng tối đa (%)', numInput({ value: d.doseMax, onInput: (v) => (d.doseMax = v), readOnly: !canEdit }), 'Làm giới hạn mặc định khi tối ưu và cảnh báo trong công thức')),
      field('Giới hạn nguồn cung / ghi chú', textInput({ value: d.supplyNote, onInput: (v) => (d.supplyNote = v), readOnly: !canEdit })),
      checkbox('Đang sử dụng (bỏ chọn để ẩn khỏi danh sách chọn)', d.active !== false, (v) => (d.active = v)),
      field('Ghi chú', Object.assign(h('textarea', { readOnly: !canEdit, onInput: (e) => (d.note = e.target.value) }), { value: d.note || '' })));
  }
  function priceTab() {
    const ctx = mkCtx(); const st = getSettings();
    const unit = d.priceUnit;
    const hist = all('prices').filter((p) => p.ingId === d.id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const types = getList('priceTypes');
    const latest = types.map((t) => hist.find((p) => p.type === t)).filter(Boolean);
    const np = { price: null, type: st.defaultBasis, date: today(), source: '', note: '' };
    const wrap = h('div', { class: 'stack' });
    wrap.append(h('div', { class: 'card flat' }, h('h3', {}, 'Giá hiện hành, chưa VAT (đ/' + unit + ')'),
      latest.length ? h('div', { class: 'row' }, latest.map((p) => h('div', { class: 'kpi', style: { minWidth: '150px' } }, h('div', { class: 'v mono', style: { fontSize: '19px' } }, vnd(p.price, p.price < 100 ? 2 : 0)), h('div', { class: 'l' }, p.type + ' · ' + fmtDate(p.date))))) : h('div', { class: 'muted' }, 'Chưa có giá.')));
    if (can('prices', 'w')) {
      const priceIn = numInput({ value: null, onInput: (v) => (np.price = v), placeholder: 'VD: 18000' });
      wrap.append(h('div', { class: 'card flat' }, h('h3', {}, 'Thêm / cập nhật giá'),
        h('div', { class: 'grid3' }, field('Giá chưa VAT mới (đ/' + unit + ')', priceIn), field('Loại giá', listSelect({ key: 'priceTypes', value: np.type, onChange: (v) => (np.type = v), allowAdd: false })), field('Có hiệu lực từ', Object.assign(h('input', { type: 'date', onChange: (e) => (np.date = e.target.value) }), { value: np.date }))),
        h('div', { class: 'grid2', style: { marginTop: '8px' } }, field('Nguồn (báo giá, hợp đồng, ước tính…)', textInput({ value: '', onInput: (v) => (np.source = v) })), field('Ghi chú', textInput({ value: '', onInput: (v) => (np.note = v) }))),
        h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onClick: async () => {
          if (np.price == null || np.price < 0) { toast('Hãy nhập giá hợp lệ.', 'bad'); return; }
          if (!np.type) { toast('Hãy chọn loại giá.', 'bad'); return; }
          const prev = hist.find((p) => p.type === np.type);
          if (prev && prev.price > 0 && Math.abs(np.price - prev.price) / prev.price > 0.3 && !(await confirmBox('Giá mới lệch ' + num(((np.price - prev.price) / prev.price) * 100, 0) + '% so với giá trước (' + vnd(prev.price) + '). Vẫn lưu?'))) return;
          await savePrice(d, np);
          changed = true; draw();
        } }, 'Lưu giá'))));
    }
    wrap.append(h('div', { class: 'card flat' }, h('h3', {}, 'Lịch sử giá'),
      hist.length ? table(['Ngày', 'Loại', ['Giá', 'num'], 'Nguồn', 'Người nhập', ''], hist.map((p, i) => [fmtDate(p.date), chip(p.type), vnd(p.price, p.price < 100 ? 2 : 0), p.source || '', p.createdBy || '', can('prices', 'w') ? h('button', { class: 'btn sm danger', onClick: async () => { if (await confirmBox('Xóa dòng giá này?', { danger: true })) { await guard(() => remove('prices', p.id), 'Đã xóa'); await refreshSnapshots(); changed = true; draw(); } } }, '✕') : ''])) : h('div', { class: 'muted' }, 'Chưa có lịch sử.')));
    return wrap;
  }
  function specTab() {
    const crits = all('criteria').filter((c) => c.additive);
    const canS = can('ingredients', 'w');
    if (!crits.length) return empty('Chưa có chỉ tiêu cộng theo tỷ lệ. Hãy tạo ở mục "Chỉ tiêu chất lượng".');
    d.lots ||= [];
    let lot = d.lots.find((l) => l.id === d.activeLotId) || d.lots[d.lots.length - 1];
    const wrap = h('div', { class: 'stack' });
    const lotSel = h('select', {}, d.lots.map((l) => h('option', { value: l.id }, (l.lot || 'Lô') + (l.date ? ' · ' + fmtDate(l.date) : '') + (l.id === d.activeLotId ? ' (đang dùng)' : ''))));
    if (lot) lotSel.value = lot.id;
    lotSel.addEventListener('change', () => { lot = d.lots.find((l) => l.id === lotSel.value); draw(); });
    wrap.append(h('div', { class: 'row' }, d.lots.length ? lotSel : h('span', { class: 'muted' }, 'Chưa có lô dữ liệu.'), canS ? h('button', { class: 'btn sm', onClick: () => { const l = { id: uid(), lot: 'Lô ' + (d.lots.length + 1), date: today(), source: '', values: {} }; d.lots.push(l); if (!d.activeLotId) d.activeLotId = l.id; lot = l; draw(); } }, '＋ Lô mới') : null));
    if (lot) {
      wrap.append(h('div', { class: 'grid3' },
        field('Mã lô / tên lô', textInput({ value: lot.lot, onInput: (v) => (lot.lot = v), readOnly: !canS })),
        field('Ngày', Object.assign(h('input', { type: 'date', readOnly: !canS, onChange: (e) => (lot.date = e.target.value) }), { value: lot.date || '' })),
        field('Nguồn dữ liệu', listSelect({ key: 'specSources', value: lot.source, onChange: (v) => (lot.source = v), disabled: !canS }))));
      wrap.append(h('div', { class: 'grid2' }, crits.map((c) => field(c.name + (c.unit ? ' (' + c.unit + '/100 g)' : ''), numInput({ value: lot.values?.[c.id], readOnly: !canS, onInput: (v) => { lot.values ||= {}; if (v == null) delete lot.values[c.id]; else lot.values[c.id] = v; } })))));
      if (canS) wrap.append(h('div', { class: 'row' },
        checkbox('Dùng lô này để tính chất lượng', d.activeLotId === lot.id, (v) => { if (v) d.activeLotId = lot.id; }),
        h('button', { class: 'btn danger sm', onClick: () => { d.lots = d.lots.filter((l) => l !== lot); if (d.activeLotId === lot.id) d.activeLotId = d.lots[d.lots.length - 1]?.id || ''; draw(); } }, 'Xóa lô'),
        h('button', { class: 'btn primary', onClick: async () => { const s = await guard(() => save('ingredients', d), 'Đã lưu chỉ tiêu nguyên liệu'); if (s) { changed = true; Object.assign(d, s); } } }, 'Lưu chỉ tiêu')));
    } else wrap.append(h('div', { class: 'muted' }, 'Mỗi lô nguyên liệu có thể có hàm lượng khác nhau; tạo lô và chọn lô đang dùng.'));
    return wrap;
  }
  draw();
}

function nextCode() {
  const nums = all('ingredients').map((i) => /^NL(\d+)$/.exec(i.code)).filter(Boolean).map((m) => +m[1]);
  return 'NL' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}

// Lưu giá mới rồi gợi ý các công thức bị ảnh hưởng để người dùng chọn tính lại
export async function savePrice(ing, np) {
  const before = new Map(); const ctxB = mkCtx(); const basis = getSettings().defaultBasis;
  const affected = formulasUsing(ing.id, ctxB);
  for (const f of affected) before.set(f.id, formulaCost(ctxB, f, basis).total);
  const rec = await guard(() => save('prices', { ingId: ing.id, price: np.price, type: np.type, date: np.date, source: np.source, note: np.note }), 'Đã lưu giá');
  if (!rec) return;
  if (!affected.length) { await refreshSnapshots(); return; }
  const ctxA = mkCtx();
  const rows = affected.map((f) => ({ f, a: before.get(f.id), b: formulaCost(ctxA, f, basis).total })).filter((r) => Math.abs(r.a - r.b) > 0.005);
  if (!rows.length) { await refreshSnapshots(); return; }
  const picked = new Set(rows.map((r) => r.f.id));
  await new Promise((resolve) => {
    openModal({
      title: 'Giá đổi ảnh hưởng ' + rows.length + ' công thức', onClose: resolve, wide: true,
      body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Chọn công thức muốn cập nhật lại giá thành (các công thức không chọn giữ giá thành cũ trong báo cáo).'),
        table(['', 'Công thức', ['Trước', 'num'], ['Sau', 'num'], ['Chênh', 'num']], rows.map((r) => [
          (() => { const c = h('input', { type: 'checkbox', checked: true }); c.addEventListener('change', () => (c.checked ? picked.add(r.f.id) : picked.delete(r.f.id))); return c; })(),
          fLabel(ctxA, r.f), vnd(r.a), vnd(r.b), h('span', { class: r.b > r.a ? 'delta-up' : 'delta-down' }, signed(r.b - r.a, 0) + ' đ (' + signed(((r.b - r.a) / r.a) * 100, 1) + '%)')]))),
      actions: [{ label: 'Để sau' }, { label: 'Cập nhật giá thành đã chọn', kind: 'primary', onClick: async () => { await guard(() => refreshSnapshots(picked), 'Đã cập nhật giá thành'); } }],
    });
  });
}
