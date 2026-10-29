// Nhập / xuất Excel (SheetJS) và sao lưu JSON
import { all, get, saveMany, save, addToList, getList, S, can } from './store.js';
import { formulaCost, qualitySummary, fLabel, mkCtx, refreshSnapshots, REQ_LABEL } from './calc.js';
import { STATUSES, UNITS, COLLS } from './defaults.js';
import { uid, today, normalize, parseNum, download, nowIso, clone } from './util.js';

const X = () => window.XLSX;

// ---------- mẫu nhập ----------
const SHEETS = {
  NguyenLieu: ['Mã', 'Tên', 'Nhóm', 'Nhà cung cấp', 'Đơn vị giá', 'Định mức mặc định', 'Nhóm thay thế', 'Ghi chú'],
  Gia: ['Mã nguyên liệu', 'Giá', 'Loại giá', 'Ngày hiệu lực', 'Nguồn'],
  ChiTieu: ['Tên chỉ tiêu', 'Đơn vị', 'Cộng theo tỷ lệ', 'Dung sai mặc định'],
  HamLuong: ['Mã nguyên liệu', 'Chỉ tiêu', 'Giá trị trên 100g', 'Lô', 'Nguồn'],
  SanPham: ['Mã SP', 'Tên', 'Tên khác', 'Nhóm', 'Giá bán'],
  CongThuc: ['Mã SP', 'Biến thể', 'Phiên bản', 'Trạng thái', 'Mã nguyên liệu', 'Lượng (g)', 'Định mức', 'Min %', 'Max %', 'Khóa'],
  ChiPhiKhac: ['Mã SP', 'Biến thể', 'Phiên bản', 'Loại', 'Diễn giải', 'Số tiền'],
  YeuCau: ['Mã SP', 'Biến thể', 'Phiên bản', 'Chỉ tiêu', 'Tối thiểu', 'Tối đa', 'Dung sai'],
};
const SAMPLE = {
  NguyenLieu: [['NL900', 'Coconut Water', 'Nguyên liệu', 'Nhà cung cấp A', 'kg', 1, '', ''], ['NL901', 'Sugar', 'Nguyên liệu', '', 'kg', 1, 'Đường', '']],
  Gia: [['NL900', 18000, 'Kế hoạch', '2026-01-01', 'Báo giá tháng 1'], ['NL901', 13500, 'Kế hoạch', '2026-01-01', '']],
  ChiTieu: [['Đường', '%', 'Có', 0.3]],
  HamLuong: [['NL900', 'Đường', 2.6, 'Lô 001', 'Phiếu kiểm nghiệm'], ['NL901', 'Đường', 100, 'Lô 001', 'Bảng tham chiếu']],
  SanPham: [['SP900', 'Sản phẩm mẫu', 'Tên khác', 'Nhóm ưu tiên', 10000]],
  CongThuc: [['SP900', 'Chuẩn', 1, 'Nháp', 'NL900', 80, 1.0526, '', '', 'Không'], ['SP900', 'Chuẩn', 1, 'Nháp', 'NL901', 10, 1.0526, 5, 15, 'Không']],
  ChiPhiKhac: [['SP900', 'Chuẩn', 1, 'Bao bì', 'Ly, nắp, nhãn', 747]],
  YeuCau: [['SP900', 'Chuẩn', 1, 'Đường', 7, 9, 0.3]],
};
const HELP = [
  ['HƯỚNG DẪN NHẬP EXCEL'],
  ['Mỗi sheet là một loại dữ liệu; giữ nguyên dòng tiêu đề (dòng 1). Có thể bỏ qua sheet không cần.'],
  ['Các dòng ví dụ (mã NL900, SP900…) chỉ để minh họa định dạng: hãy xóa/thay bằng dữ liệu thật trước khi nhập.'],
  ['Nhóm nguyên liệu: Nguyên liệu / Phụ gia / Bao bì / Bán thành phẩm. Đơn vị giá: ' + UNITS.join(', ') + '.'],
  ['Giá tính theo đơn vị giá của nguyên liệu (VD kg), công thức nhập lượng theo gam. Loại giá: Kế hoạch / Thực tế / Ước tính.'],
  ['Công thức được nhận diện bằng bộ ba: Mã SP + Biến thể + Phiên bản. Phiên bản đã có trong app sẽ bị bỏ qua (hãy tăng số phiên bản).'],
  ['Trạng thái: ' + STATUSES.join(' / ') + '. Mặc định là Nháp. Chuyển "Đang sản xuất" cần người duyệt thao tác trong app.'],
  ['Số có dấu thập phân dùng dấu chấm hoặc phẩy đều được. Ngày theo dạng 2026-01-31 hoặc 31/01/2026.'],
];
export function downloadTemplate() {
  const wb = X().utils.book_new();
  X().utils.book_append_sheet(wb, X().utils.aoa_to_sheet(HELP.map((r) => r)), 'HuongDan');
  for (const [name, head] of Object.entries(SHEETS)) {
    const ws = X().utils.aoa_to_sheet([head, ...(SAMPLE[name] || [])]);
    ws['!cols'] = head.map((h) => ({ wch: Math.max(14, h.length + 4) }));
    X().utils.book_append_sheet(wb, ws, name);
  }
  X().writeFile(wb, 'Mau_nhap_du_lieu.xlsx');
}

// ---------- đọc & kiểm tra file nhập ----------
const key = (s) => normalize(String(s ?? '')).replace(/[^a-z0-9]/g, '');
function sheetRows(wb, name) {
  const real = wb.SheetNames.find((n) => key(n) === key(name));
  if (!real) return null;
  const aoa = X().utils.sheet_to_json(wb.Sheets[real], { header: 1, defval: '', raw: true });
  if (aoa.length < 2) return [];
  const head = aoa[0].map((x) => key(x));
  const idx = SHEETS[name].map((h) => head.indexOf(key(h)));
  const out = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (row.every((c) => c === '' || c == null)) continue;
    const o = { _row: r + 1 };
    SHEETS[name].forEach((h, i) => { o[h] = idx[i] >= 0 ? row[idx[i]] : ''; });
    out.push(o);
  }
  return out;
}
const str = (v) => String(v ?? '').trim();
const yes = (v) => ['co', 'yes', 'true', '1', 'x', 'y'].includes(key(v));
function toDate(v) {
  if (v === '' || v == null) return today();
  if (typeof v === 'number') { const d = X().SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : today(); }
  const s = String(v).trim(); let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(s))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export async function planImport(file) {
  const buf = await file.arrayBuffer();
  const wb = X().read(buf, { type: 'array', cellDates: false });
  const errors = []; const warn = (sheet, row, msg) => errors.push({ sheet, row, msg });
  const plan = { ingredients: [], prices: [], criteria: [], products: [], formulas: [], lists: {}, summary: {}, errors };
  const addList = (k, v) => { v = str(v); if (v) (plan.lists[k] ||= new Set()).add(v); };

  const ingByCode = new Map(all('ingredients').map((i) => [i.code.toLowerCase(), clone(i)]));
  const critByName = new Map(all('criteria').map((c) => [c.name.toLowerCase(), clone(c)]));
  const prodByCode = new Map(all('products').map((p) => [p.code.toLowerCase(), clone(p)]));
  const touchedIng = new Set(), touchedCrit = new Set(), touchedProd = new Set();
  const stat = { ing: [0, 0], crit: [0, 0], prod: [0, 0], price: 0, spec: 0, form: 0, line: 0 };

  // nguyên liệu
  for (const r of sheetRows(wb, 'NguyenLieu') || []) {
    const code = str(r['Mã']), name = str(r['Tên']);
    if (!code || !name) { warn('NguyenLieu', r._row, 'Thiếu mã hoặc tên'); continue; }
    const unit = str(r['Đơn vị giá']) || 'kg';
    if (!UNITS.includes(unit)) { warn('NguyenLieu', r._row, 'Đơn vị giá "' + unit + '" không hợp lệ (dùng: ' + UNITS.join(', ') + ')'); continue; }
    const ex = ingByCode.get(code.toLowerCase());
    const d = ex || { id: uid(), code, name, category: 'Nguyên liệu', supplier: '', priceUnit: unit, yield: 1, substGroup: '', bomFormulaId: '', lots: [], activeLotId: '', active: true, note: '' };
    d.name = name; if (str(r['Nhóm'])) d.category = str(r['Nhóm']); if (str(r['Nhà cung cấp'])) d.supplier = str(r['Nhà cung cấp']);
    d.priceUnit = unit; const y = parseNum(r['Định mức mặc định']); if (y != null && y > 0) d.yield = y;
    if (str(r['Nhóm thay thế'])) d.substGroup = str(r['Nhóm thay thế']); if (str(r['Ghi chú'])) d.note = str(r['Ghi chú']);
    addList('categories', d.category); addList('suppliers', d.supplier); addList('substGroups', d.substGroup);
    ingByCode.set(code.toLowerCase(), d); touchedIng.add(code.toLowerCase()); stat.ing[ex ? 1 : 0]++;
  }
  // chỉ tiêu
  for (const r of sheetRows(wb, 'ChiTieu') || []) {
    const name = str(r['Tên chỉ tiêu']); if (!name) { warn('ChiTieu', r._row, 'Thiếu tên chỉ tiêu'); continue; }
    const ex = critByName.get(name.toLowerCase());
    const d = ex || { id: uid(), name, unit: '%', additive: true, decimals: 2, tol: null, standard: 'Nội bộ', note: '' };
    if (str(r['Đơn vị'])) d.unit = str(r['Đơn vị']);
    if (str(r['Cộng theo tỷ lệ']) !== '') d.additive = yes(r['Cộng theo tỷ lệ']);
    const t = parseNum(r['Dung sai mặc định']); if (t != null) d.tol = t;
    addList('critUnits', d.unit);
    critByName.set(name.toLowerCase(), d); touchedCrit.add(name.toLowerCase()); stat.crit[ex ? 1 : 0]++;
  }
  // sản phẩm
  for (const r of sheetRows(wb, 'SanPham') || []) {
    const code = str(r['Mã SP']), name = str(r['Tên']);
    if (!code || !name) { warn('SanPham', r._row, 'Thiếu mã hoặc tên'); continue; }
    const ex = prodByCode.get(code.toLowerCase());
    const d = ex || { id: uid(), code, name, nameVN: '', group: '', sellingPrice: null, note: '' };
    d.name = name; if (str(r['Tên khác'])) d.nameVN = str(r['Tên khác']); if (str(r['Nhóm'])) d.group = str(r['Nhóm']);
    const sp = parseNum(r['Giá bán']); if (sp != null) d.sellingPrice = sp;
    addList('productGroups', d.group);
    prodByCode.set(code.toLowerCase(), d); touchedProd.add(code.toLowerCase()); stat.prod[ex ? 1 : 0]++;
  }
  // giá
  const existingPrice = new Set(all('prices').map((p) => [p.ingId, p.type, p.date, p.price].join('|')));
  for (const r of sheetRows(wb, 'Gia') || []) {
    const code = str(r['Mã nguyên liệu']).toLowerCase(); const ing = ingByCode.get(code);
    if (!ing) { warn('Gia', r._row, 'Không có nguyên liệu mã "' + str(r['Mã nguyên liệu']) + '"'); continue; }
    const price = parseNum(r['Giá']); if (price == null || price < 0) { warn('Gia', r._row, 'Giá không hợp lệ'); continue; }
    const date = toDate(r['Ngày hiệu lực']); if (!date) { warn('Gia', r._row, 'Ngày không hợp lệ'); continue; }
    const type = str(r['Loại giá']) || 'Kế hoạch';
    if (existingPrice.has([ing.id, type, date, price].join('|'))) continue;
    plan.prices.push({ id: uid(), ingId: ing.id, price, type, date, source: str(r['Nguồn']) || 'Nhập Excel', note: '' });
    addList('priceTypes', type); touchedIng.add(code); stat.price++;
  }
  // hàm lượng chỉ tiêu
  for (const r of sheetRows(wb, 'HamLuong') || []) {
    const code = str(r['Mã nguyên liệu']).toLowerCase(); const ing = ingByCode.get(code);
    const crit = critByName.get(str(r['Chỉ tiêu']).toLowerCase());
    if (!ing) { warn('HamLuong', r._row, 'Không có nguyên liệu mã "' + str(r['Mã nguyên liệu']) + '"'); continue; }
    if (!crit) { warn('HamLuong', r._row, 'Chưa có chỉ tiêu "' + str(r['Chỉ tiêu']) + '" (thêm vào sheet ChiTieu)'); continue; }
    const v = parseNum(r['Giá trị trên 100g']); if (v == null) { warn('HamLuong', r._row, 'Giá trị không hợp lệ'); continue; }
    const lotName = str(r['Lô']) || 'Nhập Excel';
    ing.lots ||= [];
    let lot = ing.lots.find((l) => (l.lot || '').toLowerCase() === lotName.toLowerCase());
    if (!lot) { lot = { id: uid(), lot: lotName, date: today(), source: str(r['Nguồn']), values: {} }; ing.lots.push(lot); }
    lot.values[crit.id] = v; ing.activeLotId = lot.id; addList('specSources', r['Nguồn']);
    touchedIng.add(code); stat.spec++;
  }
  // công thức
  const fKey = (p, v, n) => [p.toLowerCase(), (v || 'Chuẩn').toLowerCase(), n].join('|');
  const existF = new Set(all('formulas').map((f) => { const p = get('products', f.productId); return p ? fKey(p.code, f.variant || 'Chuẩn', f.version) : ''; }));
  const newF = new Map();
  for (const r of sheetRows(wb, 'CongThuc') || []) {
    const pc = str(r['Mã SP']); const prod = prodByCode.get(pc.toLowerCase());
    if (!prod) { warn('CongThuc', r._row, 'Không có sản phẩm mã "' + pc + '"'); continue; }
    const variant = str(r['Biến thể']) || 'Chuẩn'; const ver = parseNum(r['Phiên bản']) || 1;
    const k = fKey(pc, variant, ver);
    if (existF.has(k)) { if (!newF.has(k)) warn('CongThuc', r._row, 'Công thức ' + pc + ' · ' + variant + ' · v' + ver + ' đã có trong app: bỏ qua (hãy tăng phiên bản)'); continue; }
    const ing = ingByCode.get(str(r['Mã nguyên liệu']).toLowerCase());
    if (!ing) { warn('CongThuc', r._row, 'Không có nguyên liệu mã "' + str(r['Mã nguyên liệu']) + '"'); continue; }
    const qty = parseNum(r['Lượng (g)']); if (qty == null || qty < 0) { warn('CongThuc', r._row, 'Lượng không hợp lệ'); continue; }
    let f = newF.get(k);
    if (!f) {
      const st = str(r['Trạng thái']);
      f = { id: uid(), productId: prod.id, variant, version: ver, status: STATUSES.includes(st) && st !== 'Đang sản xuất' ? st : 'Nháp', reason: 'Khác', note: 'Nhập từ Excel', lines: [], extras: [], reqs: [], _pc: pc.toLowerCase() };
      newF.set(k, f); addList('variants', variant); stat.form++;
    }
    const y = parseNum(r['Định mức']);
    f.lines.push({ id: uid(), ingId: ing.id, qty, yield: y && y > 0 ? y : null, minPct: parseNum(r['Min %']), maxPct: parseNum(r['Max %']), fixed: yes(r['Khóa']), note: '' }); stat.line++;
    touchedIng.add(str(r['Mã nguyên liệu']).toLowerCase());
  }
  const needF = (sheet, r) => { const k = fKey(str(r['Mã SP']), str(r['Biến thể']) || 'Chuẩn', parseNum(r['Phiên bản']) || 1); const f = newF.get(k); if (!f) warn(sheet, r._row, 'Không thấy công thức tương ứng trong sheet CongThuc (hoặc đã có trong app)'); return f; };
  for (const r of sheetRows(wb, 'ChiPhiKhac') || []) {
    const f = needF('ChiPhiKhac', r); if (!f) continue;
    const amt = parseNum(r['Số tiền']); if (amt == null) { warn('ChiPhiKhac', r._row, 'Số tiền không hợp lệ'); continue; }
    f.extras.push({ id: uid(), kind: str(r['Loại']) || 'Khác', name: str(r['Diễn giải']), amount: amt, note: '' }); addList('costKinds', r['Loại']);
  }
  for (const r of sheetRows(wb, 'YeuCau') || []) {
    const f = needF('YeuCau', r); if (!f) continue;
    const crit = critByName.get(str(r['Chỉ tiêu']).toLowerCase());
    if (!crit) { warn('YeuCau', r._row, 'Chưa có chỉ tiêu "' + str(r['Chỉ tiêu']) + '"'); continue; }
    f.reqs.push({ critId: crit.id, min: parseNum(r['Tối thiểu']), max: parseNum(r['Tối đa']), tol: parseNum(r['Dung sai']), measured: null });
  }
  plan.ingredients = [...ingByCode.values()].filter((i) => touchedIng.has(i.code.toLowerCase()));
  plan.criteria = [...critByName.values()].filter((c) => touchedCrit.has(c.name.toLowerCase()));
  plan.products = [...prodByCode.values()].filter((p) => touchedProd.has(p.code.toLowerCase()));
  plan.formulas = [...newF.values()].map((f) => { const { _pc, ...rest } = f; return rest; });
  plan.summary = { 'Nguyên liệu': stat.ing[0] + ' mới, ' + stat.ing[1] + ' cập nhật', 'Chỉ tiêu': stat.crit[0] + ' mới, ' + stat.crit[1] + ' cập nhật', 'Sản phẩm': stat.prod[0] + ' mới, ' + stat.prod[1] + ' cập nhật', 'Dòng giá': stat.price, 'Hàm lượng chỉ tiêu': stat.spec, 'Công thức mới': stat.form + ' (' + stat.line + ' dòng nguyên liệu)' };
  return plan;
}
export async function applyImport(plan) {
  for (const [k, set] of Object.entries(plan.lists)) for (const v of set) await addToList(k, v);
  if (plan.ingredients.length) await saveMany('ingredients', plan.ingredients, 'Nhập Excel: nguyên liệu');
  if (plan.criteria.length) await saveMany('criteria', plan.criteria, 'Nhập Excel: chỉ tiêu');
  if (plan.products.length) await saveMany('products', plan.products, 'Nhập Excel: sản phẩm');
  if (plan.prices.length) await saveMany('prices', plan.prices, 'Nhập Excel: giá');
  if (plan.formulas.length) await saveMany('formulas', plan.formulas, 'Nhập Excel: công thức');
  await refreshSnapshots();
}

// ---------- xuất ----------
function book(sheets, name) {
  const wb = X().utils.book_new();
  for (const [n, aoa, cols] of sheets) {
    const ws = X().utils.aoa_to_sheet(aoa);
    if (cols) ws['!cols'] = cols.map((w) => ({ wch: w }));
    X().utils.book_append_sheet(wb, ws, n.slice(0, 31));
  }
  X().writeFile(wb, name);
}
const slug = (s) => normalize(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
export function exportFormula(ctx, f, basis) {
  const c = formulaCost(ctx, f, basis); const q = qualitySummary(ctx, f, c); const p = ctx.products.get(f.productId);
  const lines = [['Giá thành công thức'], ['Sản phẩm', p?.name || '', 'Mã', p?.code || ''], ['Biến thể', f.variant, 'Phiên bản', 'v' + f.version, 'Trạng thái', f.status], ['Loại giá', basis, 'Xuất lúc', new Date().toLocaleString('vi-VN')], [],
    ['STT', 'Nguyên liệu', 'Lượng (g)', 'Định mức', 'Hao hụt %', 'Lượng thô (g)', 'Đơn giá (đ/g)', 'Thành tiền (đ)']];
  c.lines.forEach((l, i) => lines.push([i + 1, l.ing?.name || '', l.qty, l.y, l.y > 0 ? Math.round((1 - 1 / l.y) * 10000) / 100 : '', Math.round(l.raw * 1e4) / 1e4, l.unit == null ? 'Thiếu giá' : Math.round(l.unit * 1e4) / 1e4, Math.round(l.cost * 100) / 100]));
  lines.push(['', 'Tổng chi phí nguyên liệu', c.weight, '', '', '', '', Math.round(c.material * 100) / 100]);
  for (const e of f.extras || []) lines.push(['', (e.kind || 'Khác') + (e.name ? ': ' + e.name : ''), '', '', '', '', '', Number(e.amount) || 0]);
  lines.push(['', 'GIÁ THÀNH / PHẦN', '', '', '', '', '', Math.round(c.total * 100) / 100]);
  const qs = [['Chỉ tiêu', 'Giá trị', 'Tối thiểu', 'Tối đa', 'Dung sai', 'Kết quả']];
  for (const r of q.rows) qs.push([r.crit?.name || '', r.value == null ? '' : Math.round(r.value * 1e4) / 1e4, r.req.min ?? '', r.req.max ?? '', r.req.tol ?? '', REQ_LABEL[r.status][0]]);
  book([['GiaThanh', lines, [6, 34, 12, 11, 11, 14, 14, 16]], ['ChatLuong', qs, [22, 12, 12, 12, 12, 18]]], 'GiaThanh_' + slug((p?.code || '') + '_' + f.variant + '_v' + f.version) + '.xlsx');
}
export function exportCompare(ctx, fa, fb, basis) {
  const ca = formulaCost(ctx, fa, basis), cb = formulaCost(ctx, fb, basis);
  const ids = [...new Set([...ca.lines.map((l) => l.ingId), ...cb.lines.map((l) => l.ingId)])];
  const la = new Map(ca.lines.map((l) => [l.ingId, l])), lb = new Map(cb.lines.map((l) => [l.ingId, l]));
  const aoa = [['So sánh phiên bản'], ['A', fLabel(ctx, fa)], ['B', fLabel(ctx, fb)], ['Loại giá', basis], [], ['Nguyên liệu', 'A (g)', 'B (g)', 'Chênh (g)', 'Chi phí A', 'Chi phí B', 'Chênh chi phí']];
  for (const id of ids) { const x = la.get(id), y = lb.get(id); aoa.push([(x || y).ing?.name || '', x?.qty || 0, y?.qty || 0, (y?.qty || 0) - (x?.qty || 0), Math.round((x?.cost || 0) * 100) / 100, Math.round((y?.cost || 0) * 100) / 100, Math.round(((y?.cost || 0) - (x?.cost || 0)) * 100) / 100]); }
  aoa.push(['Giá thành / phần', '', '', '', Math.round(ca.total * 100) / 100, Math.round(cb.total * 100) / 100, Math.round((cb.total - ca.total) * 100) / 100]);
  book([['SoSanh', aoa, [34, 11, 11, 11, 14, 14, 16]]], 'SoSanh_phien_ban.xlsx');
}
export function exportSavings(ctx, rows) {
  const aoa = [['Tiết kiệm đã đạt (theo phần)'], [], ['Công thức gốc', 'Phương án', 'Ngày duyệt', 'Tiết kiệm khi duyệt (đ)', 'Tiết kiệm % khi duyệt', 'Tiết kiệm theo giá hiện tại (đ)', 'Người duyệt']];
  for (const r of rows) aoa.push([r.base ? fLabel(ctx, r.base) : '', r.p.alt?.name || '', (r.p.approvals?.at(-1)?.at || '').slice(0, 10), Math.round(r.atApproval * 100) / 100, Math.round((r.p.alt?.savingPct || 0) * 100) / 100, r.now == null ? '' : Math.round(r.now * 100) / 100, (r.p.approvals || []).map((a) => a.by).join(', ')]);
  book([['TietKiem', aoa, [40, 20, 12, 18, 14, 22, 28]]], 'Tiet_kiem_da_dat.xlsx');
}
export function exportSimulation(ctx, r) {
  const aoa = [['Mô phỏng biến động giá'], ['Kịch bản', r.rows.map((x) => (ctx.ing.get(x.ingId)?.name || '') + ' ' + x.pct + '%').join('; ')], ['Loại giá', r.basis], [], ['Công thức', 'Giá thành cũ', 'Giá thành mới', 'Chênh (đ)', 'Chênh %']];
  for (const x of r.list) aoa.push([fLabel(ctx, x.f), Math.round(x.a * 100) / 100, Math.round(x.b * 100) / 100, Math.round(x.d * 100) / 100, Math.round(x.p * 100) / 100]);
  book([['MoPhong', aoa, [40, 14, 14, 12, 10]]], 'Mo_phong_gia.xlsx');
}
export function exportPriceList() {
  const ctx = mkCtx();
  const aoa = [['Mã', 'Nguyên liệu', 'Nhóm', 'Nhà cung cấp', 'Đơn vị', 'Giá kế hoạch', 'Giá thực tế', 'Giá ước tính']];
  for (const i of all('ingredients').sort((a, b) => a.code.localeCompare(b.code))) {
    const m = ctx.priceIdx.get(i.id) || {};
    aoa.push([i.code, i.name, i.category, i.supplier || '', i.priceUnit, m['Kế hoạch']?.price ?? '', m['Thực tế']?.price ?? '', m['Ước tính']?.price ?? '']);
  }
  book([['BangGia', aoa, [10, 34, 14, 20, 8, 14, 14, 14]]], 'Bang_gia_nguyen_lieu.xlsx');
}
export function exportCostBoard() {
  const ctx = mkCtx(); const basis = 'Kế hoạch';
  const aoa = [['Mã SP', 'Sản phẩm', 'Biến thể', 'Phiên bản', 'Trạng thái', 'Giá thành/phần', 'Nguyên liệu', 'Chi phí khác', 'Khối lượng (g)']];
  for (const f of ctx.formulas.values()) { const p = ctx.products.get(f.productId); if (!p) continue; const c = formulaCost(ctx, f, basis); aoa.push([p.code, p.name, f.variant, f.version, f.status, Math.round(c.total * 100) / 100, Math.round(c.material * 100) / 100, c.extras, Math.round(c.weight * 100) / 100]); }
  book([['GiaThanh', aoa, [10, 30, 12, 9, 14, 14, 14, 12, 12]]], 'Gia_thanh_tat_ca.xlsx');
}

// ---------- sao lưu JSON ----------
export function backupJson() {
  const data = { app: 'tinh-toan-toi-uu-gia-thanh', version: 1, at: nowIso(), by: S.user?.name, data: {} };
  for (const c of COLLS) data.data[c] = all(c);
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'Sao_luu_' + today() + '.json');
}
export async function restoreJson(file) {
  const j = JSON.parse(await file.text());
  if (j.app !== 'tinh-toan-toi-uu-gia-thanh' || !j.data) throw new Error('Đây không phải file sao lưu của ứng dụng.');
  let n = 0;
  for (const c of COLLS) { const docs = j.data[c] || []; if (docs.length) { await saveMany(c, docs, 'Khôi phục sao lưu', {}); n += docs.length; } }
  return n;
}
