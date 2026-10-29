import { h, clear, vnd, num, pct, signed, parseNum, nowIso } from '../util.js';
import { S, all, get, save, can, getList, getSettings } from '../store.js';
import { mkCtx, formulaCost, fLabel, REQ_LABEL } from '../calc.js';
import { runOptimization, altToLines } from '../optimize.js';
import { openModal, toast, guard, field, numInput, plainSelect, picker, checkbox, chip, statusChip, go, empty, banner, table, listSelect } from '../ui.js';

const state = new Map(); // formulaId -> {opts, result}

export async function render(el, id, { rerender }) {
  el.append(h('h1', {}, 'Tối ưu công thức'));
  const ctx = mkCtx();
  const forms = all('formulas').filter((f) => f.status !== 'Ngừng dùng' && ctx.products.get(f.productId));
  if (!forms.length) { el.append(h('div', { class: 'card' }, empty('Chưa có công thức nào để tối ưu.'))); return; }
  el.append(h('div', { class: 'card' }, field('Công thức cần tối ưu', picker({
    options: forms.map((f) => ({ value: f.id, label: fLabel(ctx, f), sub: f.status })), value: id || '', placeholder: 'Chọn công thức…', title: 'Chọn công thức', onChange: (v) => go('#/opt/' + v),
  }))));
  const f = id && get('formulas', id);
  if (!f) { el.append(h('p', { class: 'muted' }, 'Chọn một công thức để bộ tối ưu tìm phương án chi phí thấp hơn trong giới hạn chất lượng đã đặt.')); return; }

  const st = getSettings();
  const s = state.get(id) || { opts: { objective: 'cheapest', maxChangePct: st.maxChangePct, basis: st.defaultBasis, allowSubs: false, subMaxPct: st.subMaxPct, fixed: [] }, result: null };
  state.set(id, s);
  const o = s.opts;
  const cur = formulaCost(ctx, f, o.basis);
  const noReq = !(f.reqs || []).some((r) => (r.min != null || r.max != null) && ctx.criteria.find((c) => c.id === r.critId)?.additive);

  const lockBox = h('div', { class: 'stack' }, f.lines.filter((l) => l.ingId).map((l) => {
    const ing = ctx.ing.get(l.ingId);
    return checkbox((ing?.name || '?') + (l.fixed ? ' (đã khóa trong công thức)' : ''), l.fixed || o.fixed.includes(l.ingId), (v) => { o.fixed = v ? [...new Set([...o.fixed, l.ingId])] : o.fixed.filter((x) => x !== l.ingId); });
  }));
  el.append(h('div', { class: 'card' }, h('h3', {}, 'Thiết lập'),
    h('p', { class: 'muted small' }, 'Công thức hiện tại: giá thành ' + vnd(cur.total) + '/phần (' + o.basis + '). Bộ tối ưu giữ tổng khối lượng, đổi lượng từng nguyên liệu để giảm chi phí mà chỉ tiêu vẫn nằm trong yêu cầu.'),
    noReq ? banner('warn', 'Công thức chưa có yêu cầu chất lượng "cộng theo tỷ lệ" nên bộ tối ưu chỉ bị giới hạn bởi mức thay đổi. Hãy đặt yêu cầu trong công thức để kết quả an toàn hơn.') : null,
    h('div', { class: 'grid3' },
      field('Mục tiêu (phương án hiển thị đầu)', plainSelect({ items: [['cheapest', 'Giá thấp nhất'], ['safe', 'Cân bằng giá và độ dư chất lượng'], ['minchange', 'Ít thay đổi so với hiện tại']], value: o.objective, onChange: (v) => (o.objective = v) })),
      field('Thay đổi tối đa mỗi nguyên liệu (± %)', numInput({ value: o.maxChangePct, onInput: (v) => (o.maxChangePct = v ?? st.maxChangePct) }), 'So với lượng hiện tại'),
      field('Loại giá dùng', listSelect({ key: 'priceTypes', value: o.basis, allowAdd: false, onChange: (v) => (o.basis = v || st.defaultBasis) }))),
    h('div', { class: 'grid2', style: { marginTop: '10px' } },
      h('div', { class: 'stack' }, checkbox('Cho phép dùng nguyên liệu thay thế cùng nhóm (cần test lại)', o.allowSubs, (v) => (o.allowSubs = v)), field('Tỷ lệ tối đa nguyên liệu thay thế (% khối lượng)', numInput({ value: o.subMaxPct, onInput: (v) => (o.subMaxPct = v ?? st.subMaxPct) }))),
      h('div', {}, h('div', { class: 'small muted bold', style: { marginBottom: '4px' } }, 'Giữ nguyên các nguyên liệu (không cho đổi):'), lockBox)),
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onClick: run }, '✨ Tìm phương án (3 lựa chọn)'))));

  async function run() {
    const r = await guard(async () => runOptimization(id, { ...o }));
    if (r) { s.result = r; rerender(); }
  }
  if (s.result) drawResult(el, f, s.result, ctx, rerender);
}

function drawResult(el, f, r, ctx, rerender) {
  if (r.blocked) { el.append(banner('bad', r.blocked)); return; }
  if (r.warnings?.length) el.append(banner('warn', h('div', {}, r.warnings.map((w) => h('div', {}, '⚠ ' + w)))));
  if (!r.alts.length) {
    el.append(h('div', { class: 'card' }, h('h3', {}, 'Không có phương án khả thi'), failedBlock(r.failed[0]?.diag), h('p', { class: 'muted' }, 'Gợi ý: tăng mức thay đổi tối đa, nới giới hạn chỉ tiêu, bỏ khóa nguyên liệu, hoặc cho phép nguyên liệu thay thế.')));
    return;
  }
  r.alts.forEach((a, i) => el.append(altCard(f, a, i === 0, r, ctx, rerender)));
  for (const fl of r.failed) el.append(h('div', { class: 'card flat' }, h('h3', {}, 'Phương án "' + fl.name + '": không khả thi'), failedBlock(fl.diag)));
  el.append(h('p', { class: 'small muted' }, 'Kết quả là đề xuất tính toán từ dữ liệu trong app. Công thức mới cần được duyệt và thử nghiệm thực tế bởi bộ phận kỹ thuật/chất lượng trước khi đưa vào sản xuất.'));
}

function failedBlock(diag) {
  if (!diag) return null;
  if (diag.structural) return h('p', {}, 'Các giới hạn tỷ lệ nguyên liệu (min/max, khóa) mâu thuẫn với tổng khối lượng. Hãy kiểm tra Min %/Max % và nguyên liệu đã khóa.');
  if (!diag.top.length) return null;
  return h('div', {}, h('p', { class: 'bold' }, 'Top ' + diag.top.length + ' yếu tố gây không khả thi:'), h('ol', {}, diag.top.map((t) => h('li', {}, '"' + t.crit.name + '" cần ' + (t.side === 'lo' ? '≥ ' : '≤ ') + num(t.need, 2) + ' nhưng tốt nhất chỉ đạt ' + num(t.best, 2) + ' ' + (t.crit.unit || '') + ' (lệch ' + num(t.gap, 2) + ').'))));
}

function altCard(f, a, best, r, ctx, rerender) {
  const wrap = h('div', { class: 'alt' + (best ? ' best' : '') });
  wrap.append(h('div', { class: 'row between' }, h('div', {}, h('h3', { style: { margin: 0 } }, a.name, best ? chip('Hiển thị đầu', 'pri') : null), h('div', { class: 'small muted' }, a.desc)),
    h('div', { class: 'right' }, h('div', { class: 'save mono' }, a.saving > 0.005 ? '−' + vnd(a.saving) : vnd(a.saving)), h('div', { class: 'small muted' }, signed(-a.savingPct, 1) + '% · ' + vnd(a.total) + ' (hiện tại ' + vnd(a.curTotal) + ')'))));
  if (a.duplicateOf) wrap.append(h('div', { class: 'small muted' }, 'Giống phương án "' + a.duplicateOf + '".'));
  wrap.append(table(['Nguyên liệu', ['Hiện tại → Đề xuất (g)', 'num'], ['Chênh chi phí', 'num']], a.rows.map((x) => [h('span', {}, x.name, x.locked ? chip('Khóa') : null, x.sub ? chip('Thay thế', 'warn') : null),
    h('div', {}, h('span', { class: 'muted' }, num(x.cur, 2) + ' → '), h('b', {}, num(x.qty, 2)), h('div', { class: 'small ' + (x.delta > 1e-6 ? 'delta-up' : x.delta < -1e-6 ? 'delta-down' : 'muted') }, signed(x.delta, 2) + ' g')),
    h('span', { class: x.costDelta > 0.005 ? 'delta-up' : x.costDelta < -0.005 ? 'delta-down' : '' }, signed(x.costDelta, 0) + ' đ')])));
  if (a.quality.length) wrap.append(h('div', { style: { marginTop: '8px' } }, h('h4', {}, 'Chỉ tiêu chất lượng'), table(['Chỉ tiêu', ['Hiện tại → Đề xuất', 'num'], 'Yêu cầu', 'Kết quả'], a.quality.map((q) => [q.crit.name + (q.binding ? ' ⚑' : ''), h('div', {}, h('span', { class: 'muted' }, num(q.current, q.crit.decimals ?? 2) + ' → '), h('b', {}, num(q.value, q.crit.decimals ?? 2))), (q.req.min != null ? '≥ ' + num(q.req.min) : '') + (q.req.min != null && q.req.max != null ? ' · ' : '') + (q.req.max != null ? '≤ ' + num(q.req.max) : ''), chip(REQ_LABEL[q.status][0], REQ_LABEL[q.status][1])])), h('div', { class: 'small muted' }, '⚑ = đang chạm giới hạn (ràng buộc chặt).')));
  wrap.append(h('div', { style: { marginTop: '8px' } }, h('h4', {}, 'Giải thích'), h('ul', {}, a.notes.map((n) => h('li', {}, n)))));
  wrap.append(h('div', { class: 'row', style: { marginTop: '8px' } },
    can('proposals', 'w') ? h('button', { class: 'btn primary', onClick: () => propose(f, a, r) }, 'Gửi duyệt phương án này') : h('span', { class: 'muted small' }, 'Bạn không có quyền gửi duyệt.')));
  return wrap;
}

function propose(f, a, r) {
  let note = '';
  const ta = h('textarea', { placeholder: 'Lý do, lưu ý khi thử nghiệm (tùy chọn)', onInput: (e) => (note = e.target.value) });
  openModal({ title: 'Gửi duyệt: ' + a.name, body: h('div', { class: 'stack' },
    h('p', {}, 'Tiết kiệm ' + vnd(a.saving) + '/phần (' + num(a.savingPct, 1) + '%). Khi được duyệt, app tạo phiên bản công thức mới ở trạng thái "Thử nghiệm" để bộ phận kỹ thuật/chất lượng kiểm tra thực tế.'), field('Ghi chú cho người duyệt', ta)),
  actions: [{ label: 'Hủy' }, { label: 'Gửi duyệt', kind: 'primary', onClick: async () => {
    const p = {
      formulaId: f.id, productId: f.productId, status: 'Chờ duyệt', note, requestedBy: S.user?.name, requestedAt: nowIso(), approvals: [],
      lines: altToLines(f, a),
      alt: { key: a.key, name: a.name, total: a.total, curTotal: a.curTotal, saving: a.saving, savingPct: a.savingPct, notes: a.notes, params: a.params, basis: r.basis,
        rows: a.rows.map((x) => ({ ingId: x.ingId, name: x.name, cur: x.cur, qty: x.qty, delta: x.delta })),
        quality: a.quality.map((q) => ({ name: q.crit.name, unit: q.crit.unit, decimals: q.crit.decimals, current: q.current, value: q.value, status: q.status, min: q.req.min, max: q.req.max })) },
    };
    const s = await guard(() => save('proposals', p), 'Đã gửi duyệt');
    if (s) go('#/appr');
  } }] });
}
