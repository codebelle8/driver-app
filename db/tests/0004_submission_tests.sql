-- =============================================================================
-- 情報提供（submissions）の権限を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0004_submission_tests.sql
--
-- 採用の件数は、翌月無料の判断に使う。会員が自分で「採用」にできたり、
-- 審査の日付をさかのぼれたりすると、無料の判断そのものが崩れる。
-- RLS の不備は例外を投げずに静かに通るため、実際に操作して確かめる。
--
--   using に反する … 行が見えないだけ。UPDATE は対象0件で静かに終わる
--   with check に反する … 例外になる
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
-- 1. 登場人物
-- =============================================================================
insert into auth.users (id, email) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'sub-admin@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'sub-editor@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'sub-surveyor@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000011', 'driver-a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000012', 'driver-b@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000013', 'driver-blocked@example.com');

insert into public.admin_profiles (user_id, display_name, role) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '管理者', 'admin'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '編集者', 'editor'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '調査員', 'surveyor');

insert into public.driver_profiles (user_id, trial_ends_at, status) values
  ('bbbbbbbb-0000-0000-0000-000000000011', now() + interval '1 month', 'trial'),
  ('bbbbbbbb-0000-0000-0000-000000000012', now() + interval '1 month', 'trial'),
  ('bbbbbbbb-0000-0000-0000-000000000013', now() + interval '1 month', 'blocked');

\set ADMIN    '''bbbbbbbb-0000-0000-0000-000000000001'''
\set EDITOR   '''bbbbbbbb-0000-0000-0000-000000000002'''
\set SURVEYOR '''bbbbbbbb-0000-0000-0000-000000000003'''
\set DRIVER_A '''bbbbbbbb-0000-0000-0000-000000000011'''
\set DRIVER_B '''bbbbbbbb-0000-0000-0000-000000000012'''
\set BLOCKED  '''bbbbbbbb-0000-0000-0000-000000000013'''

insert into public.facilities
  (id, code, name, name_kana, category_id, prefecture, address_line, status)
values
  ('ffffffff-0000-0000-0000-0000000000a1', 'HTL-9101', '情報提供ホテル', 'じょうほうていきょうほてる',
   (select id from public.categories where code='hotel'), '東京都', '提供1-1', 'published');

-- =============================================================================
-- 2. 会員が送る
-- =============================================================================
set local role authenticated;
set local request.jwt.claim.sub = :DRIVER_A;

insert into public.submissions (id, facility_id, kind, body, photo_paths, lat, lng)
values ('eeeeeeee-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000a1',
        'wrong_place', '入口は一本南の道です',
        array['bbbbbbbb-0000-0000-0000-000000000011/a.jpg'], 35.67, 139.75);

select pg_temp.assert(
  (select user_id from public.submissions where id = 'eeeeeeee-0000-0000-0000-000000000001')
    = :DRIVER_A::uuid,
  '会員は自分の名前で送れる（user_id は自動で本人）');

select pg_temp.assert(
  (select status from public.submissions where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'pending',
  '送った直後は審査待ち');

select pg_temp.assert_rejects(
  $$insert into public.submissions (facility_id, kind, body, status)
    values ('ffffffff-0000-0000-0000-0000000000a1', 'other', '採用にして', 'accepted')$$,
  '会員は「採用」で送れない（状態の列は書けない）');

select pg_temp.assert_rejects(
  format($$insert into public.submissions (user_id, kind, body) values (%L, 'other', 'なりすまし')$$,
         'bbbbbbbb-0000-0000-0000-000000000012'),
  '他人の名前では送れない');

select pg_temp.assert_rejects(
  $$insert into public.submissions (kind, body, photo_paths)
    values ('photo', '他人の写真', array['bbbbbbbb-0000-0000-0000-000000000012/x.jpg'])$$,
  '他人の置き場所の写真は付けられない');

select pg_temp.assert_rejects(
  $$insert into public.submissions (kind, body, photo_paths)
    values ('photo', '4枚', array['bbbbbbbb-0000-0000-0000-000000000011/1.jpg',
      'bbbbbbbb-0000-0000-0000-000000000011/2.jpg','bbbbbbbb-0000-0000-0000-000000000011/3.jpg',
      'bbbbbbbb-0000-0000-0000-000000000011/4.jpg'])$$,
  '写真は3枚まで');

select pg_temp.assert_rejects(
  $$insert into public.submissions (kind, body) values ('other', '   ')$$,
  '中身が空では送れない');

select pg_temp.assert_rejects(
  $$insert into public.submissions (kind, body, lat) values ('other', '緯度だけ', 35.6)$$,
  '位置は緯度と経度の両方がそろっていないと送れない');

select pg_temp.assert_rejects(
  $$insert into public.submissions (kind, body) values ('rumor', '知らない種類')$$,
  '決められた種類でしか送れない');

-- 会員は書き換えられない（using に反する → 0件で静かに終わる）
update public.submissions set status = 'accepted' where id = 'eeeeeeee-0000-0000-0000-000000000001';
select pg_temp.assert(
  (select status from public.submissions where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'pending',
  '会員は自分の情報を「採用」に書き換えられない');

select pg_temp.assert_rejects(
  $$update public.submissions set body = '書き換え' where id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  '会員は送った中身を書き換えられない（列の権限が無い）');

select pg_temp.assert_rejects(
  $$select review_note from public.submissions$$,
  '会員は職員の覚え書きを読めない');

-- 送りすぎの制限（24時間に20件まで）。1件送ってあるので、あと19件で上限
insert into public.submissions (kind, body)
select 'other', '連投 ' || g from generate_series(1, 19) g;
select pg_temp.assert_rejects(
  $$insert into public.submissions (kind, body) values ('other', '21件目')$$,
  '24時間に送れるのは20件まで');

-- =============================================================================
-- 3. ほかの会員・止められた会員
-- =============================================================================
set local request.jwt.claim.sub = :DRIVER_B;
select pg_temp.assert(
  (select count(*) from public.submissions) = 0,
  'ほかの会員の情報は読めない');

set local request.jwt.claim.sub = :BLOCKED;
select pg_temp.assert_rejects(
  $$insert into public.submissions (kind, body) values ('other', '止められた会員')$$,
  '止められた会員は送れない');

-- =============================================================================
-- 4. 調査員（審査はしない）
-- =============================================================================
set local request.jwt.claim.sub = :SURVEYOR;
select pg_temp.assert(
  (select count(*) from public.submissions) = 0,
  '調査員は会員の情報提供を読めない');
update public.submissions set status = 'accepted' where id = 'eeeeeeee-0000-0000-0000-000000000001';

-- =============================================================================
-- 5. 編集者が審査する
-- =============================================================================
set local request.jwt.claim.sub = :EDITOR;
select pg_temp.assert(
  (select count(*) from public.submissions) = 20,
  '編集者はすべての情報提供を読める');

select pg_temp.assert(
  (select status from public.submissions where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'pending',
  '調査員の書き換えは効いていない');

update public.submissions
  set status = 'accepted', review_note = '現地で確認済み'
  where id = 'eeeeeeee-0000-0000-0000-000000000001';

-- 審査した人の列は、職員の画面（service_role）でしか読めない。ここでは権限を外して確かめる
reset role;
select pg_temp.assert(
  (select status = 'accepted' and reviewed_by = :EDITOR::uuid and reviewed_at is not null
     from public.submissions where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  '採用すると、審査した人と日時が自動で入る');
set local role authenticated;
set local request.jwt.claim.sub = :EDITOR;

select pg_temp.assert_rejects(
  $$update public.submissions set reviewed_at = now() - interval '40 days'
    where id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  '審査の日付をさかのぼれない（列の権限が無い）');

update public.submissions set review_note = '覚え書きだけ直す'
  where id = 'eeeeeeee-0000-0000-0000-000000000001';
reset role;
select pg_temp.assert(
  (select reviewed_by = :EDITOR::uuid from public.submissions
     where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  '状態を変えない書き換えでは、審査の記録は動かない');
set local role authenticated;
set local request.jwt.claim.sub = :EDITOR;

update public.submissions set status = 'pending'
  where id = 'eeeeeeee-0000-0000-0000-000000000001';
reset role;
select pg_temp.assert(
  (select reviewed_at is null and reviewed_by is null from public.submissions
     where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  '審査待ちへ戻すと、審査の記録は消える');

select pg_temp.assert(
  (select count(*) from public.audit_logs
     where table_name = 'submissions'
       and record_id = 'eeeeeeee-0000-0000-0000-000000000001') = 3,
  '審査（状態・覚え書きの変更）は操作履歴に残る');

select pg_temp.assert(
  (select count(*) from public.audit_logs
     where table_name = 'submissions' and action = 'insert') = 0,
  '会員が送ったこと自体は操作履歴に残さない');

-- =============================================================================
-- 6. 写真の置き場所
-- =============================================================================
set local role authenticated;
set local request.jwt.claim.sub = :DRIVER_A;
insert into storage.objects (bucket_id, name, owner)
values ('submissions', 'bbbbbbbb-0000-0000-0000-000000000011/a.jpg', :DRIVER_A::uuid);
select pg_temp.assert(true, '自分の置き場所には写真を置ける');

select pg_temp.assert_rejects(
  $$insert into storage.objects (bucket_id, name)
    values ('submissions', 'bbbbbbbb-0000-0000-0000-000000000012/b.jpg')$$,
  '他人の置き場所には置けない');

set local request.jwt.claim.sub = :DRIVER_B;
select pg_temp.assert(
  (select count(*) from storage.objects where bucket_id = 'submissions') = 0,
  'ほかの会員は写真を見られない');

set local role anon;
select pg_temp.assert(
  (select count(*) from storage.objects where bucket_id = 'submissions') = 0,
  'ログインしていない人は写真を見られない');

set local role authenticated;
set local request.jwt.claim.sub = :EDITOR;
select pg_temp.assert(
  (select count(*) from storage.objects where bucket_id = 'submissions') = 1,
  '編集者は写真を見られる');

select pg_temp.assert(
  (select not public from storage.buckets where id = 'submissions'),
  '写真の置き場所は非公開');

-- =============================================================================
-- 7. 退会すると一緒に消える
-- =============================================================================
reset role;
delete from auth.users where id = :DRIVER_A::uuid;
select pg_temp.assert(
  (select count(*) from public.submissions where user_id = :DRIVER_A::uuid) = 0,
  '退会すると、その方の情報提供も消える');

rollback;
