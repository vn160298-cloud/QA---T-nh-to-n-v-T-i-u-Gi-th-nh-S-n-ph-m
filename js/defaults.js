// Giá trị mặc định: các danh sách xổ xuống (sửa được trong app) và cài đặt hệ thống.
export const STATUSES = ['Nháp', 'Thử nghiệm', 'Đang sản xuất', 'Ngừng dùng'];
export const STATUS_CLASS = { 'Nháp': '', 'Thử nghiệm': 'info', 'Đang sản xuất': 'ok', 'Ngừng dùng': 'bad' };
export const PRICE_TYPES_FIXED = 'Kế hoạch'; // loại giá gốc, dùng làm giá mặc định
export const UNITS = ['kg', 'g', 'lít', 'ml', 'cái'];
export const UNIT_F = { kg: 1000, g: 1, 'lít': 1000, ml: 1, 'cái': 1 }; // quy đổi giá về đ/g (hoặc đ/cái)
export const MASS_UNITS = ['kg', 'g', 'lít', 'ml'];

export const LIST_DEFS = {
  categories: { label: 'Nhóm nguyên liệu', items: ['Nguyên liệu', 'Phụ gia', 'Bao bì', 'Bán thành phẩm'] },
  suppliers: { label: 'Nhà cung cấp', items: [] },
  priceTypes: { label: 'Loại giá', items: ['Kế hoạch', 'Thực tế', 'Ước tính'] },
  variants: { label: 'Biến thể công thức', items: ['Chuẩn', 'Biến thể 1', 'Biến thể 2', 'Biến thể 3'] },
  productGroups: { label: 'Nhóm sản phẩm', items: ['Nhóm ưu tiên'] },
  costKinds: { label: 'Loại chi phí khác', items: ['Bao bì', 'Giao hàng', 'Sản xuất khác', 'Lợi nhuận nhà cung cấp', 'Khác'] },
  substGroups: { label: 'Nhóm nguyên liệu thay thế', items: [] },
  specSources: { label: 'Nguồn dữ liệu chỉ tiêu', items: ['Phiếu kiểm nghiệm', 'Bảng tham chiếu', 'Giá trị nội bộ'] },
  critUnits: { label: 'Đơn vị chỉ tiêu', items: ['%', 'g/100g', 'mg/100g', 'kcal/100g', '°Brix', 'pH', 'điểm'] },
  critStandards: { label: 'Chuẩn áp dụng', items: ['Nội bộ', 'TCVN', 'Khách hàng', 'ISO 22000'] },
  changeReasons: { label: 'Lý do thay đổi', items: ['Tối ưu chi phí', 'Đổi giá nguyên liệu', 'Phát triển sản phẩm mới', 'Điều chỉnh chất lượng', 'Thay nguyên liệu', 'Khác'] },
};

export const SETTINGS_DEFAULT = {
  requiredApprovals: 1,   // số người duyệt cần có để một đề xuất được chấp nhận
  trialMonths: 4,         // thời gian lưu công thức thử nghiệm (tháng)
  defaultBasis: 'Kế hoạch',
  maxChangePct: 25,       // giới hạn thay đổi mỗi nguyên liệu so với công thức hiện tại (±%)
  subMaxPct: 30,          // tỷ lệ tối đa của nguyên liệu thay thế (% khối lượng)
  priceStaleDays: 90,     // cảnh báo giá cũ hơn số ngày này
};

export const ROLES = {
  admin: 'Quản trị',
  rd: 'Kỹ thuật / R&D',
  qa: 'Chất lượng (QA)',
  buyer: 'Mua hàng',
  approver: 'Quản lý duyệt',
  viewer: 'Chỉ xem giá thành',
  pending: 'Chờ cấp quyền',
};
const NV = ['admin', 'rd', 'qa', 'buyer', 'approver'];
// Quyền đọc (r) / ghi (w) theo từng bộ dữ liệu. Bản SQL (supabase/schema.sql) áp dụng đúng bảng này ở phía máy chủ.
export const PERM = {
  ingredients: { r: NV, w: ['admin', 'rd', 'qa', 'buyer'] },
  prices: { r: NV, w: ['admin', 'buyer', 'approver'] },
  criteria: { r: NV, w: ['admin', 'qa'] },
  products: { r: [...NV, 'viewer'], w: ['admin', 'rd'] },
  formulas: { r: NV, w: ['admin', 'rd', 'qa'] },
  proposals: { r: NV, w: ['admin', 'rd', 'qa', 'approver'] },
  lists: { r: [...NV, 'viewer'], w: NV },
  settings: { r: [...NV, 'viewer'], w: ['admin'] },
  snapshots: { r: [...NV, 'viewer'], w: NV },
  audit: { r: ['admin', 'qa', 'approver'], w: [] },
};
export const COLLS = ['ingredients', 'prices', 'criteria', 'products', 'formulas', 'proposals', 'lists', 'settings', 'snapshots'];
