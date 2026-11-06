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
// Bảng "Nguyên liệu + giá" (theo file mẫu của công ty): mỗi dòng là một nguyên liệu kèm giá
const LIST_HEAD = ['Mã', 'Tên NL', 'Nhóm', 'Đơn vị', 'Nhà cung cấp', 'Giá chưa VAT/g', 'Liều sử dụng'];
const LIST_SAMPLE = [
  ['NL900', 'Chất tạo cấu trúc 1', 'Phụ gia', 'g', 'Nhà cung cấp A', 300, '0,1-5'],
  ['NL901', 'Đường tinh luyện', 'Nguyên liệu', 'g', 'Nhà cung cấp B', 30, '-'],
];
const HELP = [
  ['HƯỚNG DẪN NHẬP EXCEL'],
  ['Sheet "NguyenLieu_Gia": mỗi dòng một nguyên liệu kèm giá chưa VAT theo Đơn vị (g, kg, lít, ml, cái). Tiêu đề có thể nằm ở dòng bất kỳ trong 15 dòng đầu.'],
  ['  • Nhóm để trống: có "Liều sử dụng" thì app xếp là Phụ gia, ngược lại là Nguyên liệu. Nhóm hợp lệ: Nguyên liệu / Phụ gia / Bao bì / Bán thành phẩm.'],
  ['  • Liều sử dụng: khoảng % khối lượng công thức, ví dụ 0,1-5 hoặc 0,001-1. Điền "-" nếu không giới hạn. App dùng làm giới hạn mặc định khi tối ưu.'],
  ['  • Mã trùng nhưng tên khác: app tự thêm đuôi (-2, -3…) và nhắc bạn kiểm tra. Loại giá và ngày hiệu lực chọn ở bước xem trước khi nhập.'],
  ['Các sheet còn lại (ChiTieu, HamLuong, SanPham, CongThuc, ChiPhiKhac, YeuCau) là tùy chọn; giữ nguyên dòng tiêu đề ở dòng 1.'],
  ['Các dòng ví dụ (mã NL900, SP900…) chỉ minh họa định dạng: hãy xóa/thay bằng dữ liệu thật trước khi nhập.'],
  ['Công thức được nhận diện bằng bộ ba: Mã SP + Biến thể + Phiên bản. Phiên bản đã có trong app sẽ bị bỏ qua (hãy tăng số phiên bản).'],
  ['Trạng thái công thức: ' + STATUSES.join(' / ') + '. Mặc định là Nháp. Chuyển "Đang sản xuất" cần người duyệt thao tác trong app.'],
  ['Số có dấu thập phân dùng dấu chấm hoặc phẩy đều được. Ngày theo dạng 2026-01-31 hoặc 31/01/2026.'],
  ['(Kiểu cũ vẫn dùng được: sheet NguyenLieu + sheet Gia tách riêng, có Loại giá và Ngày hiệu lực từng dòng.)'],
];
export function downloadTemplate() {
  const wb = X().utils.book_new();
  X().utils.book_append_sheet(wb, X().utils.aoa_to_sheet(HELP.map((r) => r)), 'HuongDan');
  const ws0 = X().utils.aoa_to_sheet([LIST_HEAD, ...LIST_SAMPLE]);
  ws0['!cols'] = [12, 28, 14, 8, 20, 16, 16].map((w) => ({ wch: w }));
  X().utils.book_append_sheet(wb, ws0, 'NguyenLieu_Gia');
  for (const [name, head] of Object.entries(SHEETS)) {
    if (name === 'NguyenLieu' || name === 'Gia') continue; // đã gộp vào NguyenLieu_Gia
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

// ----- bảng "Nguyên liệu + giá" (file mẫu của công ty) -----
const STD = new Set([...Object.keys(SHEETS).map(key), 'huongdan']);
const UNIT_ALIAS = { g: 'g', gam: 'g', gram: 'g', kg: 'kg', kilogram: 'kg', lit: 'lít', l: 'lít', ml: 'ml', cai: 'cái', chiec: 'cái' };
// "0,1-5" -> {min:0.1, max:5}; "-" hoặc trống -> null (không giới hạn)
function parseDose(v) {
  const s = String(v ?? '').trim().replace(/%/g, '');
  if (!s || /^[-–—\s]+$/.test(s)) return null;
  const nums = s.split(/\s*[-–—~]\s*/).filter(Boolean).map((x) => parseNum(x)).filter((n) => n != null);
  if (!nums.length) return { bad: true, text: s };
  return nums.length === 1 ? { min: null, max: nums[0], text: s } : { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]), text: s };
}
function findList(wb) {
  const found = [];
  for (const name of wb.SheetNames) {
    if (STD.has(key(name))) continue;
    const aoa = X().utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true });
    for (let hr = 0; hr < Math.min(15, aoa.length); hr++) {
      const heads = aoa[hr].map(key);
      const col = (pred) => heads.findIndex(pred);
      const cCode = col((h) => h === 'ma' || h === 'manguyenlieu' || h === 'manl' || h === 'mavt' || h === 'mahang');
      const cName = col((h) => h.startsWith('ten'));
      if (cCode < 0 || cName < 0) continue;
      found.push({ sheet: name, aoa, hr, header: aoa[hr], cols: {
        code: cCode, name: cName,
        cat: col((h) => h === 'nhom' || h === 'phanloai' || h === 'loai'),
        unit: col((h) => h === 'donvi' || h === 'dvt' || h === 'dvtinh'),
        sup: col((h) => h.includes('nhacungcap') || h === 'ncc'),
        price: col((h) => h.includes('gia') && !h.includes('loaigia')),
        dose: col((h) => h.includes('lieu')),
      } });
      break;
    }
  }
  return found;
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
  // bảng "Nguyên liệu + giá" (mỗi dòng: mã, tên, nhóm, đơn vị, nhà cung cấp, giá chưa VAT, liều sử dụng)
  plan.listPrices = []; plan.warnings = []; plan.opts = { type: 'Kế hoạch', date: today() };
  const seenInFile = new Map(); let inferred = 0;
  const lwarn = (sheet, row, msg) => plan.warnings.push({ sheet, row, msg });
  for (const L of findList(wb)) {
    const hdrUnit = L.cols.price >= 0 ? (/\/\s*(kg|g|lit|ml|cai)\b/.exec(normalize(String(L.header[L.cols.price]))) || [])[1] : '';
    for (let r = L.hr + 1; r < L.aoa.length; r++) {
      const row = L.aoa[r]; const rowNo = r + 1;
      if (row.every((c) => c === '' || c == null)) continue;
      let code = str(row[L.cols.code]); const name = str(row[L.cols.name]);
      if (!code && !name) continue;
      if (!name) { warn(L.sheet, rowNo, 'Thiếu tên nguyên liệu'); continue; }
      if (!code) { warn(L.sheet, rowNo, 'Thiếu mã của "' + name + '"'); continue; }
      const unitRaw = L.cols.unit >= 0 ? str(row[L.cols.unit]) : '';
      const unit = unitRaw ? UNIT_ALIAS[key(unitRaw)] : (UNIT_ALIAS[key(hdrUnit || '')] || (hdrUnit ? 'g' : 'kg'));
      if (!unit) { warn(L.sheet, rowNo, 'Đơn vị "' + unitRaw + '" không hợp lệ (dùng: ' + UNITS.join(', ') + ')'); continue; }
      const price = L.cols.price >= 0 ? parseNum(row[L.cols.price]) : null;
      if (price != null && price < 0) { warn(L.sheet, rowNo, 'Giá âm của "' + name + '"'); continue; }
      let lc = code.toLowerCase();
      if (seenInFile.has(lc)) {
        if (seenInFile.get(lc) === name.toLowerCase()) { lwarn(L.sheet, rowNo, 'Dòng lặp "' + name + '" (mã ' + code + '): bỏ qua'); continue; }
        // đã từng nhập (cùng tên, mã có đuôi) thì dùng lại mã đó, tránh tạo bản trùng khi nhập lại file
        const again = [...ingByCode.values()].find((i) => i.code.toLowerCase().startsWith(lc + '-') && i.name.trim().toLowerCase() === name.toLowerCase());
        if (again) { code = again.code; lc = code.toLowerCase(); }
        else {
          let n = 2; while (seenInFile.has((code + '-' + n).toLowerCase()) || ingByCode.has((code + '-' + n).toLowerCase())) n++;
          const nc = code + '-' + n;
          lwarn(L.sheet, rowNo, 'Mã ' + code + ' trùng với nguyên liệu khác trong file: "' + name + '" được đổi mã thành ' + nc + '. Hãy kiểm tra lại mã trong file nguồn.');
          code = nc; lc = nc.toLowerCase();
        }
      }
      seenInFile.set(lc, name.toLowerCase());
      const ex = ingByCode.get(lc);
      if (ex && ex.name.trim().toLowerCase() !== name.toLowerCase()) lwarn(L.sheet, rowNo, 'Mã ' + code + ' đã có trong app với tên "' + ex.name + '": sẽ đổi thành "' + name + '".');
      const dose = parseDose(row[L.cols.dose >= 0 ? L.cols.dose : 0 - 1]);
      let cat = L.cols.cat >= 0 ? str(row[L.cols.cat]) : '';
      const catExplicit = !!cat;
      if (!cat) { cat = ex ? ex.category : dose && !dose.bad ? 'Phụ gia' : 'Nguyên liệu'; if (!ex) inferred++; }
      const d = ex || { id: uid(), code, name, category: cat, supplier: '', priceUnit: unit, yield: 1, substGroup: '', bomFormulaId: '', stock: null, moq: null, supplyNote: '', lots: [], activeLotId: '', active: true, note: '' };
      d.name = name; d.priceUnit = unit; if (catExplicit || !ex) d.category = cat;
      if (L.cols.sup >= 0 && str(row[L.cols.sup])) d.supplier = str(row[L.cols.sup]);
      if (L.cols.dose >= 0) {
        if (dose?.bad) lwarn(L.sheet, rowNo, 'Liều sử dụng "' + dose.text + '" của "' + name + '" không đọc được: bỏ qua giới hạn liều.');
        d.doseMin = dose && !dose.bad ? dose.min : null; d.doseMax = dose && !dose.bad ? dose.max : null; d.doseText = dose && !dose.bad ? dose.text : '';
      }
      addList('categories', d.category); addList('suppliers', d.supplier);
      ingByCode.set(lc, d); touchedIng.add(lc); stat.ing[ex ? 1 : 0]++;
      if (price != null) plan.listPrices.push({ ing: d, price, row: rowNo });
    }
  }
  if (inferred) lwarn('', '', inferred + ' nguyên liệu để trống Nhóm: app tự xếp (có liều sử dụng = Phụ gia, còn lại = Nguyên liệu). Sửa lại nếu chưa đúng.');
  stat.price += plan.listPrices.length;
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
  // giá từ bảng "Nguyên liệu + giá": áp loại giá / ngày hiệu lực chọn ở bước xem trước; bỏ qua giá không đổi
  if (plan.listPrices?.length) {
    const ctx = mkCtx(); const o = plan.opts || { type: 'Kế hoạch', date: today() };
    const docs = [];
    for (const lp of plan.listPrices) {
      const cur = ctx.priceIdx.get(lp.ing.id)?.[o.type];
      if (cur && Number(cur.price) === Number(lp.price)) continue;
      docs.push({ id: uid(), ingId: lp.ing.id, price: lp.price, type: o.type, date: o.date, source: 'Nhập Excel', note: 'Giá chưa VAT' });
    }
    if (docs.length) await saveMany('prices', docs, 'Nhập Excel: giá nguyên liệu');
    plan.pricesWritten = docs.length;
  }
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
