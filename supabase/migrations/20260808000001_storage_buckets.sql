-- =============================================================================
-- Storage バケットとアクセスポリシー
-- =============================================================================
-- ダッシュボードでの手作業ではなくマイグレーションで定義する。
-- 手作業だと環境ごとに設定がずれ、後から差異を追えなくなるため。
--
-- 公開設定について:
--   写真・案内図は秘匿情報ではなく、アプリはオフライン動作のため
--   端末へダウンロードして保持する。署名付き URL は有効期限があり
--   オフラインキャッシュと相性が悪いため、Public バケットとする。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- バケット
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- 現地写真・進入案内図。原本とリサイズ版を格納する。
  -- 上限 20MB: スマートフォンの高画質写真でも収まり、
  -- 誤って動画をアップロードした場合は弾ける水準。
  ('facility-photos', 'facility-photos', true, 20971520,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),

  -- カタログスナップショット (JSON)。アプリが起動時に取得する。
  ('catalog', 'catalog', true, 52428800,
   array['application/json', 'application/gzip'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- アクセスポリシー
--   読み取りは誰でも可。書き込みは管理画面のログインユーザー (staff) のみ。
--   Public バケットでも、書き込みは必ずポリシーで制限する必要がある。
-- -----------------------------------------------------------------------------
alter table storage.objects enable row level security;

drop policy if exists "kurumayose_public_read" on storage.objects;
create policy "kurumayose_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('facility-photos', 'catalog'));

drop policy if exists "kurumayose_staff_insert" on storage.objects;
create policy "kurumayose_staff_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('facility-photos', 'catalog') and public.is_staff());

drop policy if exists "kurumayose_staff_update" on storage.objects;
create policy "kurumayose_staff_update" on storage.objects
  for update to authenticated
  using (bucket_id in ('facility-photos', 'catalog') and public.is_staff())
  with check (bucket_id in ('facility-photos', 'catalog') and public.is_staff());

drop policy if exists "kurumayose_staff_delete" on storage.objects;
create policy "kurumayose_staff_delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('facility-photos', 'catalog') and public.is_staff());
