// Bộ tối ưu: quy hoạch tuyến tính (min chi phí) với ràng buộc chỉ tiêu chất lượng, giới hạn tỷ lệ, nguyên liệu khóa/thay thế.
import { mkCtx, formulaCost, unitPrice, specVal, isMass, qualityOf, evalReq, reqValue } from './calc.js';
import { getSettings } from './store.js';
import { num, signed } from './util.js';

const EPS = 1e-7;

// Chuẩn bị bài toán từ công thức hiện tại
function prepare(ctx, f, opt) {
  const basis = opt.basis;
  const cost = formulaCost(ctx, f, basis);
  const W = cost.weight;
  const vars = []; const fixedCost = { amount: 0 }; const warnings = [];
  const addVar = (v) => vars.push(v);
  for (const l of cost.lines) {
    if (!l.ing) continue;
    if (!isMass(l.ing)) { fixedCost.amount += l.cost; continue; } // bao bì tính theo cái: giữ nguyên
    if (l.unit == null) { warnings.push('Thiếu giá: ' + l.ing.name); continue; }
    let lo = l.qty * (1 - opt.d), hi = l.qty * (1 + opt.d);
    const locked = l.fixed || opt.fixed.has(l.ing.id);
    if (locked) { lo = hi = l.qty; }
    else {
      const hardLo = l.minPct != null && l.minPct !== '' ? (Number(l.minPct) / 100) * W : 0;
      const hardHi = l.maxPct != null && l.maxPct !== '' ? (Number(l.maxPct) / 100) * W : W;
      lo = Math.max(lo, hardLo); hi = Math.min(hi, hardHi);
      if (lo > hi) lo = hi = Math.min(Math.max(l.qty, hardLo), hardHi);
    }
    addVar({ ingId: l.ing.id, name: l.ing.name, cur: l.qty, lo, hi, y: l.y, cpg: l.y * l.unit, locked, sub: false, ing: l.ing });
  }
  if (opt.allowSubs) {
    const inF = new Set(vars.map((v) => v.ingId));
    const groups = new Set(vars.filter((v) => v.ing.substGroup && !v.locked).map((v) => v.ing.substGroup));
    for (const i of ctx.ing.values()) {
      if (!i.substGroup || !groups.has(i.substGroup) || inF.has(i.id) || !isMass(i) || i.bomFormulaId === f.id) continue;
      const up = unitPrice(ctx, i, basis);
      if (up.value == null) continue;
      addVar({ ingId: i.id, name: i.name, cur: 0, lo: 0, hi: (opt.subMaxPct / 100) * W, y: i.yield ?? 1, cpg: (i.yield ?? 1) * up.value, locked: false, sub: true, ing: i });
    }
  }
  // ràng buộc chất lượng (chỉ chỉ tiêu cộng theo tỷ lệ)
  const cons = [];
  for (const r of f.reqs || []) {
    const c = ctx.criteria.find((x) => x.id === r.critId);
    if (!c || !c.additive) continue;
    let lo = r.min == null || r.min === '' ? null : Number(r.min);
    let hi = r.max == null || r.max === '' ? null : Number(r.max);
    if (lo == null && hi == null) continue;
    if (opt.margin) {
      const tol = Number(r.tol) || 0;
      const m = tol > 0 ? tol : lo != null && hi != null ? 0.1 * (hi - lo) : 0.05 * Math.abs(lo ?? hi);
      if (lo != null) lo += m;
      if (hi != null) hi -= m;
      if (lo != null && hi != null && lo > hi) lo = hi = (lo + hi) / 2;
    }
    const missing = vars.filter((v) => specVal(v.ing, c.id) == null).map((v) => v.name);
    if (missing.length) warnings.push('Chỉ tiêu "' + c.name + '" thiếu dữ liệu ở: ' + missing.join(', ') + ' (tính là 0)');
    cons.push({ crit: c, req: r, lo, hi, a: vars.map((v) => specVal(v.ing, c.id) ?? 0) });
  }
  return { cost, W, vars, cons, fixedCost: fixedCost.amount, warnings };
}

function buildModel(P, relax = null, elastic = false) {
  const { W, vars, cons } = P;
  const constraints = { total: { equal: W } }; const variables = {};
  vars.forEach((v, i) => {
    const o = { cost: v.cpg, total: 1 };
    const name = 'b' + i;
    o[name] = 1;
    constraints[name] = v.hi - v.lo < EPS ? { equal: v.lo } : { min: v.lo, max: v.hi };
    variables['v' + i] = o;
  });
  cons.forEach((c, j) => {
    const nm = 'q' + j;
    let lo = c.lo, hi = c.hi;
    if (relax && relax.j === j) { if (relax.side === 'lo' && lo != null) lo -= relax.step; if (relax.side === 'hi' && hi != null) hi += relax.step; }
    if (elastic) {
      if (lo != null) { constraints[nm + 'l'] = { min: lo * W }; vars.forEach((v, i) => { variables['v' + i][nm + 'l'] = c.a[i]; }); variables['sl' + j] = { cost: 1e6, [nm + 'l']: W }; }
      if (hi != null) { constraints[nm + 'h'] = { max: hi * W }; vars.forEach((v, i) => { variables['v' + i][nm + 'h'] = c.a[i]; }); variables['sh' + j] = { cost: 1e6, [nm + 'h']: -W }; }
    } else {
      const k = {};
      if (lo != null) k.min = lo * W;
      if (hi != null) k.max = hi * W;
      constraints[nm] = k;
      vars.forEach((v, i) => { variables['v' + i][nm] = c.a[i]; });
    }
  });
  return { optimize: 'cost', opType: 'min', constraints, variables };
}

function solve(model) {
  const res = window.solver.Solve(model);
  return res;
}

function readSolution(P, res) {
  return P.vars.map((v, i) => Math.max(0, Number(res['v' + i]) || 0));
}

function describe(ctx, f, P, qty, opt, name, key) {
  const { cost, W, vars, cons } = P;
  const rows = vars.map((v, i) => ({ ingId: v.ingId, name: v.name, cur: v.cur, qty: qty[i], delta: qty[i] - v.cur, lo: v.lo, hi: v.hi, locked: v.locked, sub: v.sub, cpg: v.cpg, costDelta: (qty[i] - v.cur) * v.cpg, atLo: !v.locked && Math.abs(qty[i] - v.lo) < 1e-6 && v.hi - v.lo > 1e-6, atHi: !v.locked && Math.abs(qty[i] - v.hi) < 1e-6 && v.hi - v.lo > 1e-6 }))
    .filter((r) => r.cur > 0 || r.qty > 1e-6);
  const material = vars.reduce((s, v, i) => s + qty[i] * v.cpg, 0);
  // chi phí các dòng không tối ưu được (bao bì theo cái) + chi phí khác giữ nguyên
  const total = material + P.fixedCost + cost.extras;
  const curTotal = cost.total;
  // chỉ tiêu của phương án
  const quality = cons.map((c) => {
    const v = qty.reduce((s, q, i) => s + q * c.a[i], 0) / W;
    const cur = vars.reduce((s, vv, i) => s + vv.cur * c.a[i], 0) / W;
    const limit = c.lo != null && Math.abs(v - c.lo) < 1e-5 * Math.max(1, Math.abs(c.lo)) ? 'lo' : c.hi != null && Math.abs(v - c.hi) < 1e-5 * Math.max(1, Math.abs(c.hi)) ? 'hi' : null;
    return { crit: c.crit, req: c.req, value: v, current: cur, status: evalReq(c.req, v), binding: limit, limitValue: limit === 'lo' ? c.lo : limit === 'hi' ? c.hi : null };
  });
  // độ nhạy: nới 1 chỉ tiêu đang chặt thêm một bước nhỏ -> giảm bao nhiêu đ cho mỗi 1 đơn vị
  const sens = [];
  quality.forEach((q, j) => {
    if (!q.binding) return;
    const step = 0.1;
    const m = buildModel(P, { j, side: q.binding, step });
    const r = solve(m);
    if (r.feasible) {
      const alt = readSolution(P, r).reduce((s, x, i) => s + x * vars[i].cpg, 0);
      const perUnit = (material - alt) / step;
      if (perUnit > 1e-6) sens.push({ crit: q.crit, side: q.binding, perUnit });
    }
  });
  const notes = [];
  const moved = rows.filter((r) => Math.abs(r.costDelta) > 0.01).sort((a, b) => a.costDelta - b.costDelta);
  for (const r of moved.slice(0, 3)) {
    notes.push((r.delta < 0 ? 'Giảm ' : 'Tăng ') + r.name + ' ' + num(r.cur, 2) + ' → ' + num(r.qty, 2) + ' g (' + (r.costDelta < 0 ? 'giảm ' : 'tăng ') + num(Math.abs(r.costDelta), 0) + ' đ chi phí)');
  }
  for (const s of sens) notes.push('Chỉ tiêu "' + s.crit.name + '" đang chạm ' + (s.side === 'lo' ? 'giới hạn dưới' : 'giới hạn trên') + ': nới thêm 1 ' + (s.crit.unit || 'đơn vị') + ' sẽ giảm khoảng ' + num(s.perUnit * 1, 0) + ' đ/phần.');
  const limited = rows.filter((r) => (r.atLo || r.atHi) && Math.abs(r.delta) > 1e-6);
  if (limited.length) notes.push('Đang chạm giới hạn thay đổi: ' + limited.map((r) => r.name + (r.atHi ? ' (trần)' : ' (sàn)')).join(', ') + '. Nếu kỹ thuật cho phép nới giới hạn này, còn dư địa giảm thêm.');
  if (!moved.length) notes.push('Công thức hiện tại đã là phương án rẻ nhất trong các giới hạn đã đặt.');
  return { key, name, feasible: true, rows, material, total, curTotal, saving: curTotal - total, savingPct: curTotal ? ((curTotal - total) / curTotal) * 100 : 0, quality, sens, notes, W, params: { d: opt.d, margin: opt.margin } };
}

// chẩn đoán khi không khả thi: nới mềm từng ràng buộc, xem chỉ tiêu nào bị vi phạm nhiều nhất
function diagnose(P) {
  const m = buildModel(P, null, true);
  const r = solve(m);
  const out = [];
  if (!r.feasible) return { structural: true, top: [] };
  P.cons.forEach((c, j) => {
    const sl = Number(r['sl' + j]) || 0, sh = Number(r['sh' + j]) || 0;
    if (sl > 1e-6) out.push({ crit: c.crit, side: 'lo', need: c.lo, best: c.lo - sl, gap: sl, rel: sl / Math.max(1e-9, Math.abs(c.lo)) });
    if (sh > 1e-6) out.push({ crit: c.crit, side: 'hi', need: c.hi, best: c.hi + sh, gap: sh, rel: sh / Math.max(1e-9, Math.abs(c.hi)) });
  });
  out.sort((a, b) => b.rel - a.rel);
  return { structural: false, top: out.slice(0, 3) };
}

export function runOptimization(formulaId, userOpt = {}) {
  const ctx = mkCtx();
  const f = ctx.formulas.get(formulaId);
  if (!f) throw new Error('Không tìm thấy công thức.');
  const st = getSettings();
  const base = {
    basis: userOpt.basis || st.defaultBasis,
    d: (userOpt.maxChangePct ?? st.maxChangePct) / 100,
    allowSubs: !!userOpt.allowSubs,
    subMaxPct: userOpt.subMaxPct ?? st.subMaxPct,
    fixed: new Set(userOpt.fixed || []),
  };
  const defs = [
    { key: 'cheapest', name: 'Rẻ nhất', margin: false, d: base.d, desc: 'Giá thấp nhất, chỉ tiêu nằm đúng trong khoảng yêu cầu.' },
    { key: 'safe', name: 'An toàn chất lượng', margin: true, d: base.d, desc: 'Chừa biên theo dung sai: chỉ tiêu cách xa giới hạn hơn.' },
    { key: 'minchange', name: 'Ít thay đổi', margin: false, d: base.d / 3, desc: 'Giữ gần công thức hiện tại (thay đổi nhỏ), dễ thử nghiệm hơn.' },
  ];
  const order = { cheapest: ['cheapest', 'safe', 'minchange'], safe: ['safe', 'cheapest', 'minchange'], minchange: ['minchange', 'cheapest', 'safe'] }[userOpt.objective || 'cheapest'];
  defs.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const cost0 = formulaCost(ctx, f, base.basis);
  const result = { formulaId, basis: base.basis, current: { total: cost0.total, material: cost0.material, weight: cost0.weight }, alts: [], failed: [], warnings: [], blocked: null, opt: userOpt };
  if (!window.solver) { result.blocked = 'Chưa tải được bộ giải tối ưu.'; return result; }
  if (cost0.weight <= 0) { result.blocked = 'Công thức chưa có nguyên liệu (khối lượng bằng 0).'; return result; }
  const noPrice = cost0.missing.filter((l) => isMass(l.ing));
  if (noPrice.length) { result.blocked = 'Chưa có giá cho: ' + noPrice.map((l) => l.ing.name).join(', ') + '. Hãy nhập giá trước khi tối ưu.'; return result; }
  const seen = [];
  for (const d of defs) {
    const opt = { ...base, d: d.d, margin: d.margin };
    const P = prepare(ctx, f, opt);
    if (!seen.length) result.warnings = P.warnings;
    if (!P.vars.length) { result.blocked = 'Không có nguyên liệu nào tối ưu được (thiếu giá hoặc tất cả bị khóa).'; return result; }
    const res = solve(buildModel(P));
    if (!res.feasible) {
      result.failed.push({ key: d.key, name: d.name, diag: diagnose(P), d: d.d });
      continue;
    }
    const alt = describe(ctx, f, P, readSolution(P, res), opt, d.name, d.key);
    alt.desc = d.desc;
    const sig = alt.rows.map((r) => r.ingId + ':' + r.qty.toFixed(3)).join('|');
    alt.duplicateOf = seen.find((s) => s.sig === sig)?.name || null;
    seen.push({ sig, name: d.name });
    result.alts.push(alt);
  }
  return result;
}

export function altToLines(f, alt) {
  // trả danh sách dòng công thức mới từ phương án tối ưu (giữ nguyên các dòng không tối ưu như bao bì)
  const byIng = new Map(alt.rows.map((r) => [r.ingId, r]));
  const lines = [];
  for (const l of f.lines) {
    const r = byIng.get(l.ingId);
    if (r) { lines.push({ ...l, id: undefined, qty: Math.round(r.qty * 10000) / 10000 }); byIng.delete(l.ingId); }
    else lines.push({ ...l, id: undefined });
  }
  for (const r of byIng.values()) if (r.qty > 1e-6) lines.push({ ingId: r.ingId, qty: Math.round(r.qty * 10000) / 10000, yield: null, minPct: null, maxPct: null, fixed: false, note: 'Nguyên liệu thay thế do bộ tối ưu đề xuất' });
  return lines;
}
export { signed };
