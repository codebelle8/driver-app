-- =============================================================================
-- 調査員 (surveyor) の権限分離と、操作履歴の記録を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0003_surveyor_tests.sql
--
-- なぜ厚く検証するか:
--   この権限設計は「現地調査を担当する20名が、公開済みのデータを壊せない」
--   ことを保証するためのもの。RLS の不備は例外を投げず、静かに通ってしまう
--   ため、コードを読むだけでは間違いに気づけない。実際に操作して確かめる。
--
-- 重要な前提 — 拒否のされ方が2種類あること:
--
--   using に反する場合    … その行が「見えない」だけなので、UPDATE / DELETE は
--                           エラーにならず対象0件で静かに終わる。
--                           例）公開済みの施設を書き換えようとしたとき
--
--   with check に反する場合 … 書き込もうとした結果が許されないため例外になる。
--                           例）下書きを公開状態へ変更しようとしたとき
--
--   したがって検証方法を使い分ける必要がある。前者は「行が変わっていないこと」、
--   後者は「例外が出ること」で確かめる。ここを取り違えると、通っていない
--   はずの操作を通っていると誤認する。
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
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin2@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'editor2@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'surveyor@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'surveyor2@example.com');

insert into public.admin_profiles (user_id, display_name, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '管理者',   'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '編集者',   'editor'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '調査員甲', 'surveyor'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '調査員乙', 'surveyor');

\set ADMIN    '''aaaaaaaa-0000-0000-0000-000000000001'''
\set EDITOR   '''aaaaaaaa-0000-0000-0000-000000000002'''
\set SURVEYOR '''aaaaaaaa-0000-0000-0000-000000000003'''

-- 検証の土台となる施設を2件（公開済み / 未公開）用意する
insert into public.facilities
  (id, code, name, name_kana, category_id, prefecture, address_line, status)
values
  ('ffffffff-0000-0000-0000-000000000001', 'HTL-9001', '公開済みホテル', 'こうかいずみほてる',
   (select id from public.categories where code='hotel'), '東京都', '公開1-1', 'published'),
  ('ffffffff-0000-0000-0000-000000000002', 'HTL-9002', '下書きホテル', 'したがきほてる',
   (select id from public.categories where code='hotel'), '東京都', '下書1-1', 'draft');

insert into public.entry_points (id, facility_id, code, kind, name)
values
  ('eeeeeeee-0000-0000-0000-000000000001',
   'ffffffff-0000-0000-0000-000000000001', 'A', 'dropoff', '公開済みの車寄せ'),
  ('eeeeeeee-0000-0000-0000-000000000002',
   'ffffffff-0000-0000-0000-000000000002', 'A', 'dropoff', '下書きの車寄せ');

-- =============================================================================
-- 2. 役割の判定
-- =============================================================================
set local role authenticated;

set local request.jwt.claim.sub = :SURVEYOR;
select pg_temp.assert(public.is_staff(),        'surveyor は staff と判定される');
select pg_temp.assert(public.is_surveyor(),     'surveyor は surveyor と判定される');
select pg_temp.assert(not public.is_manager(),  'surveyor は manager と判定されない');
select pg_temp.assert(not public.is_admin(),    'surveyor は admin と判定されない');

set local request.jwt.claim.sub = :EDITOR;
select pg_temp.assert(public.is_manager(),      'editor は manager と判定される');
select pg_temp.assert(not public.is_surveyor(), 'editor は surveyor と判定されない');

set local request.jwt.claim.sub = :ADMIN;
select pg_temp.assert(public.is_manager(),      'admin は manager と判定される');

-- =============================================================================
-- 3. 施設 — 調査員にできること
-- =============================================================================
set local request.jwt.claim.sub = :SURVEYOR;

insert into public.facilities (code, name, name_kana, category_id, prefecture, address_line)
values ('HTL-9010', '調査員が作ったホテル', 'ちょうさいんがつくったほてる',
        (select id from public.categories where code='hotel'), '東京都', '調査1-1');
select pg_temp.assert(
  exists (select 1 from public.facilities where code='HTL-9010' and status='draft'),
  'surveyor は下書きの施設を作れる');

update public.facilities set summary = '調査員が書いた概要'
 where id = 'ffffffff-0000-0000-0000-000000000002';
select pg_temp.assert(
  (select summary from public.facilities
    where id='ffffffff-0000-0000-0000-000000000002') = '調査員が書いた概要',
  'surveyor は未公開の施設を編集できる');

-- =============================================================================
-- 4. 施設 — 調査員にできてはならないこと
-- =============================================================================

-- 最初から公開状態で作る抜け道を塞ぐ
select pg_temp.assert_rejects($$
  insert into public.facilities
    (code, name, name_kana, category_id, prefecture, address_line, status)
  values ('HTL-9011', '抜け道', 'ぬけみち',
          (select id from public.categories where code='hotel'), '東京都', 'X', 'published')
$$, 'surveyor は最初から公開状態の施設を作れない');

-- 下書きを公開へ切り替える経路を塞ぐ。
-- これは using ではなく with check に反するため、0件ではなく例外になる。
select pg_temp.assert_rejects($$
  update public.facilities set status = 'published'
   where id = 'ffffffff-0000-0000-0000-000000000002'
$$, 'surveyor は下書きを公開できない');

select pg_temp.assert(
  (select status from public.facilities
    where id='ffffffff-0000-0000-0000-000000000002') = 'draft',
  '公開が拒否されたあとも下書きのままである');

-- 公開済みのデータを書き換えられない
update public.facilities set name = '改ざん'
 where id = 'ffffffff-0000-0000-0000-000000000001';
select pg_temp.assert(
  (select name from public.facilities
    where id='ffffffff-0000-0000-0000-000000000001') = '公開済みホテル',
  'surveyor は公開済みの施設を編集できない');

-- 削除ポリシーそのものを作っていない
delete from public.facilities where id = 'ffffffff-0000-0000-0000-000000000001';
select pg_temp.assert(
  exists (select 1 from public.facilities where id='ffffffff-0000-0000-0000-000000000001'),
  'surveyor は公開済みの施設を削除できない');

delete from public.facilities where id = 'ffffffff-0000-0000-0000-000000000002';
select pg_temp.assert(
  exists (select 1 from public.facilities where id='ffffffff-0000-0000-0000-000000000002'),
  'surveyor は下書きの施設も削除できない（作り直しは編集で行う）');

-- =============================================================================
-- 5. 進入口・注意事項・写真 — 親施設の公開状態に従う
-- =============================================================================

insert into public.entry_points (facility_id, code, kind, name)
values ('ffffffff-0000-0000-0000-000000000002', 'B', 'entrance', '調査員が追加した入口');
select pg_temp.assert(
  exists (select 1 from public.entry_points
           where facility_id='ffffffff-0000-0000-0000-000000000002' and code='B'),
  'surveyor は未公開施設に進入口を追加できる');

select pg_temp.assert_rejects($$
  insert into public.entry_points (facility_id, code, kind, name)
  values ('ffffffff-0000-0000-0000-000000000001', 'Z', 'entrance', '公開済みへの追加')
$$, 'surveyor は公開済み施設に進入口を追加できない');

update public.entry_points set name = '改ざん'
 where id = 'eeeeeeee-0000-0000-0000-000000000001';
select pg_temp.assert(
  (select name from public.entry_points
    where id='eeeeeeee-0000-0000-0000-000000000001') = '公開済みの車寄せ',
  'surveyor は公開済み施設の進入口を編集できない');

-- 下書き作成中の作り直しは日常的に起きるため、進入口の削除は許している
delete from public.entry_points
 where facility_id='ffffffff-0000-0000-0000-000000000002' and code='B';
select pg_temp.assert(
  not exists (select 1 from public.entry_points
               where facility_id='ffffffff-0000-0000-0000-000000000002' and code='B'),
  'surveyor は未公開施設の進入口を削除できる');

insert into public.cautions (entry_point_id, body)
values ('eeeeeeee-0000-0000-0000-000000000002', '下書きへの注意事項');
select pg_temp.assert(
  exists (select 1 from public.cautions
           where entry_point_id='eeeeeeee-0000-0000-0000-000000000002'),
  'surveyor は未公開の進入口に注意事項を追加できる');

select pg_temp.assert_rejects($$
  insert into public.cautions (entry_point_id, body)
  values ('eeeeeeee-0000-0000-0000-000000000001', '公開済みへの注意事項')
$$, 'surveyor は公開済みの進入口に注意事項を追加できない');

insert into public.photos (facility_id, kind, storage_path)
values ('ffffffff-0000-0000-0000-000000000002', 'exterior', 'HTL-9002_ext_01.jpg');
select pg_temp.assert(
  exists (select 1 from public.photos where storage_path='HTL-9002_ext_01.jpg'),
  'surveyor は未公開施設の写真を登録できる');

select pg_temp.assert_rejects($$
  insert into public.photos (facility_id, kind, storage_path)
  values ('ffffffff-0000-0000-0000-000000000001', 'exterior', 'HTL-9001_ext_01.jpg')
$$, 'surveyor は公開済み施設の写真を登録できない');

-- =============================================================================
-- 6. 管理領域 — 調査員は関与できない
-- =============================================================================

select pg_temp.assert_rejects($$
  insert into public.categories (code, name, code_prefix)
  values ('bogus', '偽カテゴリ', 'BGS')
$$, 'surveyor はカテゴリを追加できない');

select pg_temp.assert(
  (select count(*) from public.audit_logs) = 0,
  'surveyor は操作履歴を読めない');

-- 権限昇格の試み。ここが通ると権限設計そのものが無意味になる。
update public.admin_profiles set role = 'admin'
 where user_id = 'aaaaaaaa-0000-0000-0000-000000000003';
select pg_temp.assert(
  (select role from public.admin_profiles
    where user_id='aaaaaaaa-0000-0000-0000-000000000003') = 'surveyor',
  'surveyor は自分を管理者に昇格できない');

select pg_temp.assert(
  (select count(*) from public.admin_profiles) = 1,
  'surveyor には自分のアカウントしか見えない');

reset role;

-- =============================================================================
-- 7. 対比 — 管理者側は従来どおり操作できる
-- =============================================================================
set local role authenticated;
set local request.jwt.claim.sub = :EDITOR;

update public.facilities set status = 'published'
 where id = 'ffffffff-0000-0000-0000-000000000002';
select pg_temp.assert(
  (select status from public.facilities
    where id='ffffffff-0000-0000-0000-000000000002') = 'published',
  'editor は施設を公開できる');

update public.facilities set summary = '編集者による修正'
 where id = 'ffffffff-0000-0000-0000-000000000001';
select pg_temp.assert(
  (select summary from public.facilities
    where id='ffffffff-0000-0000-0000-000000000001') = '編集者による修正',
  'editor は公開済みの施設を編集できる');

reset role;

-- =============================================================================
-- 8. 操作履歴が実際に記録されているか
--
-- audit_logs はテーブルだけが用意されていて、書き込む仕組みが無かった。
-- 20名で運用する以上、記録漏れは追跡不能を意味するため厚めに確認する。
-- =============================================================================

select pg_temp.assert(
  exists (
    select 1 from public.audit_logs
     where table_name = 'facilities'
       and action = 'insert'
       and actor_id = 'aaaaaaaa-0000-0000-0000-000000000003'
  ),
  '調査員が作った施設が、本人の操作として記録されている');

select pg_temp.assert(
  exists (
    select 1 from public.audit_logs
     where table_name = 'facilities'
       and action = 'publish'
       and actor_id = 'aaaaaaaa-0000-0000-0000-000000000002'
  ),
  '公開は update ではなく publish として記録される');

select pg_temp.assert(
  (select diff -> 'summary' ->> 'after'
     from public.audit_logs
    where table_name='facilities' and action='update'
      and diff ? 'summary'
    order by id desc limit 1) = '編集者による修正',
  '差分に変更後の値が入っている');

select pg_temp.assert(
  (select diff -> 'summary' ->> 'before'
     from public.audit_logs
    where table_name='facilities' and action='update'
      and diff ? 'summary'
    order by id desc limit 1) = '調査員が書いた概要',
  '差分に変更前の値が入っている');

select pg_temp.assert(
  not exists (select 1 from public.audit_logs where diff ? 'updated_at'),
  '自動更新される列は履歴に含めない（雑音を除く）');

select pg_temp.assert(
  not exists (select 1 from public.audit_logs where diff ? 'search_text'),
  '検索用の内部列は履歴に含めない');

-- 拒否された操作は記録されない（行が変わっていないため）
select pg_temp.assert(
  not exists (
    select 1 from public.audit_logs
     where table_name = 'facilities'
       and diff -> 'name' ->> 'after' = '改ざん'
  ),
  '拒否された書き換えは履歴に残らない');

select pg_temp.assert(
  exists (
    select 1 from public.audit_logs
     where table_name = 'admin_profiles' and action = 'insert'
  ),
  'アカウントの発行そのものも記録される');

rollback;
