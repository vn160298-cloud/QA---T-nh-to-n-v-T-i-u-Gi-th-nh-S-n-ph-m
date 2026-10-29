import { h, clear, vnd, num, parseNum, normalize, byName, fmtDate, uid } from '../util.js';
import { S, all, get, save, remove, can, getSettings } from '../store.js';
import { mkCtx, formulaCost, qualitySummary, versionsOf, refreshSnapshots } from '../calc.js';
import { openModal, toast, guard, confirmBox, field, textInput, numInput, listSelect, statusChip, chip, go, empty, banner, table } from '../ui.js';
import { qBadge } from './dashboard.js';

export async function render(el, id, ctxv) {
  if (id) return detail(el, id, ctxv);
  return list(el, ctxv);
}

function productForm(p) {
  return new Promise((resolve) => {
    const d = p ? { ...p } : { code: '', name: '', nameVN: '', group: '', sellingPrice: null, note: '' };
    let saved = null;
    openModal({
      title: p ? 'Sửa sản phẩm' : 'Sản phẩm mới', onClose: () => resolve(saved),
      body: h('div', { class: 'stack' },
        h('div', { class: 'grid2' }, field('Mã sản phẩm *', textInput({ value: d.code, onInput: (v) => (d.code = v) })), field('Nhóm sản phẩm', listSelect({ key: 'productGroups', value: d.group, onChange: (v) => (d.group = v) }))),
        field('Tên sản phẩm *', textInput({ value: d.name, onInput: (v) => (d.name = v) })),
        field('Tên tiếng Việt / tên khác', textInput({ value: d.nameVN, onInput: (v) => (d.nameVN = v) })),
        field('Giá bán (đ/phần, tùy chọn)', numInput({ value: d.sellingPrice, onInput: (v) => (d.sellingPrice = v) }), 'Dùng để tính lãi gộp'),
        field('Ghi chú', Object.assign(h('textarea', { onInput: (e) => (d.note = e.target.value) }), { value: d.note || '' }))),
      actions: [{ label: 'Hủy' }, { label: 'Lưu', kind: 'primary', onClick: async () => {
        if (!d.code.trim() || !d.name.trim()) { toast('Hãy nhập mã và tên sản phẩm.', 'bad'); return false; }
        if (all('products').some((x) => x.id !== d.id && x.code.trim().toLowerCase() === d.code.trim().toLowerCase())) { toast('Mã sản phẩm đã tồn tại.', 'bad'); return false; }
        d.code = d.code.trim(); d.name = d.name.trim();
        saved = await guard(() => save('products', d), 'Đã lưu sản phẩm'); if (!saved) return false;
      } }],
    });
  });
}

async function list(el, { rerender }) {
  const ctx = mkCtx(); const basis = getSettings().defaultBasis;
  const canAdd = can('products', 'w');
  el.append(h('div', { class: 'row between', style: { marginBottom: '10px' } }, h('h1', { style: { margin: 0 } }, 'Sản phẩm & công thức'), canAdd ? h('button', { class: 'btn primary', onClick: async () => { const p = await productForm(); if (p) go('#/prod/' + p.id); } }, '＋ Sản phẩm') : null));
  const expired = all('formulas').filter((f) => f.status === 'Thử nghiệm' && f.expiresAt && new Date(f.expiresAt) < new Date());
  if (expired.length) el.append(banner('warn', h('span', {}, '⏳ ' + expired.length + ' công thức thử nghiệm đã quá hạn lưu ' + getSettings().trialMonths + ' tháng. '), can('formulas', 'w') && S.role === 'admin' ? h('button', { class: 'btn sm', onClick: async () => { if (await confirmBox('Chuyển ' + expired.length + ' công thức thử nghiệm quá hạn sang "Ngừng dùng"?')) { await guard(async () => { for (const f of expired) await save('formulas', { ...f, status: 'Ngừng dùng' }); await refreshSnapshots(); }, 'Đã xử lý'); rerender(); } } }, 'Chuyển sang Ngừng dùng') : null));
  const q = h('input', { type: 'search', placeholder: 'Tìm sản phẩm theo tên, mã…' });
  const grp = listSelect({ key: 'productGroups', value: '', placeholder: 'Mọi nhóm', allowAdd: false, onChange: () => draw() });
  const box = h('div', {});
  el.append(h('div', { class: 'searchbar' }, q, grp), box);
  q.addEventListener('input', draw);
  function draw() {
    clear(box);
    let ps = all('products');
    if (grp.value) ps = ps.filter((p) => p.group === grp.value);
    const s = normalize(q.value); if (s) ps = ps.filter((p) => normalize(p.name + ' ' + p.code + ' ' + (p.nameVN || '')).includes(s));
    ps.sort((a, b) => byName(a.name, b.name));
    if (!ps.length) { box.append(h('div', { class: 'card' }, empty(all('products').length ? 'Không tìm thấy sản phẩm.' : 'Chưa có sản phẩm. Bấm "＋ Sản phẩm" hoặc nhập từ Excel.'))); return; }
    box.append(h('div', { class: 'card' }, h('div', { class: 'list' }, ps.map((p) => {
      const fs = versionsOf(p.id);
      const prod = fs.filter((f) => f.status === 'Đang sản xuất');
      const best = prod[0] || fs[0];
      const c = best ? formulaCost(ctx, best, basis) : null;
      return h('div', { class: 'item', onClick: () => go('#/prod/' + p.id) },
        h('div', { class: 'grow' }, h('div', { class: 't1' }, p.name), h('div', { class: 't2' }, [p.code, p.group, fs.length + ' phiên bản'].filter(Boolean).join(' · '))),
        h('div', { class: 'right' }, c ? h('div', { class: 'bold mono' }, vnd(c.total)) : h('span', { class: 'muted' }, '—'), best ? statusChip(best.status) : null));
    }))));
  }
  draw();
}

async function detail(el, id, { rerender }) {
  const p = get('products', id);
  if (!p) { el.append(banner('bad', 'Không tìm thấy sản phẩm.'), h('a', { href: '#/prod', class: 'btn' }, '← Danh sách')); return; }
  const ctx = mkCtx(); const basis = getSettings().defaultBasis;
  const fs = versionsOf(p.id);
  const w = can('products', 'w'), wf = can('formulas', 'w');
  el.append(
    h('a', { href: '#/prod' }, '← Sản phẩm'),
    h('div', { class: 'row between', style: { margin: '6px 0 10px' } }, h('div', {}, h('h1', { style: { margin: 0 } }, p.name), h('div', { class: 'muted' }, [p.code, p.nameVN, p.group].filter(Boolean).join(' · '))),
      h('div', { class: 'row' }, w ? h('button', { class: 'btn', onClick: async () => { if (await productForm(p)) rerender(); } }, 'Sửa') : null,
        w ? h('button', { class: 'btn danger', onClick: async () => {
          if (fs.length) { toast('Sản phẩm đã có công thức. Hãy chuyển các công thức sang "Ngừng dùng" thay vì xóa.', 'bad'); return; }
          if (await confirmBox('Xóa sản phẩm "' + p.name + '"?', { danger: true, okLabel: 'Xóa' })) { await guard(() => remove('products', p.id), 'Đã xóa'); go('#/prod'); }
        } }, 'Xóa') : null)),
    p.sellingPrice ? h('div', { class: 'muted small' }, 'Giá bán: ' + vnd(p.sellingPrice)) : null);
  const variants = [...new Set(fs.map((f) => f.variant || 'Chuẩn'))];
  el.append(h('div', { class: 'row between', style: { margin: '10px 0' } }, h('h2', { style: { margin: 0 } }, 'Công thức'), wf ? h('button', { class: 'btn primary', onClick: () => newFormula(p) }, '＋ Công thức mới') : null));
  if (!fs.length) { el.append(h('div', { class: 'card' }, empty('Sản phẩm chưa có công thức.'))); return; }
  for (const v of variants) {
    const vs = fs.filter((f) => (f.variant || 'Chuẩn') === v);
    el.append(h('div', { class: 'card' }, h('h3', {}, 'Biến thể: ' + v),
      table(['Phiên bản', 'Trạng thái', ['Giá thành/phần', 'num'], 'Chất lượng', 'Lý do / ghi chú', 'Cập nhật'], vs.map((f) => {
        const c = formulaCost(ctx, f, basis); const q = qualitySummary(ctx, f, c);
        return { data: f, cells: [h('b', {}, 'v' + f.version), statusChip(f.status), vnd(c.total) + (c.missing.length ? ' ⚠' : ''), qBadge(q.overall), [f.reason, f.note].filter(Boolean).join(' — ').slice(0, 70), fmtDate(f.updatedAt)] };
      }), { onRow: (f) => go('#/formula/' + f.id) })));
  }
}

async function newFormula(p) {
  let variant = '';
  const sel = listSelect({ key: 'variants', value: 'Chuẩn', onChange: (v) => (variant = v) }); variant = 'Chuẩn';
  openModal({ title: 'Công thức mới', body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Tạo công thức trống (phiên bản v1, trạng thái Nháp). Muốn đổi công thức đã có, hãy mở nó rồi chọn "Phiên bản mới".'), field('Biến thể', sel)),
    actions: [{ label: 'Hủy' }, { label: 'Tạo', kind: 'primary', onClick: async () => {
      if (!variant) { toast('Hãy chọn biến thể.', 'bad'); return false; }
      const max = Math.max(0, ...versionsOf(p.id, variant).map((x) => x.version));
      const f = { productId: p.id, variant, version: max + 1, status: 'Nháp', reason: 'Phát triển sản phẩm mới', note: '', lines: [], extras: [], reqs: [] };
      const s = await guard(() => save('formulas', f), 'Đã tạo công thức');
      if (s) go('#/formula/' + s.id);
    } }] });
}
