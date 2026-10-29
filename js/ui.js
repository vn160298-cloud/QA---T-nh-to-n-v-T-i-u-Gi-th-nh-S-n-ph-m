// Thành phần giao diện dùng chung: hộp thoại, thông báo, ô chọn xổ xuống, ô chọn có tìm kiếm...
import { h, clear, normalize, parseNum } from './util.js';
import { getList, addToList, can } from './store.js';
import { STATUS_CLASS } from './defaults.js';

// ---------- thông báo ----------
let toastBox;
export function toast(msg, kind = '') {
  if (!toastBox) { toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.append(toastBox); }
  const t = h('div', { class: 'toast ' + kind }, msg);
  toastBox.append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 6000 : 3000);
}
export async function guard(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg, 'ok'); return r; }
  catch (e) { console.error(e); toast(e?.message || String(e), 'bad'); return undefined; }
}

// ---------- hộp thoại ----------
export function openModal({ title, body, actions = [], wide = false, onClose }) {
  const back = h('div', { class: 'modalback' });
  const bodyEl = h('div', { class: 'body' });
  const footer = h('footer', {});
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const m = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', {}, h('h3', {}, title), h('button', { class: 'iconbtn', style: { color: 'var(--muted)' }, onClick: close, 'aria-label': 'Đóng' }, '✕')),
    bodyEl, footer);
  const setBody = (c) => { clear(bodyEl); bodyEl.append(...[].concat(c).flat().filter(Boolean).map((x) => (x.nodeType ? x : document.createTextNode(x)))); };
  setBody(body);
  const setActions = (acts) => {
    clear(footer);
    for (const a of acts) {
      const b = h('button', { class: 'btn ' + (a.kind || ''), disabled: a.disabled }, a.label);
      b.addEventListener('click', async () => {
        b.disabled = true;
        try { const r = await a.onClick?.(close, api); if (!a.keepOpen && r !== false) close(); }
        catch (e) { console.error(e); toast(e?.message || String(e), 'bad'); }
        finally { b.disabled = false; }
      });
      footer.append(b);
    }
    footer.classList.toggle('hide', !acts.length);
  };
  const api = { el: bodyEl, close, setBody, setActions };
  setActions(actions);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  back.append(m); document.body.append(back);
  return api;
}
export function confirmBox(message, { okLabel = 'Đồng ý', danger = false, title = 'Xác nhận' } = {}) {
  return new Promise((res) => {
    let done = false;
    openModal({
      title, body: h('p', {}, message),
      onClose: () => { if (!done) res(false); },
      actions: [
        { label: 'Hủy', onClick: () => { done = true; res(false); } },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => { done = true; res(true); } },
      ],
    });
  });
}
export function promptBox(title, label, value = '', { multiline = false, required = true, placeholder = '' } = {}) {
  return new Promise((res) => {
    let done = false;
    const inp = multiline ? h('textarea', { placeholder }, value) : h('input', { value, placeholder });
    inp.value = value;
    const m = openModal({
      title, body: h('label', { class: 'fld' }, label, inp),
      onClose: () => { if (!done) res(null); },
      actions: [
        { label: 'Hủy', onClick: () => { done = true; res(null); } },
        { label: 'Lưu', kind: 'primary', onClick: () => { const v = inp.value.trim(); if (required && !v) { toast('Vui lòng nhập nội dung', 'bad'); return false; } done = true; res(v); } },
      ],
    });
    setTimeout(() => inp.focus(), 50);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !multiline) { e.preventDefault(); m.el.closest('.modal').querySelector('footer .btn.primary').click(); } });
  });
}

// ---------- ô chọn có tìm kiếm (nguyên liệu, sản phẩm...) ----------
// options: [{value,label,sub}]
export function picker({ options, value, onChange, placeholder = 'Chọn…', title = 'Chọn', allowEmpty = false, disabled = false }) {
  let cur = value;
  const btn = h('button', { type: 'button', class: 'picker', disabled });
  const paint = () => {
    const o = options.find((x) => x.value === cur);
    clear(btn);
    btn.append(h('span', { class: 't' + (o ? '' : ' ph') }, o ? o.label : placeholder), h('span', { class: 'arr' }, '▾'));
  };
  paint();
  btn.addEventListener('click', () => {
    const search = h('input', { type: 'search', placeholder: 'Tìm…', 'aria-label': 'Tìm' });
    const list = h('div', { class: 'pickerlist' });
    const m = openModal({ title, body: [search, list], actions: allowEmpty ? [{ label: 'Bỏ chọn', onClick: () => { cur = ''; paint(); onChange && onChange(''); } }] : [] });
    const render = () => {
      const q = normalize(search.value); clear(list);
      const items = options.filter((o) => !q || normalize(o.label + ' ' + (o.sub || '')).includes(q)).slice(0, 200);
      if (!items.length) list.append(h('div', { class: 'empty' }, 'Không có kết quả'));
      for (const o of items) list.append(h('button', { type: 'button', class: o.value === cur ? 'cur' : '', onClick: () => { cur = o.value; paint(); onChange && onChange(cur); m.close(); } }, h('span', {}, o.label), o.sub ? h('span', { class: 'sub' }, o.sub) : null));
    };
    search.addEventListener('input', render); render();
    setTimeout(() => search.focus(), 60);
  });
  btn.setValue = (v) => { cur = v; paint(); };
  return btn;
}

// ---------- danh sách xổ xuống do người dùng quản lý (kèm "Thêm mới") ----------
export function listSelect({ key, value, onChange, placeholder = '— Chọn —', allowAdd = true, extra = [], disabled = false }) {
  const sel = h('select', { disabled });
  const fill = (val) => {
    clear(sel);
    sel.append(h('option', { value: '' }, placeholder));
    const items = [...new Set([...getList(key), ...extra])];
    if (val && !items.includes(val)) items.push(val);
    for (const i of items) sel.append(h('option', { value: i }, i));
    if (allowAdd && can('lists', 'w')) sel.append(h('option', { value: '__new__' }, '➕ Thêm giá trị mới…'));
    sel.value = val || '';
  };
  fill(value);
  let last = value || '';
  sel.addEventListener('change', async () => {
    if (sel.value === '__new__') {
      const v = await promptBox('Thêm vào danh sách', 'Giá trị mới');
      if (v) { const added = await guard(() => addToList(key, v)); fill(added || v); last = sel.value; onChange && onChange(sel.value); }
      else sel.value = last;
      return;
    }
    last = sel.value; onChange && onChange(sel.value);
  });
  sel.setValue = (v) => { fill(v); last = v || ''; };
  return sel;
}
// ô chọn đơn giản từ mảng cố định
export function plainSelect({ items, value, onChange, placeholder, disabled = false }) {
  const sel = h('select', { disabled });
  if (placeholder != null) sel.append(h('option', { value: '' }, placeholder));
  for (const i of items) { const [v, l] = Array.isArray(i) ? i : [i, i]; sel.append(h('option', { value: v }, l)); }
  sel.value = value ?? '';
  sel.addEventListener('change', () => onChange && onChange(sel.value));
  return sel;
}

// ---------- ô nhập ----------
export function field(label, control, hint) {
  return h('label', { class: 'fld' }, label, control, hint ? h('span', { class: 'small muted', style: { fontWeight: 400 } }, hint) : null);
}
export function numInput({ value, onInput, step = 'any', placeholder = '', min, readOnly = false }) {
  const i = h('input', { type: 'text', inputmode: 'decimal', placeholder, readOnly });
  i.value = value == null || value === '' ? '' : String(typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value).replace('.', ',');
  if (!readOnly) i.addEventListener('input', () => onInput && onInput(parseNum(i.value), i));
  return i;
}
export function textInput({ value, onInput, placeholder = '', type = 'text', readOnly = false }) {
  const i = h('input', { type, placeholder, readOnly });
  i.value = value ?? '';
  i.addEventListener('input', () => onInput && onInput(i.value));
  return i;
}
export function checkbox(label, checked, onChange) {
  const c = h('input', { type: 'checkbox', checked: !!checked });
  c.addEventListener('change', () => onChange && onChange(c.checked));
  return h('label', { class: 'chk' }, c, label);
}

// ---------- các mảnh nhỏ ----------
export const statusChip = (s) => h('span', { class: 'chip ' + (STATUS_CLASS[s] || '') }, s);
export const chip = (text, kind = '') => h('span', { class: 'chip ' + kind }, text);
export const banner = (kind, ...kids) => h('div', { class: 'banner ' + kind }, ...kids);
export const empty = (text, action) => h('div', { class: 'empty' }, h('p', {}, text), action || null);
export function tabs(items, current, onPick) {
  const el = h('div', { class: 'tabs', role: 'tablist' });
  for (const [k, l] of items) el.append(h('button', { class: k === current ? 'on' : '', role: 'tab', 'aria-selected': k === current, onClick: () => onPick(k) }, l));
  return el;
}
export function table(headers, rows, { foot, cls = '', onRow } = {}) {
  const t = h('table', { class: 't ' + cls });
  t.append(h('thead', {}, h('tr', {}, headers.map((x) => { const [l, c] = Array.isArray(x) ? x : [x, '']; return h('th', { class: c }, l); }))));
  const tb = h('tbody', {});
  for (const r of rows) {
    const cells = r.cells || r;
    const tr = h('tr', { class: onRow ? 'click' : '' }, cells.map((c, i) => { const hd = headers[i]; const cl = Array.isArray(hd) ? hd[1] : ''; return h('td', { class: cl }, c); }));
    if (onRow) tr.addEventListener('click', () => onRow(r.data ?? r));
    tb.append(tr);
  }
  t.append(tb);
  if (foot) t.append(h('tfoot', {}, h('tr', {}, foot.map((c, i) => { const hd = headers[i]; const cl = Array.isArray(hd) ? hd[1] : ''; return h('td', { class: cl }, c); }))));
  return h('div', { class: 'tablewrap' }, t);
}
export const hooks = {}; // main.js gắn: install, logout, boot, isStandalone
export function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }
