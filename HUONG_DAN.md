# Tính toán và Tối ưu Giá thành Sản phẩm: hướng dẫn triển khai

Ứng dụng web cài được lên màn hình chính (PWA), chạy toàn màn hình như app thật trên iPhone, Android và máy tính.
Dữ liệu lưu trên đám mây (Supabase) có đăng nhập, phân quyền theo vai trò và nhật ký do máy chủ ghi.

Chưa kết nối đám mây thì app chạy **chế độ thử**: dữ liệu chỉ nằm trên thiết bị, dùng để làm quen và kiểm thử.

## 1. Chạy thử trên máy tính (2 phút)

Mở terminal trong thư mục `app` rồi chạy:

```bash
python -m http.server 5173
```

Mở http://localhost:5173. Vào **Tổng quan → Nạp dữ liệu mẫu** để có sẵn bảng giá và công thức Coconut Jelly 180g từ file Excel mẫu.
Giá thành mẫu phải ra đúng **5.950 đ** (2.403 đ nguyên liệu + 3.547 đ chi phí khác) như file gốc.

> Cài lên điện thoại cần địa chỉ HTTPS, nên cần làm tiếp bước 2 và 3.

## 2. Tạo cơ sở dữ liệu đám mây (Supabase, có gói miễn phí)

1. Vào https://supabase.com → **New project** (chọn vùng gần nhất, ví dụ Singapore). Đặt mật khẩu cơ sở dữ liệu mạnh và cất kỹ.
2. **SQL Editor → New query** → dán toàn bộ nội dung `supabase/schema.sql` → **Run**.
   File này tạo bảng, bật Row Level Security, bảng phân quyền theo vai trò, trigger ghi nhật ký.
3. **Project Settings → API**: chép **Project URL** và khóa **anon public**.
   Tuyệt đối **không** dùng khóa `service_role` trong app.
4. **Authentication → Providers → Email**: bật Email. Nếu muốn người dùng vào được ngay không cần xác nhận email, tắt "Confirm email" (an toàn hơn là giữ bật).
5. Tùy chọn: **Authentication → Sign In / Providers**: sau khi cả nhóm đã đăng ký xong, tắt "Allow new users to sign up".
   Tài khoản mới chưa được cấp vai trò cũng không đọc được dữ liệu nào.

## 3. Đưa app lên mạng có HTTPS (chọn một cách, đều miễn phí)

- **Netlify** (dễ nhất): vào https://app.netlify.com/drop rồi kéo thả cả thư mục `app`.
- **Cloudflare Pages**: Create project → Direct upload → chọn thư mục `app`.
- **Vercel** hoặc **GitHub Pages**: đưa nội dung thư mục `app` lên một repository rồi bật hosting.

File `_headers` đã có sẵn (Netlify, Cloudflare Pages dùng) để thêm tiêu đề bảo mật và tắt cache cho `index.html`, `sw.js`.

## 4. Nối app với đám mây

Chọn một trong hai:

- Mở `js/config.js`, điền `SUPABASE_URL` và `SUPABASE_ANON_KEY`, rồi triển khai lại.
- Hoặc mở app → **Thêm → Cài đặt → Lưu trên đám mây**, dán URL và anon key, bấm **Lưu và kết nối**
  (giá trị lưu trên thiết bị đó, mỗi thiết bị làm một lần).

Sau đó app hiện màn hình đăng nhập.

## 5. Tài khoản và phân quyền

- **Người đăng ký đầu tiên tự thành Quản trị.** Hãy tự đăng ký trước tiên.
- Người đăng ký sau ở trạng thái **Chờ cấp quyền** (không thấy dữ liệu). Quản trị vào **Thêm → Người dùng & quyền** để gán vai trò:

| Vai trò | Làm được |
|---|---|
| Quản trị | Mọi thứ, gồm người dùng, cài đặt, xem nhật ký |
| Kỹ thuật / R&D | Sản phẩm, công thức, chạy tối ưu, gửi duyệt |
| Chất lượng (QA) | Chỉ tiêu, hàm lượng nguyên liệu, yêu cầu chất lượng, xem nhật ký |
| Mua hàng | Nguyên liệu, nhập giá |
| Quản lý duyệt | Duyệt/từ chối đề xuất, đưa công thức vào sản xuất, xem nhật ký |
| Chỉ xem giá thành | Chỉ thấy giá thành tổng, không thấy tỷ lệ nguyên liệu |

Muốn đổi quyền chi tiết hơn, sửa bảng `role_perms` trong `schema.sql` (và `PERM` trong `js/defaults.js` cho khớp).

## 6. Cài lên màn hình chính

- **iPhone/iPad (Safari)**: mở địa chỉ app → nút Chia sẻ → **Thêm vào MH chính** (Add to Home Screen) → Thêm.
- **Android (Chrome)**: mở địa chỉ app → menu ⋮ → **Cài đặt ứng dụng** / **Thêm vào màn hình chính**.
- **Máy tính (Chrome/Edge)**: biểu tượng cài đặt ở thanh địa chỉ.

Mở từ biểu tượng mới sẽ chạy toàn màn hình, không có thanh địa chỉ.

## 7. Đưa dữ liệu thử lên đám mây

Ở chế độ thử: **Thêm → Nhập/Xuất Excel → Sao lưu** (file JSON). Kết nối đám mây, đăng nhập bằng tài khoản Quản trị, rồi **Khôi phục từ file**.
Dữ liệu thật của công ty nên nhập bằng **Mẫu nhập Excel** (cùng màn hình đó). Mẫu có sheet hướng dẫn và các dòng ví dụ.

**Nhập nguyên liệu và giá từ một bảng** (sheet `NguyenLieu_Gia`, đúng bố cục file "file nguyên liệu + giá.xlsx"):

| Mã | Tên NL | Nhóm | Đơn vị | Nhà cung cấp | Giá chưa VAT | Liều sử dụng |
|---|---|---|---|---|---|---|
| 121345 | Chất tạo cấu trúc 1 | (trống) | g | Brenntag | 300 | 0,1-5 |

- Dòng tiêu đề có thể ở dòng bất kỳ trong 15 dòng đầu. Giá hiểu là **chưa VAT theo cột Đơn vị** (300 đ/g).
- **Nhóm trống**: có Liều sử dụng thì xếp Phụ gia, còn lại là Nguyên liệu. Nên điền cột Nhóm cho chính xác.
- **Liều sử dụng** (`0,1-5`, `-` là không giới hạn) hiểu là khoảng % khối lượng công thức; dùng làm giới hạn mặc định khi tối ưu và cảnh báo trong công thức.
- **Mã trùng, tên khác**: app đổi thành `mã-2`, `mã-3`… và báo ở phần "Lưu ý". Hãy sửa mã trong file gốc.
- Loại giá và ngày hiệu lực chọn ở bước xem trước. Nhập lại file: giá không đổi thì bỏ qua, giá đổi thì thêm vào lịch sử, không tạo nguyên liệu trùng.

## 8. Việc cần làm cho bảo mật

- Bật xác thực hai lớp (MFA) cho tài khoản Supabase và tài khoản Quản trị.
- Dùng mật khẩu mạnh; không chia sẻ tài khoản (nhật ký ghi theo người).
- Chỉ dùng khóa `anon` trong app; cất kỹ khóa `service_role` và mật khẩu cơ sở dữ liệu.
- Sao lưu định kỳ bằng nút **Sao lưu** (JSON). Gói Supabase miễn phí không có sao lưu tự động hằng ngày.
- Kiểm tra quyền bằng một tài khoản vai trò thấp (ví dụ "Chỉ xem giá thành") trước khi mời cả nhóm.

## 9. Những điều nên biết

- **Chỉ tiêu chất lượng**: app tối ưu cho các chỉ tiêu "cộng theo tỷ lệ" (giá trị thành phẩm = Σ lượng × hàm lượng ÷ tổng khối lượng). Chỉ tiêu không cộng được (cảm quan, độ nhớt…) chỉ kiểm tra theo kết quả đo thực tế, không đưa vào tối ưu.
- **Chỉ tiêu và dữ liệu mẫu** (Đường, Nước, Béo) là **minh họa**; hãy thay bằng chỉ tiêu và số liệu thật từ phiếu kiểm nghiệm.
- Kết quả tối ưu là **đề xuất tính toán**. Công thức mới được tạo ở trạng thái "Thử nghiệm", bộ phận kỹ thuật/chất lượng phải thử thực tế trước khi đưa vào sản xuất.
- Chuyển công thức sang "Đang sản xuất" do giao diện giới hạn cho Quản lý duyệt/Quản trị; ở máy chủ, quyền được kiểm soát theo từng bộ dữ liệu (công thức), chưa theo từng trường.
- Thông báo hiện là trong app (chuông 🔔). Gửi email khi có đề xuất chờ duyệt chưa có (cần thêm Supabase Edge Function).
- Ngoại tuyến: app mở được khung giao diện, nhưng dữ liệu đám mây cần có mạng.
- Cập nhật app: triển khai lại thư mục `app`; trình duyệt tự lấy bản mới ở lần mở sau.

## 10. Cấu trúc thư mục

```
app/
  index.html, manifest.webmanifest, sw.js   khung PWA
  css/style.css                             giao diện
  js/main.js                                điều hướng, đăng nhập
  js/store.js                               dữ liệu: chế độ thử / Supabase, nhật ký
  js/calc.js                                tính giá thành, hao hụt, bán thành phẩm, chỉ tiêu
  js/optimize.js                            bộ tối ưu (quy hoạch tuyến tính, 3 phương án)
  js/xl.js                                  nhập/xuất Excel, sao lưu
  js/views/*.js                             các màn hình
  vendor/                                   thư viện (Supabase, bộ giải LP, SheetJS)
  supabase/schema.sql                       cơ sở dữ liệu + bảo mật
```
