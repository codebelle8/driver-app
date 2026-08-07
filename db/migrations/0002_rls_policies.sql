-- =============================================================================
-- 車寄せナビ — Row Level Security
-- =============================================================================
-- 方針
--   * アプリ (anon キー) からは「公開済み施設の読み取り」のみ許可する。
--   * 書き込みは管理画面のログインユーザー (admin / editor) のみ。
--   * 監査ログは admin のみ閲覧可。
--   * anon キーはアプリのバンドルに埋め込まれ、解析すれば読み取れる前提で設計する。
--     したがって「anon で何ができるか」が実質的なセキュリティ境界になる。
-- =============================================================================

alter table public.categories        enable row level security;
alter table public.facilities        enable row level security;
alter table public.entry_points      enable row level security;
alter table public.cautions          enable row level security;
alter table public.photos            enable row level security;
alter table public.admin_profiles    enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.catalog_snapshots enable row level security;

-- -----------------------------------------------------------------------------
-- ヘルパー
-- -----------------------------------------------------------------------------
create or replace function public.current_admin_role()
returns public.admin_role
language sql
stable
security definer
set search_path = public
as $$
  select role
    from public.admin_profiles
   where user_id = auth.uid()
     and is_active
   limit 1;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select public.current_admin_role() is not null;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_admin_role() = 'admin';
$$;

-- -----------------------------------------------------------------------------
-- カテゴリ
-- -----------------------------------------------------------------------------
create policy categories_read_public on public.categories
  for select to anon, authenticated
  using (is_active or public.is_staff());

create policy categories_write_staff on public.categories
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- -----------------------------------------------------------------------------
-- 施設
-- -----------------------------------------------------------------------------
create policy facilities_read_public on public.facilities
  for select to anon, authenticated
  using (status = 'published' or public.is_staff());

create policy facilities_write_staff on public.facilities
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- -----------------------------------------------------------------------------
-- 車寄せ / エントランス
--   親施設が公開されていなければ読めない。
-- -----------------------------------------------------------------------------
create policy entry_points_read_public on public.entry_points
  for select to anon, authenticated
  using (
    public.is_staff()
    or (
      is_active
      and exists (
        select 1 from public.facilities f
         where f.id = entry_points.facility_id
           and f.status = 'published'
      )
    )
  );

create policy entry_points_write_staff on public.entry_points
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- -----------------------------------------------------------------------------
-- 注意事項
-- -----------------------------------------------------------------------------
create policy cautions_read_public on public.cautions
  for select to anon, authenticated
  using (
    public.is_staff()
    or exists (
      select 1
        from public.entry_points ep
        join public.facilities f on f.id = ep.facility_id
       where ep.id = cautions.entry_point_id
         and ep.is_active
         and f.status = 'published'
    )
  );

create policy cautions_write_staff on public.cautions
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- -----------------------------------------------------------------------------
-- 写真
-- -----------------------------------------------------------------------------
create policy photos_read_public on public.photos
  for select to anon, authenticated
  using (
    public.is_staff()
    or (
      facility_id is not null and exists (
        select 1 from public.facilities f
         where f.id = photos.facility_id and f.status = 'published'
      )
    )
    or (
      entry_point_id is not null and exists (
        select 1
          from public.entry_points ep
          join public.facilities f on f.id = ep.facility_id
         where ep.id = photos.entry_point_id
           and ep.is_active
           and f.status = 'published'
      )
    )
  );

create policy photos_write_staff on public.photos
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- -----------------------------------------------------------------------------
-- 管理者プロフィール
--   自分の行は読める。一覧管理は admin のみ。
-- -----------------------------------------------------------------------------
create policy admin_profiles_read_self on public.admin_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy admin_profiles_write_admin on public.admin_profiles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 監査ログ
--   staff は追記のみ。閲覧は admin のみ。更新・削除は誰にも許可しない。
-- -----------------------------------------------------------------------------
create policy audit_logs_read_admin on public.audit_logs
  for select to authenticated
  using (public.is_admin());

create policy audit_logs_insert_staff on public.audit_logs
  for insert to authenticated
  with check (public.is_staff());

-- -----------------------------------------------------------------------------
-- カタログスナップショット
-- -----------------------------------------------------------------------------
create policy catalog_snapshots_read_public on public.catalog_snapshots
  for select to anon, authenticated
  using (true);

create policy catalog_snapshots_write_staff on public.catalog_snapshots
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
