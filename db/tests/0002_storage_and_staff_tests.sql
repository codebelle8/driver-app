-- =============================================================================
-- Storage バケットと staff 権限の検証
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0002_storage_and_staff_tests.sql
--
-- 検証内容:
--   * バケットの設定が意図どおりか
--   * 写真をアップロードできるのは管理画面のログインユーザーだけか
--   * is_staff() / is_admin() が role に応じて正しく判定するか
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function pg_temp.assert(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAILED: %', label; end if;
  raise notice 'ok  %', label;
end;
$$;

create or replace function pg_temp.assert_rejects(sql text, label text)
returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok  % (%)', label, replace(split_part(sqlerrm, E'\n', 1), '"', '');
    return;
  end;
  raise exception 'FAILED: % — 拒否されるべき操作が通ってしまった', label;
end;
$$;

begin;

-- =============================================================================
-- 1. バケットの設定
-- =============================================================================
select pg_temp.assert(
  (select public from storage.buckets where id = 'facility-photos'),
  'facility-photos バケットが Public である（オフラインキャッシュのため）');

select pg_temp.assert(
  (select public from storage.buckets where id = 'catalog'),
  'catalog バケットが Public である');

select pg_temp.assert(
  (select file_size_limit from storage.buckets where id = 'facility-photos') = 20971520,
  '写真バケットの上限が 20MB に設定されている');

select pg_temp.assert(
  'image/jpeg' = any(select unnest(allowed_mime_types) from storage.buckets where id='facility-photos'),
  '写真バケットが JPEG を許可している');

select pg_temp.assert(
  not ('video/mp4' = any(select unnest(allowed_mime_types) from storage.buckets where id='facility-photos')),
  '写真バケットが動画を許可していない（誤アップロード防止）');

-- =============================================================================
-- 2. テスト用の利用者を用意する
-- =============================================================================
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@example.com');

insert into public.admin_profiles (user_id, display_name, role) values
  ('11111111-1111-1111-1111-111111111111', '管理者テスト', 'admin'),
  ('22222222-2222-2222-2222-222222222222', '編集者テスト', 'editor');
-- stranger は admin_profiles に登録しない（ログインはできるが権限は無い状態）

-- =============================================================================
-- 3. 権限判定
-- =============================================================================
set local role authenticated;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.assert(public.is_staff(),  'admin は staff と判定される');
select pg_temp.assert(public.is_admin(),  'admin は admin と判定される');

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.assert(public.is_staff(),      'editor は staff と判定される');
select pg_temp.assert(not public.is_admin(),  'editor は admin と判定されない');

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.assert(not public.is_staff(), '未登録ユーザーは staff と判定されない');

reset role;

-- =============================================================================
-- 4. 施設データの書き込み権限
-- =============================================================================
set local role authenticated;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into public.facilities (code, name, name_kana, category_id, prefecture, address_line)
values ('HTL-0100', '編集者が作成したホテル', 'へんしゅうしゃがさくせいしたほてる',
        (select id from public.categories where code='hotel'), '東京都', 'テスト1-1');
select pg_temp.assert(
  exists (select 1 from public.facilities where code='HTL-0100'),
  'editor は施設を登録できる');

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.assert_rejects($$
  insert into public.facilities (code, name, name_kana, category_id, prefecture, address_line)
  values ('HTL-0101', '不正', 'ふせい',
          (select id from public.categories where code='hotel'), '東京都', 'X')
$$, '未登録ユーザーは施設を登録できない（ログイン済みでも）');

select pg_temp.assert(
  (select count(*) from public.facilities where code='HTL-0100') = 0,
  '未登録ユーザーには下書きの施設が見えない');

reset role;

-- =============================================================================
-- 5. Storage への書き込み権限
-- =============================================================================
set local role authenticated;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into storage.objects (bucket_id, name) values ('facility-photos', 'HTL-0100_A_dropoff_01.jpg');
select pg_temp.assert(
  exists (select 1 from storage.objects where name = 'HTL-0100_A_dropoff_01.jpg'),
  'editor は写真をアップロードできる');

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.assert_rejects(
  $$insert into storage.objects (bucket_id, name) values ('facility-photos', 'hack.jpg')$$,
  '未登録ユーザーは写真をアップロードできない');

-- RLS の DELETE / UPDATE は「エラーを投げる」のではなく「対象行を絞り込む」。
-- 権限が無い場合は 0 件削除として静かに成功するため、
-- 例外の有無ではなく「行が残っていること」で検証する。
delete from storage.objects where name = 'HTL-0100_A_dropoff_01.jpg';
select pg_temp.assert(
  exists (select 1 from storage.objects where name = 'HTL-0100_A_dropoff_01.jpg'),
  '未登録ユーザーの削除は0件に絞り込まれ、写真が残る');

reset role;

-- 誰でも読める（Public バケットのため）
set local role anon;
select pg_temp.assert(
  (select count(*) from storage.objects where bucket_id = 'facility-photos') = 1,
  'anon は写真を読める（Public バケット）');

select pg_temp.assert_rejects(
  $$insert into storage.objects (bucket_id, name) values ('facility-photos', 'anon.jpg')$$,
  'anon は写真をアップロードできない');
reset role;

rollback;

\echo ''
\echo '================================================='
\echo ' Storage・権限テスト 合格'
\echo '================================================='
