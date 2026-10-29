// Cấu hình kết nối đám mây (Supabase).
// Để trống = chạy "chế độ thử" (dữ liệu chỉ lưu trên thiết bị này).
// Điền 2 giá trị sau khi tạo dự án Supabase (xem HUONG_DAN.md). Anon key là khóa công khai theo thiết kế;
// bảo mật dữ liệu do Row Level Security trong supabase/schema.sql đảm nhiệm.
export const CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  APP_NAME: 'Tính toán và Tối ưu Giá thành Sản phẩm',
};
