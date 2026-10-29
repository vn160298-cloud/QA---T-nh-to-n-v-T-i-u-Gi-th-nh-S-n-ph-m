// Tiện ích dùng chung (không phụ thuộc dữ liệu)
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'readOnly') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  appendKids(el, kids);
  return el;
}
export function appendKids(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
export const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
export const today = () => new Date().toISOString().slice(0, 10);
export const nowIso = () => new Date().toISOString();

const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
export function vnd(n, dec = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  const f = dec ? new Intl.NumberFormat('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : nf0;
  return f.format(dec ? n : Math.round(n)) + ' đ';
}
export function num(n, d = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: d }).format(n);
}
export function pct(n, d = 1) { return n == null || Number.isNaN(n) ? '—' : num(n, d) + '%'; }
export function signed(n, d = 0) { if (n == null || Number.isNaN(n)) return '—'; const s = n > 0 ? '+' : n < 0 ? '−' : ''; return s + num(Math.abs(n), d); }
// đọc số người dùng gõ (chấp nhận dấu phẩy thập phân); rỗng -> null
export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, '');
  if (s === '') return null;
  const n = Number(s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
export function fmtDate(d) {
  if (!d) return '';
  const x = new Date(d); if (isNaN(x)) return String(d);
  return x.toLocaleDateString('vi-VN');
}
export function fmtDateTime(d) {
  if (!d) return '';
  const x = new Date(d); if (isNaN(x)) return String(d);
  return x.toLocaleString('vi-VN', { hour12: false });
}
export function addMonths(iso, m) { const d = new Date(iso); d.setMonth(d.getMonth() + m); return d.toISOString(); }
export function debounce(fn, ms = 120) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function normalize(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase(); }
export function byName(a, b) { return String(a).localeCompare(String(b), 'vi'); }
export function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
