import { h, vnd, num, signed, fmtDateTime, uid, clone, addMonths, nowIso } from '../util.js';
import { S, all, get, save, can, getSettings, isCloud } from '../store.js';
import { mkCtx, fLabel, versionsOf, REQ_LABEL, refreshSnapshots } from '../calc.js';
import { openModal, toast, guard, confirmBox, promptBox, chip, tabs, table, empty, banner, go } from '../ui.js';

let tab = 'Chờ duyệt';
const canApprove = () => ['admin', 'approver'].includes(S.role);

export async function render(el, _p, { rerender }) {
  const st = getSettings();
  el.append(h('h1', {}, 'Duyệt đề xuất công thức'));
  el.append(h('p', { class: 'muted' }, 'Công thức mới chỉ được tạo khi có đủ ' + st.requiredApprovals + ' người duyệt. Mỗi quyết định ghi rõ người duyệt, thời điểm, lý do (nếu từ chối) và được lưu trong nhật ký.'));
  const ctx = mkCtx();
  const props = all('proposals').sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
  const count = (s) => props.filter((p) => p.status === s).length;
  el.append(tabs([['Chờ duyệt', 'Chờ duyệt (' + count('Chờ duyệt') + ')'], ['Đã duyệt', 'Đã duyệt (' + count('Đã duyệt') + ')'], ['Từ chối', 'Từ chối (' + count('Từ chối') + ')'], ['all', 'Tất cả']], tab, (k) => { tab = k; rerender(); }));
  const shown = props.filter((p) => tab === 'all' || p.status === tab);
  if (!shown.length) { el.append(h('div', { class: 'card' }, empty('Không có đề xuất.'))); return; }
  for (const p of shown) {
    const f = get('formulas', p.formulaId);
    const mine = (p.approvals || []).some((a) => a.by === S.user?.name);
    const own = p.requestedBy === S.user?.name && isCloud();
    el.append(h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('div', {}, h('b', {}, f ? fLabel(ctx, f) : '(công thức đã xóa)'), h('div', { class: 'small muted' }, 'Phương án "' + (p.alt?.name || '') + '" · ' + (p.requestedBy || '') + ' · ' + fmtDateTime(p.requestedAt))),
        h('div', { class: 'right' }, h('div', { class: 'bold delta-down mono' }, '−' + vnd(p.alt?.saving || 0)), h('div', { class: 'small muted' }, num(p.alt?.savingPct || 0, 1) + '% · ' + chip(p.status, p.status === 'Đã duyệt' ? 'ok' : p.status === 'Từ chối' ? 'bad' : 'warn').textContent))),
      p.note ? h('p', { class: 'small', style: { margin: '6px 0 0' } }, '“' + p.note + '”') : null,
      p.status === 'Chờ duyệt' ? h('div', { class: 'small muted' }, 'Đã duyệt ' + (p.approvals || []).length + '/' + st.requiredApprovals + (p.approvals?.length ? ': ' + p.approvals.map((a) => a.by).join(', ') : '')) : null,
      p.status === 'Từ chối' ? h('div', { class: 'small delta-up' }, 'Lý do từ chối (' + (p.rejectedBy || '') + '): ' + (p.rejectReason || '')) : null,
      p.status === 'Đã duyệt' && p.resultFormulaId ? h('div', { class: 'small' }, 'Đã tạo ', h('a', { href: '#/formula/' + p.resultFormulaId }, 'phiên bản công thức mới'), ' · duyệt bởi ' + (p.approvals || []).map((a) => a.by).join(', ')) : null,
      h('div', { class: 'row', style: { marginTop: '8px' } },
        h('button', { class: 'btn sm', onClick: () => detail(p, f, ctx) }, 'Xem chi tiết'),
        p.status === 'Chờ duyệt' && canApprove() && !mine && !own ? h('button', { class: 'btn sm primary', onClick: () => approve(p, rerender) }, '✓ Duyệt') : null,
        p.status === 'Chờ duyệt' && canApprove() && !mine && !own ? h('button', { class: 'btn sm danger', onClick: () => reject(p, rerender) }, '✕ Từ chối') : null,
        p.status === 'Chờ duyệt' && own ? h('span', { class: 'small muted' }, 'Người đề xuất không tự duyệt.') : null,
        p.status === 'Chờ duyệt' && mine ? h('span', { class: 'small muted' }, 'Bạn đã duyệt.') : null,
        p.status === 'Chờ duyệt' && p.requestedBy === S.user?.name ? h('button', { class: 'btn sm', onClick: async () => { if (await confirmBox('Rút lại đề xuất này?')) { await guard(() => save('proposals', { ...p, status: 'Từ chối', rejectedBy: S.user?.name, rejectReason: 'Người đề xuất rút lại' }), 'Đã rút lại'); rerender(); } } }, 'Rút lại') : null)));
  }
}

function detail(p, f, ctx) {
  const a = p.alt || {};
  openModal({ title: 'Chi tiết đề xuất', wide: true, actions: [{ label: 'Đóng' }], body: h('div', { class: 'stack' },
    h('div', {}, h('b', {}, f ? fLabel(ctx, f) : ''), h('div', { class: 'small muted' }, 'Giá thành ' + vnd(a.curTotal) + ' → ' + vnd(a.total) + ' (' + signed(-(a.savingPct || 0), 1) + '%)')),
    table(['Nguyên liệu', ['Hiện tại (g)', 'num'], ['Đề xuất (g)', 'num'], ['Chênh (g)', 'num']], (a.rows || []).map((x) => [x.name, num(x.cur, 2), h('b', {}, num(x.qty, 2)), h('span', { class: x.delta > 0 ? 'delta-up' : x.delta < 0 ? 'delta-down' : '' }, signed(x.delta, 2))])),
    (a.quality || []).length ? table(['Chỉ tiêu', ['Hiện tại', 'num'], ['Đề xuất', 'num'], 'Yêu cầu', 'Kết quả'], a.quality.map((q) => [q.name, num(q.current, q.decimals ?? 2), h('b', {}, num(q.value, q.decimals ?? 2)), (q.min != null ? '≥ ' + num(q.min) : '') + (q.min != null && q.max != null ? ' · ' : '') + (q.max != null ? '≤ ' + num(q.max) : ''), chip(REQ_LABEL[q.status][0], REQ_LABEL[q.status][1])])) : null,
    h('ul', {}, (a.notes || []).map((n) => h('li', {}, n))),
    h('div', { class: 'small muted' }, 'Thông số chạy: thay đổi tối đa ±' + num((a.params?.d || 0) * 100, 0) + '%, ' + (a.params?.margin ? 'có biên an toàn' : 'không biên an toàn') + ', loại giá ' + (a.basis || ''))) });
}

async function approve(p, rerender) {
  const st = getSettings();
  const comment = await promptBox('Duyệt đề xuất', 'Nhận xét (tùy chọn)', '', { multiline: true, required: false });
  if (comment == null) return;
  await guard(async () => {
    const q = clone(p);
    q.approvals = [...(q.approvals || []), { by: S.user?.name, at: nowIso(), comment }];
    if (q.approvals.length >= st.requiredApprovals) {
      const base = get('formulas', q.formulaId);
      if (!base) throw new Error('Công thức gốc đã bị xóa, không thể tạo phiên bản mới.');
      const max = Math.max(0, ...versionsOf(base.productId, base.variant || 'Chuẩn').map((x) => x.version));
      const nf = {
        productId: base.productId, variant: base.variant || 'Chuẩn', version: max + 1, status: 'Thử nghiệm', reason: 'Tối ưu chi phí',
        note: 'Từ đề xuất tối ưu "' + (q.alt?.name || '') + '" (tiết kiệm ' + num(q.alt?.savingPct || 0, 1) + '%). Chờ thử nghiệm thực tế.',
        lines: q.lines.map((l) => ({ ...l, id: uid() })), extras: clone(base.extras || []).map((e) => ({ ...e, id: uid() })), reqs: clone(base.reqs || []),
        parentId: base.id, fromProposal: q.id, approvedBy: q.approvals.map((a) => a.by).join(', '), approvedAt: nowIso(), expiresAt: addMonths(nowIso(), st.trialMonths),
      };
      const saved = await save('formulas', nf);
      q.status = 'Đã duyệt'; q.resultFormulaId = saved.id;
      await save('proposals', q);
      await refreshSnapshots();
      toast('Đã duyệt. Đã tạo phiên bản v' + nf.version + ' (Thử nghiệm).', 'ok');
    } else {
      await save('proposals', q);
      toast('Đã ghi nhận lượt duyệt ' + q.approvals.length + '/' + st.requiredApprovals, 'ok');
    }
  });
  rerender();
}
async function reject(p, rerender) {
  const reason = await promptBox('Từ chối đề xuất', 'Lý do từ chối (bắt buộc)', '', { multiline: true });
  if (!reason) return;
  await guard(() => save('proposals', { ...p, status: 'Từ chối', rejectedBy: S.user?.name, rejectedAt: nowIso(), rejectReason: reason }), 'Đã từ chối đề xuất');
  rerender();
}
