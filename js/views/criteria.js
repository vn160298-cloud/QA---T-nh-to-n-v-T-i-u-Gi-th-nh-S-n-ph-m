import { h, clear, num, parseNum, uid, today, byName, normalize } from '../util.js';
import { all, get, save, remove, can, getList } from '../store.js';
import { activeLot } from '../calc.js';
import { openModal, toast, guard, confirmBox, field, listSelect, textInput, numInput, checkbox, chip, tabs, table, empty, banner } from '../ui.js';

let tab = 'list';

// Hộp thoại tạo/sửa chỉ tiêu. Trả về Promise<chỉ tiêu | null>
export function quickCriterion(existing) {
  return new Promise((resolve) => {
    const c = existing ? { ...existing } : { name: '', unit: '%', additive: true, decimals: 2, tol: null, standard: 'Nội bộ', note: '' };
    let saved = null;
    const m = openModal({
      title: existing ? 'Sửa chỉ tiêu' : 'Chỉ tiêu chất lượng mới',
      onClose: () => resolve(saved),
      body: h('div', { class: 'stack' },
        field('Tên chỉ tiêu *', textInput({ value: c.name, placeholder: 'VD: Đạm, Béo, Độ ẩm, Brix…', onInput: (v) => (c.name = v) })),
        h('div', { class: 'grid2' },
          field('Đơn vị', listSelect({ key: 'critUnits', value: c.unit, onChange: (v) => (c.unit = v) })),
          field('Chuẩn áp dụng', listSelect({ key: 'critStandards', value: c.standard, onChange: (v) => (c.standard = v) }))),
        h('div', { class: 'grid2' },
          field('Số chữ số thập phân khi hiển thị', numInput({ value: c.decimals, onInput: (v) => (c.decimals = v ?? 2) })),
          field('Dung sai mặc định (±)', numInput({ value: c.tol, onInput: (v) => (c.tol = v) }), 'Tự điền khi thêm vào yêu cầu công thức')),
        checkbox('Cộng theo tỷ lệ nguyên liệu (dùng được cho tối ưu)', c.additive, (v) => (c.additive = v)),
        h('div', { class: 'small muted' }, 'Bỏ chọn cho chỉ tiêu không cộng được (cảm quan, độ nhớt, màu, mùi…): app chỉ kiểm tra theo kết quả đo thực tế, không đưa vào tối ưu.'),
        field('Ghi chú', Object.assign(h('textarea', { onInput: (e) => (c.note = e.target.value) }), { value: c.note || '' }))),
      actions: [{ label: 'Hủy' }, { label: 'Lưu chỉ tiêu', kind: 'primary', onClick: async () => {
        if (!c.name.trim()) { toast('Hãy nhập tên chỉ tiêu.', 'bad'); return false; }
        if (all('criteria').some((x) => x.id !== c.id && x.name.trim().toLowerCase() === c.name.trim().toLowerCase())) { toast('Đã có chỉ tiêu trùng tên.', 'bad'); return false; }
        c.name = c.name.trim(); delete c.demo;
        saved = await guard(() => save('criteria', c), 'Đã lưu chỉ tiêu');
        if (!saved) return false;
      } }],
    });
  });
}

export async function render(el, _p, { rerender }) {
  const can_w = can('criteria', 'w');
  el.append(h('h1', {}, 'Chỉ tiêu chất lượng'));
  el.append(tabs([['list', 'Danh sách chỉ tiêu'], ['matrix', 'Bảng hàm lượng nguyên liệu']], tab, (k) => { tab = k; rerender(); }));
  const crits = all('criteria').sort((a, b) => byName(a.name, b.name));
  if (tab === 'list') {
    el.append(h('div', { class: 'row between', style: { marginBottom: '10px' } }, h('p', { class: 'muted', style: { margin: 0 } }, 'Tự điền và điều chỉnh các chỉ tiêu, đơn vị, dung sai. Giới hạn từng sản phẩm đặt trong từng công thức.'), can_w ? h('button', { class: 'btn primary', onClick: async () => { if (await quickCriterion()) rerender(); } }, '＋ Chỉ tiêu mới') : null));
    if (crits.some((c) => c.demo)) el.append(banner('warn', 'Các chỉ tiêu có nhãn "Minh họa" và giá trị hàm lượng đi kèm chỉ là dữ liệu mẫu để thử tối ưu. Hãy sửa hoặc xóa, rồi nhập số liệu thật từ phiếu kiểm nghiệm.'));
    if (!crits.length) { el.append(h('div', { class: 'card' }, empty('Chưa có chỉ tiêu nào.'))); return; }
    el.append(h('div', { class: 'card' }, table(['Chỉ tiêu', 'Đơn vị', 'Loại', 'Dung sai mặc định', 'Chuẩn', ''], crits.map((c) => ({ data: c, cells: [h('b', {}, c.name, c.demo ? chip('Minh họa', 'warn') : null), c.unit || '', c.additive ? chip('Cộng theo tỷ lệ', 'pri') : chip('Kiểm tra thủ công'), c.tol != null ? '± ' + num(c.tol) : '—', c.standard || '', can_w ? h('div', { class: 'row' }, h('button', { class: 'btn sm', onClick: async () => { if (await quickCriterion(c)) rerender(); } }, 'Sửa'), h('button', { class: 'btn sm danger', onClick: () => del(c) }, 'Xóa')) : ''] })))));
    return;
  }
  // ---- bảng hàm lượng ----
  const addc = crits.filter((c) => c.additive);
  if (!addc.length) { el.append(h('div', { class: 'card' }, empty('Chưa có chỉ tiêu "cộng theo tỷ lệ". Hãy tạo ở tab Danh sách.'))); return; }
  el.append(h('p', { class: 'muted' }, 'Nhập hàm lượng mỗi chỉ tiêu cho 100 g nguyên liệu (theo lô đang dùng). Ô để trống = chưa có dữ liệu. Muốn quản lý nhiều lô, mở nguyên liệu → tab Chỉ tiêu.'));
  const q = h('input', { type: 'search', placeholder: 'Tìm nguyên liệu…' });
  const cat = listSelect({ key: 'categories', value: '', placeholder: 'Mọi nhóm', allowAdd: false, onChange: () => draw() });
  const only = checkbox('Chỉ nguyên liệu đang dùng trong công thức', true, () => draw());
  const box = h('div', { class: 'card' });
  el.append(h('div', { class: 'searchbar' }, q, cat), only, box);
  q.addEventListener('input', draw);
  function draw() {
    const used = new Set(all('formulas').flatMap((f) => (f.lines || []).map((l) => l.ingId)));
    const onlyUsed = only.querySelector('input').checked;
    let ings = all('ingredients').filter((i) => !i.bomFormulaId && ['kg', 'g', 'lít', 'ml'].includes(i.priceUnit));
    if (onlyUsed) ings = ings.filter((i) => used.has(i.id));
    if (cat.value) ings = ings.filter((i) => i.category === cat.value);
    const s = normalize(q.value); if (s) ings = ings.filter((i) => normalize(i.name + ' ' + i.code).includes(s));
    ings.sort((a, b) => byName(a.name, b.name));
    clear(box);
    if (!ings.length) { box.append(empty('Không có nguyên liệu phù hợp.')); return; }
    const head = [['Nguyên liệu', ''], ...addc.map((c) => [c.name + (c.unit ? ' (' + c.unit + ')' : ''), 'num'])];
    const rows = ings.map((i) => [h('div', {}, h('b', {}, i.name), h('div', { class: 'small muted' }, i.code)), ...addc.map((c) => {
      const lot = activeLot(i); const v = lot?.values?.[c.id];
      const inp = h('input', { type: 'text', inputmode: 'decimal', style: { width: '84px', textAlign: 'right' }, disabled: !can('ingredients', 'w'), 'aria-label': i.name + ' ' + c.name });
      inp.value = v == null || v === '' ? '' : String(v).replace('.', ',');
      inp.addEventListener('change', async () => {
        const val = parseNum(inp.value);
        const fresh = JSON.parse(JSON.stringify(get('ingredients', i.id)));
        fresh.lots ||= [];
        let l = fresh.lots.find((x) => x.id === fresh.activeLotId) || fresh.lots[fresh.lots.length - 1];
        if (!l) { l = { id: uid(), lot: 'Mặc định', date: today(), source: 'Giá trị nội bộ', values: {} }; fresh.lots.push(l); }
        fresh.activeLotId = l.id; l.values ||= {};
        if (val == null) delete l.values[c.id]; else l.values[c.id] = val;
        await guard(() => save('ingredients', fresh));
      });
      return inp;
    })]);
    box.append(table(head, rows));
  }
  draw();
}

async function del(c) {
  const used = all('formulas').filter((f) => (f.reqs || []).some((r) => r.critId === c.id));
  if (used.length) { toast('Chỉ tiêu đang được dùng trong ' + used.length + ' công thức. Hãy gỡ khỏi công thức trước.', 'bad'); return; }
  if (!(await confirmBox('Xóa chỉ tiêu "' + c.name + '"? Hàm lượng đã nhập của nguyên liệu sẽ không còn được dùng.', { danger: true, okLabel: 'Xóa' }))) return;
  await guard(() => remove('criteria', c.id), 'Đã xóa');
  location.hash = '#/crit'; window.dispatchEvent(new HashChangeEvent('hashchange'));
}
