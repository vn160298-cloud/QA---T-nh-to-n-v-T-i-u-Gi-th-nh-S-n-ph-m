// Lớp dữ liệu: chạy "chế độ thử" (lưu trên thiết bị) hoặc "đám mây" (Supabase, có đăng nhập và phân quyền).
import { CONFIG } from './config.js';
import { COLLS, PERM, ROLES, LIST_DEFS, SETTINGS_DEFAULT } from './defaults.js';
import { uid, clone, nowIso, today } from './util.js';

export const S = { mode: 'local', user: null, role: 'admin', ready: false, error: null, cache: {} };
for (const c of COLLS) S.cache[c] = new Map();

let sb = null;
const LS = 'tcc.v1.';
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (coll) => listeners.forEach((f) => { try { f(coll); } catch (e) { console.error(e); } });

export const can = (coll, op = 'r') => (PERM[coll]?.[op] || []).includes(S.role);
export const isCloud = () => S.mode === 'cloud';
export const client = () => sb;

// ---------- khởi tạo ----------
export function cloudConfig() {
  return {
    url: localStorage.getItem('tcc.sbUrl') || CONFIG.SUPABASE_URL || '',
    key: localStorage.getItem('tcc.sbKey') || CONFIG.SUPABASE_ANON_KEY || '',
  };
}
export async function init() {
  const { url, key } = cloudConfig();
  if (url && key && window.supabase) {
    S.mode = 'cloud';
    sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    try {
      const { data } = await sb.auth.getSession();
      if (data?.session) await onSession(data.session.user);
    } catch (e) { S.error = e.message || String(e); }
  } else {
    S.mode = 'local';
    S.user = { id: 'local', email: 'thu@thiet-bi-nay', name: 'Người dùng thử' };
    S.role = localStorage.getItem('tcc.localRole') || 'admin';
    loadLocal();
  }
  S.ready = true;
}
async function onSession(user) {
  const { data: prof, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  S.user = { id: user.id, email: user.email, name: prof?.full_name || user.email };
  S.role = prof && prof.active !== false ? prof.role || 'pending' : 'pending';
  if (S.role !== 'pending') await loadCloud();
}
export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await onSession(data.user);
}
export async function signUp(email, password, fullName) {
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) throw error;
  if (data.session) await onSession(data.user);
  return !!data.session;
}
export async function signOut() {
  if (sb) await sb.auth.signOut();
  S.user = null; S.role = 'pending';
  for (const c of COLLS) S.cache[c] = new Map();
}
export async function reload() {
  if (isCloud()) await loadCloud(); else loadLocal();
  emit('*');
}

// ---------- tải dữ liệu ----------
function loadLocal() {
  for (const c of COLLS) {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(LS + c) || '[]'); } catch { arr = []; }
    S.cache[c] = new Map(arr.map((d) => [d.id, d]));
  }
}
function persistLocal(coll) {
  localStorage.setItem(LS + coll, JSON.stringify([...S.cache[coll].values()]));
}
async function loadCloud() {
  const maps = {}; for (const c of COLLS) maps[c] = new Map();
  let from = 0; const page = 1000;
  for (;;) {
    const { data, error } = await sb.from('records').select('collection,id,data').in('collection', COLLS).range(from, from + page - 1);
    if (error) throw error;
    for (const r of data) maps[r.collection]?.set(r.id, r.data);
    if (data.length < page) break;
    from += page;
  }
  S.cache = maps;
}

// ---------- đọc ----------
export const all = (coll) => [...S.cache[coll].values()];
export const get = (coll, id) => S.cache[coll].get(id);
export function getList(key) {
  const d = S.cache.lists.get(key);
  return d ? d.items : (LIST_DEFS[key]?.items || []).slice();
}
export function getSettings() { return { ...SETTINGS_DEFAULT, ...(S.cache.settings.get('app') || {}) }; }

// ---------- ghi ----------
export async function save(coll, doc, opts = {}) {
  if (!can(coll, 'w')) throw new Error('Vai trò "' + (ROLES[S.role] || S.role) + '" không có quyền sửa dữ liệu này.');
  const isNew = !doc.id || !S.cache[coll].has(doc.id);
  const old = isNew ? null : clone(S.cache[coll].get(doc.id));
  if (!doc.id) doc.id = uid();
  const t = nowIso();
  doc.updatedAt = t; doc.updatedBy = S.user?.name || '';
  if (!doc.createdAt) { doc.createdAt = t; doc.createdBy = S.user?.name || ''; }
  if (isCloud()) {
    const { error } = await sb.from('records').upsert({ collection: coll, id: doc.id, data: doc });
    if (error) throw error;
  }
  S.cache[coll].set(doc.id, doc);
  if (!isCloud()) { persistLocal(coll); localAudit(isNew ? 'Thêm' : 'Sửa', coll, doc, old, doc); }
  if (!opts.silent) emit(coll);
  return doc;
}
export async function saveMany(coll, docs, summary, opts = {}) {
  if (!can(coll, 'w')) throw new Error('Không có quyền ghi dữ liệu này.');
  const t = nowIso();
  for (const d of docs) {
    if (!d.id) d.id = uid();
    d.updatedAt = t; d.updatedBy = S.user?.name || '';
    if (!d.createdAt) { d.createdAt = t; d.createdBy = S.user?.name || ''; }
  }
  if (isCloud()) {
    for (let i = 0; i < docs.length; i += 200) {
      const chunk = docs.slice(i, i + 200).map((d) => ({ collection: coll, id: d.id, data: d }));
      const { error } = await sb.from('records').upsert(chunk);
      if (error) throw error;
    }
  }
  for (const d of docs) S.cache[coll].set(d.id, d);
  if (!isCloud()) { persistLocal(coll); if (!opts.noAudit) localAudit('Nhập hàng loạt', coll, { id: '*', name: summary || docs.length + ' bản ghi' }, null, null); }
  if (!opts.silent) emit(coll);
}
export async function remove(coll, id) {
  if (!can(coll, 'w')) throw new Error('Không có quyền xóa dữ liệu này.');
  const old = clone(S.cache[coll].get(id));
  if (isCloud()) {
    const { error } = await sb.from('records').delete().eq('collection', coll).eq('id', id);
    if (error) throw error;
  }
  S.cache[coll].delete(id);
  if (!isCloud()) { persistLocal(coll); localAudit('Xóa', coll, old || { id }, old, null); }
  emit(coll);
}
export async function saveList(key, items) {
  const clean = [...new Set(items.map((s) => String(s).trim()).filter(Boolean))];
  return save('lists', { id: key, items: clean });
}
export async function addToList(key, value) {
  const v = String(value || '').trim(); if (!v) return;
  const items = getList(key);
  if (items.some((x) => x.toLowerCase() === v.toLowerCase())) return items.find((x) => x.toLowerCase() === v.toLowerCase());
  await saveList(key, [...items, v]);
  return v;
}
export async function saveSettings(patch) {
  return save('settings', { ...(S.cache.settings.get('app') || { id: 'app' }), id: 'app', ...patch });
}

// ---------- nhật ký ----------
export function labelOf(coll, d) {
  if (!d) return '';
  if (coll === 'formulas') {
    const p = S.cache.products.get(d.productId);
    return (p ? p.code + ' ' : '') + (d.variant || '') + ' v' + (d.version ?? '?');
  }
  if (coll === 'proposals') { const f = S.cache.formulas.get(d.formulaId); return 'Đề xuất "' + (d.alt?.name || '') + '"' + (f ? ' · ' + labelOf('formulas', f) : ''); }
  if (coll === 'prices') { const i = S.cache.ingredients.get(d.ingId); return (i?.name || '') + ' = ' + d.price; }
  return d.name || d.code || d.id;
}
function localAudit(action, coll, doc, oldDoc, newDoc) {
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(LS + 'audit') || '[]'); } catch { arr = []; }
  arr.unshift({ ts: nowIso(), user: S.user?.name, role: S.role, action, coll, id: doc?.id, label: labelOf(coll, doc), old: oldDoc, new: newDoc });
  localStorage.setItem(LS + 'audit', JSON.stringify(arr.slice(0, 1500)));
}
export async function auditLog(limit = 300) {
  if (isCloud()) {
    const { data, error } = await sb.from('audit_log').select('*').order('ts', { ascending: false }).limit(limit);
    if (error) throw error;
    const map = { INSERT: 'Thêm', UPDATE: 'Sửa', DELETE: 'Xóa' };
    return data.map((r) => ({ ts: r.ts, user: r.user_email, action: map[r.action] || r.action, coll: r.collection, id: r.record_id, label: labelOf(r.collection, r.new_data || r.old_data), old: r.old_data, new: r.new_data }));
  }
  try { return JSON.parse(localStorage.getItem(LS + 'audit') || '[]').slice(0, limit); } catch { return []; }
}
export function setLocalRole(role) { localStorage.setItem('tcc.localRole', role); S.role = role; emit('*'); }
export function setCloudConfig(url, key) {
  if (url && key) { localStorage.setItem('tcc.sbUrl', url.trim()); localStorage.setItem('tcc.sbKey', key.trim()); }
  else { localStorage.removeItem('tcc.sbUrl'); localStorage.removeItem('tcc.sbKey'); }
}

// ---------- quản trị người dùng (đám mây) ----------
export async function listProfiles() {
  const { data, error } = await sb.from('profiles').select('*').order('created_at');
  if (error) throw error;
  return data;
}
export async function updateProfile(id, patch) {
  const { error } = await sb.from('profiles').update(patch).eq('id', id);
  if (error) throw error;
}

// ---------- dữ liệu mẫu ----------
export async function wipeLocal() {
  for (const c of COLLS) { localStorage.removeItem(LS + c); S.cache[c] = new Map(); }
  localStorage.removeItem(LS + 'audit');
  emit('*');
}
export async function loadSample() {
  const { SEED } = await import('./seed.js');
  const ingDocs = []; const priceDocs = []; const byName = {};
  for (const s of SEED.ingredients) {
    const ing = { id: uid(), code: s.code, name: s.name, category: s.category, supplier: s.supplier || '', priceUnit: s.priceUnit, yield: 1, substGroup: '', bomFormulaId: '', stock: null, moq: null, supplyNote: '', lots: [], activeLotId: '', active: true, note: s.note || '' };
    ingDocs.push(ing); byName[s.name] = ing;
    if (s.price != null) priceDocs.push({ id: uid(), ingId: ing.id, price: s.price, type: 'Kế hoạch', date: '2020-02-19', source: 'File mẫu Coconut Jelly 180g', note: '' });
  }
  // chỉ tiêu minh họa (người dùng tự thay bằng chỉ tiêu thật)
  const crit = [
    { id: uid(), name: 'Đường', unit: '%', additive: true, decimals: 1, tol: 0.3, standard: 'Nội bộ', note: 'MINH HỌA – thay bằng chỉ tiêu thật', demo: true },
    { id: uid(), name: 'Nước', unit: '%', additive: true, decimals: 1, tol: 1, standard: 'Nội bộ', note: 'MINH HỌA – thay bằng chỉ tiêu thật', demo: true },
    { id: uid(), name: 'Béo', unit: '%', additive: true, decimals: 2, tol: 0.1, standard: 'Nội bộ', note: 'MINH HỌA – thay bằng chỉ tiêu thật', demo: true },
  ];
  const [cS, cW, cF] = crit.map((c) => c.id);
  const demoSpec = { 'Coconut Water': [2.6, 95, 0.2], Water: [0, 100, 0], 'Jelly Powder': [0, 0, 0], Sugar: [100, 0, 0], 'Shredded Coconut Meat': [0, 50, 33] };
  for (const [n, v] of Object.entries(demoSpec)) {
    const ing = byName[n]; if (!ing) continue;
    const lot = { id: uid(), lot: 'Mẫu minh họa', date: today(), source: 'Giá trị nội bộ', values: { [cS]: v[0], [cW]: v[1], [cF]: v[2] } };
    ing.lots = [lot]; ing.activeLotId = lot.id;
  }
  const sm = SEED.sample;
  const prod = { id: uid(), code: sm.product.code, name: sm.product.name, nameVN: sm.product.nameVN, group: sm.product.group, sellingPrice: null, note: sm.product.note };
  const formula = {
    id: uid(), productId: prod.id, variant: 'Chuẩn', version: 1, status: 'Đang sản xuất', reason: 'Dữ liệu mẫu', note: 'Nhập từ file mẫu để đối chiếu giá thành',
    lines: sm.lines.map(([n, qty, y]) => ({ id: uid(), ingId: byName[n].id, qty, yield: y, minPct: null, maxPct: null, fixed: false, note: '' })),
    extras: sm.extras.map((e) => ({ id: uid(), ...e })),
    reqs: [
      { critId: cS, min: 7, max: 9, tol: 0.3, measured: null },
      { critId: cW, min: 85, max: 92, tol: 1, measured: null },
      { critId: cF, min: 0.5, max: null, tol: 0.1, measured: null },
    ],
  };
  await saveMany('ingredients', ingDocs, 'Dữ liệu mẫu: nguyên liệu');
  await saveMany('prices', priceDocs, 'Dữ liệu mẫu: giá');
  await saveMany('criteria', crit, 'Dữ liệu mẫu: chỉ tiêu');
  await saveMany('products', [prod], 'Dữ liệu mẫu: sản phẩm');
  await saveMany('formulas', [formula], 'Dữ liệu mẫu: công thức');
}
