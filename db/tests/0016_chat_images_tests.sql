-- =============================================================================
-- チャット：書き込みに画像を1枚添える（20261108000001）を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0016_chat_images_tests.sql
--
-- 1つの取引の中では now() が変わらないため、同じ会員が書けるのは5件まで
-- （1分に5件の制限）。確かめることごとに会員を分けている。
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

insert into auth.users (id, email) values
  ('c1c10000-0000-0000-0000-00000000000a', 'img-a@example.com'),
  ('c1c10000-0000-0000-0000-00000000000b', 'img-b@example.com'),
  ('c1c10000-0000-0000-0000-00000000000c', 'img-c@example.com'),
  ('c1c10000-0000-0000-0000-00000000000d', 'img-muted@example.com'),
  ('c1c10000-0000-0000-0000-00000000000e', 'img-editor@example.com');
insert into public.driver_profiles (user_id, trial_ends_at, display_name, chat_muted) values
  ('c1c10000-0000-0000-0000-00000000000a', now() + interval '1 month', 'エー', false),
  ('c1c10000-0000-0000-0000-00000000000b', now() + interval '1 month', 'ビー', false),
  ('c1c10000-0000-0000-0000-00000000000c', now() + interval '1 month', 'シー', false),
  ('c1c10000-0000-0000-0000-00000000000d', now() + interval '1 month', 'ディー', true);
insert into public.admin_profiles (user_id, display_name, role) values
  ('c1c10000-0000-0000-0000-00000000000e', '編集者', 'editor');

\set A '''c1c10000-0000-0000-0000-00000000000a'''
\set B '''c1c10000-0000-0000-0000-00000000000b'''
\set C '''c1c10000-0000-0000-0000-00000000000c'''
\set D '''c1c10000-0000-0000-0000-00000000000d'''
\set E '''c1c10000-0000-0000-0000-00000000000e'''

select pg_temp.assert(
  (select not public and allowed_mime_types = array['image/jpeg'] and file_size_limit = 2097152
     from storage.buckets where id = 'chat-images'),
  '画像の置き場所は非公開・jpeg だけ・2MB まで');

-- =============================================================================
-- 1. 置く（置き場所）
-- =============================================================================
set local role authenticated;
set local request.jwt.claim.sub = :A;

insert into storage.objects (bucket_id, name) values
  ('chat-images', 'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000001.jpg'),
  ('chat-images', 'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000002.jpg'),
  ('chat-images', 'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000009.jpg');
select pg_temp.assert(true, '書き込める会員は、自分の場所に画像を置ける');

select pg_temp.assert_rejects(
  $$insert into storage.objects (bucket_id, name)
    values ('chat-images', 'c1c10000-0000-0000-0000-00000000000b/x.jpg')$$,
  'ほかの会員の場所には置けない');

set local request.jwt.claim.sub = :D;
select pg_temp.assert_rejects(
  $$insert into storage.objects (bucket_id, name)
    values ('chat-images', 'c1c10000-0000-0000-0000-00000000000d/x.jpg')$$,
  '書き込みを止められた会員は、画像も置けない');

-- =============================================================================
-- 2. 書く（画像の列）
-- =============================================================================
set local request.jwt.claim.sub = :A;

insert into public.chat_messages (id, user_id, body, image_path, image_width, image_height) values
  ('c1c1aaaa-0000-0000-0000-000000000001', :A::uuid, '入口の写真です',
   'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000001.jpg', 1280, 960);
select pg_temp.assert(true, '文と画像を書ける');

insert into public.chat_messages (id, user_id, body, image_path, image_width, image_height) values
  ('c1c1aaaa-0000-0000-0000-000000000002', :A::uuid, '',
   'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000002.jpg', 960, 1280);
select pg_temp.assert(true, '画像だけ（文が空）でも書ける');

select pg_temp.assert_rejects(
  $$insert into public.chat_messages (user_id, body) values ('c1c10000-0000-0000-0000-00000000000a', '  ')$$,
  '文も画像も無い書き込みはできない');

select pg_temp.assert_rejects(
  $$insert into public.chat_messages (id, user_id, body, image_path, image_width, image_height) values
    ('c1c1aaaa-0000-0000-0000-000000000003', 'c1c10000-0000-0000-0000-00000000000a', '',
     'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000001.jpg', 10, 10)$$,
  'ほかの書き込みの画像を付け直せない（道筋は自分の書き込みの id）');

select pg_temp.assert_rejects(
  $$insert into public.chat_messages (id, user_id, body, image_path, image_width, image_height) values
    ('c1c1aaaa-0000-0000-0000-000000000003', 'c1c10000-0000-0000-0000-00000000000a', '',
     'c1c10000-0000-0000-0000-00000000000b/c1c1aaaa-0000-0000-0000-000000000003.jpg', 10, 10)$$,
  'ほかの会員の場所の画像は付けられない');

select pg_temp.assert_rejects(
  $$insert into public.chat_messages (id, user_id, body, image_path, image_width, image_height) values
    ('c1c1aaaa-0000-0000-0000-000000000003', 'c1c10000-0000-0000-0000-00000000000a', '',
     'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000003.jpg', 5000, 10)$$,
  '縦横がおかしい画像は付けられない');

reset role;
select pg_temp.assert(
  (select flags = array['image'] from public.chat_messages where id = 'c1c1aaaa-0000-0000-0000-000000000002'),
  '画像には「要確認」の旗（image）が立つ');
select pg_temp.assert(
  (select 'image' = any(flags) from public.chat_messages where id = 'c1c1aaaa-0000-0000-0000-000000000001'),
  '文と画像のときも、画像の旗が立つ');

-- =============================================================================
-- 3. 読む
-- =============================================================================
set local role authenticated;
set local request.jwt.claim.sub = :B;

create temp table feed as select public.chat_feed('general', null, 300, 10, 0) as j;
select pg_temp.assert(
  exists (
    select 1 from jsonb_array_elements((select j->'messages' from feed)) m
    where m->>'id' = 'c1c1aaaa-0000-0000-0000-000000000001'
      and m->>'image_path' = 'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000001.jpg'
      and (m->>'image_width')::int = 1280 and (m->>'image_height')::int = 960
  ),
  '読む関数が、画像の道筋と縦横を返す');

select pg_temp.assert(
  (select count(*) from storage.objects where bucket_id = 'chat-images') = 2,
  'ほかの会員は、書き込みに付いた画像だけを読める（付いていない画像は読めない）');

set local role anon;
select pg_temp.assert(
  (select count(*) from storage.objects where bucket_id = 'chat-images') = 0,
  'ログインしていない人は読めない');

-- 運営が隠すと、会員はその画像を読めなくなる
set local role authenticated;
set local request.jwt.claim.sub = :E;
update public.chat_messages set hidden_at = now() where id = 'c1c1aaaa-0000-0000-0000-000000000001';
select pg_temp.assert(
  (select count(*) from storage.objects where bucket_id = 'chat-images') = 3,
  '編集者は、隠した書き込みの画像も含めて読める');

set local request.jwt.claim.sub = :B;
select pg_temp.assert(
  not exists (select 1 from storage.objects
               where name = 'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000001.jpg'),
  '隠した書き込みの画像は、ほかの会員には読めない');

set local request.jwt.claim.sub = :A;
select pg_temp.assert(
  (select count(*) from storage.objects where bucket_id = 'chat-images') = 3,
  '自分が置いた画像は、いつでも読める');

-- 90日を過ぎた書き込みの画像も、ほかの会員は読めない
reset role;
insert into public.chat_messages (id, user_id, body, image_path, image_width, image_height, created_at) values
  ('c1c1aaaa-0000-0000-0000-000000000004', :B::uuid, '',
   'c1c10000-0000-0000-0000-00000000000b/c1c1aaaa-0000-0000-0000-000000000004.jpg', 10, 10, now() - interval '91 days');
insert into storage.objects (bucket_id, name) values
  ('chat-images', 'c1c10000-0000-0000-0000-00000000000b/c1c1aaaa-0000-0000-0000-000000000004.jpg');
set local role authenticated;
set local request.jwt.claim.sub = :C;
select pg_temp.assert(
  not exists (select 1 from storage.objects
               where name = 'c1c10000-0000-0000-0000-00000000000b/c1c1aaaa-0000-0000-0000-000000000004.jpg'),
  '90日を過ぎた書き込みの画像は、ほかの会員には読めない');

-- =============================================================================
-- 4. 画像は1日に20枚まで
-- =============================================================================
reset role;
insert into public.chat_messages (id, user_id, body, image_path, image_width, image_height, created_at)
select g.id, :C::uuid, '', :C || '/' || g.id::text || '.jpg', 10, 10, now() - interval '2 hours'
from (select gen_random_uuid() as id from generate_series(1, 20)) g;

set local role authenticated;
set local request.jwt.claim.sub = :C;
select pg_temp.assert_rejects(
  $$insert into public.chat_messages (id, user_id, body, image_path, image_width, image_height) values
    ('c1c1aaaa-0000-0000-0000-000000000005', 'c1c10000-0000-0000-0000-00000000000c', '',
     'c1c10000-0000-0000-0000-00000000000c/c1c1aaaa-0000-0000-0000-000000000005.jpg', 10, 10)$$,
  '24時間に21枚目の画像は書けない（too_many_images）');

insert into public.chat_messages (user_id, body) values (:C::uuid, '文だけなら書ける');
select pg_temp.assert(true, '画像の上限に達しても、文だけの書き込みはできる');

-- =============================================================================
-- 5. 消した書き込みの画像を控える
-- =============================================================================
set local request.jwt.claim.sub = :A;
delete from public.chat_messages where id = 'c1c1aaaa-0000-0000-0000-000000000002';

select pg_temp.assert_rejects(
  $$select count(*) from public.chat_image_trash$$,
  '会員は、消す画像の控えを読めない');

set local request.jwt.claim.sub = :E;
select pg_temp.assert_rejects(
  $$select count(*) from public.chat_image_trash$$,
  '職員の鍵でも、消す画像の控えは読めない（管理画面の service_role だけ）');

reset role;
select pg_temp.assert(
  exists (select 1 from public.chat_image_trash
           where path = 'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000002.jpg'),
  '本人が書き込みを消すと、画像の道筋が控えに入る');

-- 1年を過ぎて消えたときも控えに入る
insert into public.chat_messages (id, user_id, body, image_path, image_width, image_height, created_at) values
  ('c1c1aaaa-0000-0000-0000-000000000006', :B::uuid, '',
   'c1c10000-0000-0000-0000-00000000000b/c1c1aaaa-0000-0000-0000-000000000006.jpg', 10, 10, now() - interval '400 days');
select public.purge_old_chat();
select pg_temp.assert(
  exists (select 1 from public.chat_image_trash
           where path = 'c1c10000-0000-0000-0000-00000000000b/c1c1aaaa-0000-0000-0000-000000000006.jpg'),
  '1年を過ぎて消えた書き込みの画像も、控えに入る');

-- 退会（アカウントを消す）で書き込みが消えたときも控えに入る
delete from auth.users where id = :C::uuid;
select pg_temp.assert(
  (select count(*) from public.chat_image_trash where path like 'c1c10000-0000-0000-0000-00000000000c/%') = 20,
  '退会で書き込みが消えたときも、画像が控えに入る');

-- =============================================================================
-- 6. 自分の画像は消せる。ほかの会員の画像は消せない
-- =============================================================================
set local role authenticated;
set local request.jwt.claim.sub = :B;
delete from storage.objects
 where name = 'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000009.jpg';
reset role;
select pg_temp.assert(
  exists (select 1 from storage.objects
           where name = 'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000009.jpg'),
  'ほかの会員の画像は消せない');

set local role authenticated;
set local request.jwt.claim.sub = :A;
delete from storage.objects
 where name = 'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000009.jpg';
reset role;
select pg_temp.assert(
  not exists (select 1 from storage.objects
               where name = 'c1c10000-0000-0000-0000-00000000000a/c1c1aaaa-0000-0000-0000-000000000009.jpg'),
  '自分の画像は消せる');

rollback;
