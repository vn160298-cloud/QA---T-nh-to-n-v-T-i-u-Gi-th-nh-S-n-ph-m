// Cấu hình kết nối đám mây (Supabase).
// Để trống = chạy "chế độ thử" (dữ liệu chỉ lưu trên thiết bị này).
// Điền 2 giá trị sau khi tạo dự án Supabase (xem HUONG_DAN.md). Anon key là khóa công khai theo thiết kế;
// bảo mật dữ liệu do Row Level Security trong supabase/schema.sql đảm nhiệm.
export const CONFIG = {
  SUPABASE_URL: 'https://ldrtzihxihitqtxrkvuu.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkcnR6aWh4aWhpdHF0eHJrdnV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMTQwNjAsImV4cCI6MjEwODc5MDA2MH0.tsz7ORuMS0REZ4GZyjENERWiQmRy9GrBSX144XO-H5o',
  APP_NAME: 'QA-Tính toán và Tối ưu Giá thành Sản phẩm',
};
