// Lõi tính toán: giá thành, hao hụt (định mức/yield), bán thành phẩm lồng nhau, chỉ tiêu chất lượng.
import { S, all, getSettings, saveMany, can } from './store.js';
import { UNIT_F, MASS_UNITS } from './defaults.js';
import { today } from './util.js';

export const isMass = (ing) => !!ing && MASS_UNITS.includes(ing.priceUnit);

export function mkCtx() {
  const ing = new Map(all('ingredients').map((i) => [i.id, i]));
  const formulas = new Map(all('formulas').map((f) => [f.id, f]));
  const products = new Map(all('products').map((p) => [p.id, p]));
  const criteria = all('criteria');
  const priceIdx = new Map();
  for (const p of all('prices')) {
    if (p.price == null) continue;
    const m = priceIdx.get(p.ingId) || {};
    const cur = m[p.type];
    if (!cur || (p.date || '') > (cur.date || '') || ((p.date || '') === (cur.date || '') && (p.createdAt || '') > (cur.createdAt || ''))) m[p.type] = p;
    priceIdx.set(p.ingId, m);
  }
  return { ing, formulas, products, criteria, priceIdx, stack: [], memo: new Map() };
}

export function latestPrice(ctx, ingId, basis) {
  const m = ctx.priceIdx.get(ingId);
  if (!m) return null;
  let rec = m[basis]; let fallback = false;
  if (!rec) {
    rec = m['Kế hoạch'] || Object.values(m).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    fallback = !!rec;
  }
  return rec ? { price: rec.price, type: rec.type, date: rec.date, fallback } : null;
}

// giá đ/g (hoặc đ/cái) của một nguyên liệu; bán thành phẩm tính theo công thức con
export function unitPrice(ctx, ing, basis, mult) {
  let v = null; let info = null;
  if (ing.bomFormulaId) {
    const f = ctx.formulas.get(ing.bomFormulaId);
    if (f && !ctx.stack.includes(f.id)) {
      const c = formulaCost(ctx, f, basis, mult);
      if (c.weight > 0) v = c.total / c.weight;
      info = { sub: true };
    }
  } else {
    const lp = latestPrice(ctx, ing.id, basis);
    if (lp) { v = lp.price / (UNIT_F[ing.priceUnit] || 1); info = lp; }
  }
  if (v != null && mult && mult[ing.id] != null) v *= mult[ing.id];
  return { value: v, info };
}

export function formulaCost(ctx, f, basis = 'Kế hoạch', mult = null) {
  const key = f.id + '|' + basis + '|' + (mult ? JSON.stringify(mult) : '');
  if (ctx.memo.has(key)) return ctx.memo.get(key);
  ctx.stack.push(f.id);
  const lines = (f.lines || []).map((l) => {
    const ing = ctx.ing.get(l.ingId);
    const up = ing ? unitPrice(ctx, ing, basis, mult) : { value: null, info: null };
    const qty = Number(l.qty) || 0;
    const y = l.yield == null || l.yield === '' ? (ing?.yield ?? 1) : Number(l.yield);
    const raw = qty * y;
    const cost = up.value == null ? 0 : raw * up.value;
    return { ...l, ing, qty, y, raw, unit: up.value, priceInfo: up.info, cost, missing: !ing || up.value == null };
  });
  ctx.stack.pop();
  const material = lines.reduce((s, l) => s + l.cost, 0);
  const weight = lines.reduce((s, l) => s + (isMass(l.ing) ? l.qty : 0), 0);
  const extras = (f.extras || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const total = material + extras;
  const res = { lines, material, extras, total, weight, perKg: weight ? (total / weight) * 1000 : null, missing: lines.filter((l) => l.missing) };
  ctx.memo.set(key, res);
  return res;
}

// ---------- chỉ tiêu chất lượng ----------
export function activeLot(ing) {
  if (!ing?.lots?.length) return null;
  return ing.lots.find((l) => l.id === ing.activeLotId) || ing.lots[ing.lots.length - 1];
}
export function specVal(ing, critId) {
  const lot = activeLot(ing);
  const v = lot?.values?.[critId];
  return v === '' || v == null ? null : Number(v);
}
export function qualityOf(ctx, cost) {
  const out = {};
  for (const c of ctx.criteria) {
    if (!c.additive) continue;
    let s = 0; const missing = [];
    for (const l of cost.lines) {
      if (!isMass(l.ing) || !l.qty) continue;
      const v = specVal(l.ing, c.id);
      if (v == null) { missing.push(l.ing.name); continue; }
      s += l.qty * v;
    }
    out[c.id] = { value: cost.weight ? s / cost.weight : null, missing };
  }
  return out;
}
export function evalReq(req, val) {
  if (val == null || Number.isNaN(val)) return 'none';
  const lo = req.min, hi = req.max, tol = req.tol || 0, e = 1e-3; // bù sai số làm tròn của bộ giải
  const inR = (a, b) => (a == null || val >= a - e) && (b == null || val <= b + e);
  if (inR(lo, hi)) return 'pass';
  if (inR(lo == null ? null : lo - tol, hi == null ? null : hi + tol)) return 'tol';
  return 'fail';
}
export const REQ_LABEL = { pass: ['Đạt', 'ok'], tol: ['Trong dung sai', 'warn'], fail: ['Không đạt', 'bad'], none: ['Chưa có dữ liệu', ''] };
export function reqValue(ctx, req, quality) {
  const c = ctx.criteria.find((x) => x.id === req.critId);
  if (!c) return null;
  return c.additive ? quality[c.id]?.value ?? null : (req.measured == null || req.measured === '' ? null : Number(req.measured));
}
export function qualitySummary(ctx, f, cost) {
  const q = qualityOf(ctx, cost);
  const rows = (f.reqs || []).map((r) => {
    const c = ctx.criteria.find((x) => x.id === r.critId);
    const value = reqValue(ctx, r, q);
    return { req: r, crit: c, value, status: evalReq(r, value), missing: c?.additive ? q[c.id]?.missing || [] : [] };
  });
  const worst = rows.reduce((w, r) => (['none', 'pass', 'tol', 'fail'].indexOf(r.status) > ['none', 'pass', 'tol', 'fail'].indexOf(w) ? r.status : w), 'pass');
  return { q, rows, overall: rows.length ? worst : 'none' };
}

// ---------- tiện ích công thức ----------
export function productOf(ctx, f) { return ctx.products.get(f.productId); }
export function fLabel(ctx, f) {
  const p = productOf(ctx, f);
  return (p ? p.name : '(sản phẩm đã xóa)') + ' · ' + (f.variant || 'Chuẩn') + ' · v' + f.version;
}
export function versionsOf(productId, variant) {
  return all('formulas').filter((f) => f.productId === productId && (variant == null || (f.variant || 'Chuẩn') === variant)).sort((a, b) => b.version - a.version);
}
// công thức bị ảnh hưởng khi một nguyên liệu đổi giá (kể cả qua bán thành phẩm)
export function formulasUsing(ingId, ctx = mkCtx()) {
  const direct = new Set(); const hit = new Set();
  const uses = (f, target, seen = new Set()) => {
    if (seen.has(f.id)) return false; seen.add(f.id);
    return (f.lines || []).some((l) => {
      if (l.ingId === target) return true;
      const i = ctx.ing.get(l.ingId);
      if (i?.bomFormulaId) { const sub = ctx.formulas.get(i.bomFormulaId); return sub ? uses(sub, target, seen) : false; }
      return false;
    });
  };
  for (const f of ctx.formulas.values()) if (uses(f, ingId)) hit.add(f.id);
  return [...hit].map((id) => ctx.formulas.get(id)).filter((f) => f && f.status !== 'Ngừng dùng');
}

// ---------- ảnh chụp giá thành (người chỉ xem giá thành chỉ đọc phần này) ----------
export async function refreshSnapshots(only = null) {
  if (!can('snapshots', 'w')) return;
  const ctx = mkCtx(); const basis = getSettings().defaultBasis; const t = today();
  const docs = [];
  for (const f of ctx.formulas.values()) {
    if (only && !only.has(f.id)) continue;
    const p = ctx.products.get(f.productId); if (!p) continue;
    const c = formulaCost(ctx, f, basis);
    const old = S.cache.snapshots.get(f.id);
    const changed = !old || Math.abs((old.total || 0) - c.total) > 0.005 || old.status !== f.status || old.version !== f.version || old.productName !== p.name;
    if (!changed) continue;
    const hist = (old?.history || []).slice(-59);
    if (!hist.length || hist[hist.length - 1].total !== Math.round(c.total * 100) / 100) hist.push({ date: t, total: Math.round(c.total * 100) / 100 });
    docs.push({ id: f.id, formulaId: f.id, productId: p.id, productName: p.name, productCode: p.code, variant: f.variant || 'Chuẩn', version: f.version, status: f.status, basis, total: c.total, material: c.material, weight: c.weight, missing: c.missing.length, date: t, history: hist, createdAt: old?.createdAt });
  }
  for (const id of [...S.cache.snapshots.keys()]) if (!ctx.formulas.has(id)) { /* công thức đã xóa: giữ lịch sử */ }
  if (docs.length) await saveMany('snapshots', docs, 'Cập nhật giá thành (' + docs.length + ' công thức)', { noAudit: true, silent: true });
}
