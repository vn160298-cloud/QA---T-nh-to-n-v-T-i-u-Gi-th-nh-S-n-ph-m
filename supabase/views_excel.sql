-- =====================================================================
-- Các "bảng nhìn như Excel" (VIEW) để xem, lọc, xuất CSV/Excel trực tiếp trên Supabase.
-- Chạy SAU schema.sql: Supabase → SQL Editor → New query → dán file này → Run. Có thể chạy lại nhiều lần.
--
-- * Chỉ đọc: muốn sửa dữ liệu hãy dùng app (hoặc nhập Excel trong app) để giữ nhật ký và quyền.
-- * security_invoker = true: view dùng đúng quyền (RLS) của người đang truy vấn,
--   nên vai trò không có quyền xem công thức sẽ thấy bảng rỗng. KHÔNG bỏ dòng này.
-- =====================================================================

create or replace view public.v_nguyen_lieu with (security_invoker = true) as
select r.data->>'code'                          as ma,
       r.data->>'name'                          as ten,
       r.data->>'category'                      as nhom,
       r.data->>'supplier'                      as nha_cung_cap,
       r.data->>'priceUnit'                     as don_vi_gia,
       nullif(r.data->>'yield','')::numeric     as dinh_muc_mac_dinh,
       r.data->>'substGroup'                    as nhom_thay_the,
       nullif(r.data->>'stock','')::numeric     as ton_kho_g,
       nullif(r.data->>'moq','')::numeric       as so_luong_dat_toi_thieu,
       r.data->>'supplyNote'                    as ghi_chu_nguon_cung,
       coalesce((r.data->>'active')::boolean, true) as dang_su_dung,
       r.updated_at                             as cap_nhat
from public.records r where r.collection = 'ingredients';

create or replace view public.v_gia with (security_invoker = true) as
select i.data->>'code'                          as ma_nguyen_lieu,
       i.data->>'name'                          as nguyen_lieu,
       i.data->>'priceUnit'                     as don_vi,
       p.data->>'type'                          as loai_gia,
       nullif(p.data->>'price','')::numeric     as gia,
       nullif(p.data->>'date','')::date         as hieu_luc_tu,
       p.data->>'source'                        as nguon,
       p.data->>'createdBy'                     as nguoi_nhap,
       p.updated_at                             as cap_nhat
from public.records p
left join public.records i on i.collection = 'ingredients' and i.id = p.data->>'ingId'
where p.collection = 'prices';

create or replace view public.v_chi_tieu with (security_invoker = true) as
select r.data->>'name'                          as ten_chi_tieu,
       r.data->>'unit'                          as don_vi,
       coalesce((r.data->>'additive')::boolean, true) as cong_theo_ty_le,
       nullif(r.data->>'tol','')::numeric       as dung_sai_mac_dinh,
       r.data->>'standard'                      as chuan_ap_dung,
       r.data->>'note'                          as ghi_chu
from public.records r where r.collection = 'criteria';

create or replace view public.v_ham_luong with (security_invoker = true) as
select i.data->>'code'                          as ma_nguyen_lieu,
       i.data->>'name'                          as nguyen_lieu,
       c.data->>'name'                          as chi_tieu,
       nullif(kv.val,'')::numeric               as gia_tri_tren_100g,
       lot->>'lot'                              as lo,
       lot->>'source'                           as nguon,
       (lot->>'id') = (i.data->>'activeLotId')  as lo_dang_dung
from public.records i
cross join lateral jsonb_array_elements(coalesce(i.data->'lots','[]'::jsonb)) lot
cross join lateral jsonb_each_text(coalesce(lot->'values','{}'::jsonb)) as kv(crit_id, val)
left join public.records c on c.collection = 'criteria' and c.id = kv.crit_id
where i.collection = 'ingredients';

create or replace view public.v_san_pham with (security_invoker = true) as
select r.data->>'code'                          as ma_sp,
       r.data->>'name'                          as ten,
       r.data->>'nameVN'                        as ten_khac,
       r.data->>'group'                         as nhom,
       nullif(r.data->>'sellingPrice','')::numeric as gia_ban,
       r.data->>'note'                          as ghi_chu
from public.records r where r.collection = 'products';

create or replace view public.v_cong_thuc with (security_invoker = true) as
select p.data->>'code'                          as ma_sp,
       p.data->>'name'                          as san_pham,
       f.data->>'variant'                       as bien_the,
       (f.data->>'version')::int                as phien_ban,
       f.data->>'status'                        as trang_thai,
       f.data->>'reason'                        as ly_do_thay_doi,
       f.data->>'note'                          as ghi_chu,
       f.data->>'approvedBy'                    as nguoi_duyet,
       f.data->>'expiresAt'                     as het_han_luu,
       f.data->>'createdBy'                     as nguoi_tao,
       f.updated_at                             as cap_nhat
from public.records f
left join public.records p on p.collection = 'products' and p.id = f.data->>'productId'
where f.collection = 'formulas';

create or replace view public.v_cong_thuc_dong with (security_invoker = true) as
select p.data->>'code'                          as ma_sp,
       p.data->>'name'                          as san_pham,
       f.data->>'variant'                       as bien_the,
       (f.data->>'version')::int                as phien_ban,
       f.data->>'status'                        as trang_thai,
       i.data->>'code'                          as ma_nguyen_lieu,
       i.data->>'name'                          as nguyen_lieu,
       nullif(l->>'qty','')::numeric            as luong_g,
       nullif(l->>'yield','')::numeric          as dinh_muc,
       nullif(l->>'minPct','')::numeric         as min_pct,
       nullif(l->>'maxPct','')::numeric         as max_pct,
       coalesce((l->>'fixed')::boolean, false)  as khoa_khi_toi_uu
from public.records f
cross join lateral jsonb_array_elements(coalesce(f.data->'lines','[]'::jsonb)) l
left join public.records p on p.collection = 'products' and p.id = f.data->>'productId'
left join public.records i on i.collection = 'ingredients' and i.id = l->>'ingId'
where f.collection = 'formulas';

create or replace view public.v_chi_phi_khac with (security_invoker = true) as
select p.data->>'code'                          as ma_sp,
       f.data->>'variant'                       as bien_the,
       (f.data->>'version')::int                as phien_ban,
       e->>'kind'                               as loai,
       e->>'name'                               as dien_giai,
       nullif(e->>'amount','')::numeric         as so_tien
from public.records f
cross join lateral jsonb_array_elements(coalesce(f.data->'extras','[]'::jsonb)) e
left join public.records p on p.collection = 'products' and p.id = f.data->>'productId'
where f.collection = 'formulas';

create or replace view public.v_yeu_cau_chat_luong with (security_invoker = true) as
select p.data->>'code'                          as ma_sp,
       f.data->>'variant'                       as bien_the,
       (f.data->>'version')::int                as phien_ban,
       c.data->>'name'                          as chi_tieu,
       nullif(q->>'min','')::numeric            as toi_thieu,
       nullif(q->>'max','')::numeric            as toi_da,
       nullif(q->>'tol','')::numeric            as dung_sai,
       nullif(q->>'measured','')::numeric       as ket_qua_do
from public.records f
cross join lateral jsonb_array_elements(coalesce(f.data->'reqs','[]'::jsonb)) q
left join public.records p on p.collection = 'products' and p.id = f.data->>'productId'
left join public.records c on c.collection = 'criteria' and c.id = q->>'critId'
where f.collection = 'formulas';

create or replace view public.v_de_xuat with (security_invoker = true) as
select p.data->>'code'                          as ma_sp,
       f.data->>'variant'                       as bien_the,
       (f.data->>'version')::int                as phien_ban_goc,
       r.data->'alt'->>'name'                   as phuong_an,
       r.data->>'status'                        as trang_thai,
       nullif(r.data->'alt'->>'curTotal','')::numeric as gia_thanh_cu,
       nullif(r.data->'alt'->>'total','')::numeric    as gia_thanh_moi,
       nullif(r.data->'alt'->>'saving','')::numeric   as tiet_kiem,
       nullif(r.data->'alt'->>'savingPct','')::numeric as tiet_kiem_pct,
       r.data->>'requestedBy'                   as nguoi_de_xuat,
       r.data->>'requestedAt'                   as thoi_diem_de_xuat,
       r.data->>'rejectReason'                  as ly_do_tu_choi
from public.records r
left join public.records f on f.collection = 'formulas' and f.id = r.data->>'formulaId'
left join public.records p on p.collection = 'products' and p.id = r.data->>'productId'
where r.collection = 'proposals';

create or replace view public.v_gia_thanh with (security_invoker = true) as
select r.data->>'productCode'                   as ma_sp,
       r.data->>'productName'                   as san_pham,
       r.data->>'variant'                       as bien_the,
       (r.data->>'version')::int                as phien_ban,
       r.data->>'status'                        as trang_thai,
       r.data->>'basis'                         as loai_gia,
       nullif(r.data->>'total','')::numeric     as gia_thanh_phan,
       nullif(r.data->>'material','')::numeric  as nguyen_lieu,
       nullif(r.data->>'weight','')::numeric    as khoi_luong_g,
       r.data->>'date'                          as ngay
from public.records r where r.collection = 'snapshots';

-- Nhật ký (chỉ Quản trị / QA / Quản lý duyệt xem được theo RLS của audit_log)
create or replace view public.v_nhat_ky with (security_invoker = true) as
select a.ts as thoi_gian, a.user_email as nguoi_dung,
       case a.action when 'INSERT' then 'Thêm' when 'UPDATE' then 'Sửa' when 'DELETE' then 'Xóa' else a.action end as hanh_dong,
       a.collection as bo_du_lieu, a.record_id,
       coalesce(a.new_data->>'name', a.new_data->>'code', a.old_data->>'name', a.old_data->>'code') as doi_tuong,
       a.old_data as gia_tri_cu, a.new_data as gia_tri_moi
from public.audit_log a;

-- Quyền: chỉ người đã đăng nhập; người chưa đăng nhập (anon) không đọc được
revoke all on public.v_nguyen_lieu, public.v_gia, public.v_chi_tieu, public.v_ham_luong, public.v_san_pham,
              public.v_cong_thuc, public.v_cong_thuc_dong, public.v_chi_phi_khac, public.v_yeu_cau_chat_luong,
              public.v_de_xuat, public.v_gia_thanh, public.v_nhat_ky from anon;
grant select on public.v_nguyen_lieu, public.v_gia, public.v_chi_tieu, public.v_ham_luong, public.v_san_pham,
                public.v_cong_thuc, public.v_cong_thuc_dong, public.v_chi_phi_khac, public.v_yeu_cau_chat_luong,
                public.v_de_xuat, public.v_gia_thanh, public.v_nhat_ky to authenticated;
