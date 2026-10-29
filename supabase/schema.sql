-- =====================================================================
-- Tính toán và Tối ưu Giá thành Sản phẩm: cơ sở dữ liệu đám mây (Supabase / PostgreSQL)
-- Cách chạy: Supabase Dashboard → SQL Editor → New query → dán toàn bộ file này → Run.
-- Có thể chạy lại nhiều lần (idempotent).
--
-- Bảo mật:
--  * Mọi bảng bật Row Level Security (RLS): người chưa đăng nhập (anon) không đọc/ghi được gì.
--  * Quyền đọc/ghi từng loại dữ liệu theo vai trò nằm ở bảng role_perms (khớp PERM trong js/defaults.js).
--  * Tài khoản mới ở trạng thái 'pending' (không thấy dữ liệu) cho đến khi Quản trị gán vai trò.
--  * Tài khoản đăng ký đầu tiên tự thành 'admin'.
--  * Nhật ký (audit_log) do trigger ghi ở máy chủ: người dùng không sửa/xóa được.
-- =====================================================================

-- ---------- Bảng ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'pending'
    check (role in ('admin','rd','qa','buyer','approver','viewer','pending')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Toàn bộ dữ liệu nghiệp vụ lưu dạng JSON theo "bộ dữ liệu" (collection)
create table if not exists public.records (
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (collection, id)
);
create index if not exists records_collection_idx on public.records (collection);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  user_id uuid,
  user_email text,
  action text not null,        -- INSERT | UPDATE | DELETE
  collection text not null,
  record_id text not null,
  old_data jsonb,
  new_data jsonb
);
create index if not exists audit_log_ts_idx on public.audit_log (ts desc);

create table if not exists public.role_perms (
  collection text not null,
  role text not null,
  can_read boolean not null default true,
  can_write boolean not null default false,
  primary key (collection, role)
);

-- ---------- Bảng phân quyền (sửa tại đây nếu muốn đổi quyền) ----------
delete from public.role_perms;
insert into public.role_perms (collection, role, can_read, can_write)
select t.c, r.role, true, (r.role = any (t.w))
from (values
  ('ingredients', array['admin','rd','qa','buyer','approver'],            array['admin','rd','qa','buyer']),
  ('prices',      array['admin','rd','qa','buyer','approver'],            array['admin','buyer','approver']),
  ('criteria',    array['admin','rd','qa','buyer','approver'],            array['admin','qa']),
  ('products',    array['admin','rd','qa','buyer','approver','viewer'],   array['admin','rd']),
  ('formulas',    array['admin','rd','qa','buyer','approver'],            array['admin','rd','qa']),
  ('proposals',   array['admin','rd','qa','buyer','approver'],            array['admin','rd','qa','approver']),
  ('lists',       array['admin','rd','qa','buyer','approver','viewer'],   array['admin','rd','qa','buyer','approver']),
  ('settings',    array['admin','rd','qa','buyer','approver','viewer'],   array['admin']),
  ('snapshots',   array['admin','rd','qa','buyer','approver','viewer'],   array['admin','rd','qa','buyer','approver'])
) as t(c, rd, w)
cross join lateral unnest(t.rd) as r(role);

-- ---------- Hàm tiện ích ----------
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select case when p.active then p.role else 'pending' end
  from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.can_access(coll text, want_write boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when want_write then rp.can_write else rp.can_read end
    from public.role_perms rp
    where rp.collection = coll and rp.role = public.app_role()
  ), false)
$$;

-- ---------- Tự tạo hồ sơ khi có người đăng ký ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'pending' end
  );
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Dấu thời gian + người sửa ----------
create or replace function public.records_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

-- ---------- Nhật ký tự động ----------
create or replace function public.records_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uemail text;
  coll text;
begin
  coll := coalesce(new.collection, old.collection);
  if coll = 'snapshots' then return coalesce(new, old); end if;   -- ảnh chụp giá thành do hệ thống tạo, không ghi nhật ký
  select email into uemail from public.profiles where id = auth.uid();
  insert into public.audit_log (user_id, user_email, action, collection, record_id, old_data, new_data)
  values (auth.uid(), uemail, tg_op, coll, coalesce(new.id, old.id),
          case when tg_op in ('UPDATE','DELETE') then old.data end,
          case when tg_op in ('INSERT','UPDATE') then new.data end);
  return coalesce(new, old);
end $$;
drop trigger if exists records_audit on public.records;
create trigger records_audit after insert or update or delete on public.records
  for each row execute function public.records_audit();

-- ---------- Row Level Security ----------
alter table public.profiles   enable row level security;
alter table public.records    enable row level security;
alter table public.audit_log  enable row level security;
alter table public.role_perms enable row level security;

drop policy if exists prof_select on public.profiles;
create policy prof_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.app_role() = 'admin');
drop policy if exists prof_update on public.profiles;
create policy prof_update on public.profiles for update to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

drop policy if exists rec_select on public.records;
create policy rec_select on public.records for select to authenticated
  using (public.can_access(collection, false));
drop policy if exists rec_insert on public.records;
create policy rec_insert on public.records for insert to authenticated
  with check (public.can_access(collection, true));
drop policy if exists rec_update on public.records;
create policy rec_update on public.records for update to authenticated
  using (public.can_access(collection, true)) with check (public.can_access(collection, true));
drop policy if exists rec_delete on public.records;
create policy rec_delete on public.records for delete to authenticated
  using (public.can_access(collection, true));

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.app_role() in ('admin','qa','approver'));
-- audit_log: không có policy insert/update/delete cho người dùng => chỉ trigger (security definer) ghi được

-- role_perms: chỉ đọc cho người đã đăng nhập (sửa bằng SQL Editor)
drop policy if exists perms_select on public.role_perms;
create policy perms_select on public.role_perms for select to authenticated using (true);

-- ---------- Quyền mức bảng ----------
revoke all on public.profiles, public.records, public.audit_log, public.role_perms from anon;
grant select, insert, update, delete on public.records to authenticated;
grant select on public.audit_log, public.role_perms to authenticated;
grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (role, active, full_name) on public.profiles to authenticated;   -- RLS chỉ cho Quản trị thực hiện
