-- =============================================================================
-- チャット：90日で会員の画面から外す・10日ずつ読む・未確認・自動の旗 を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0012_chat_review_retention_tests.sql
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
  ('c0c00000-0000-0000-0000-00000000000a', 'retain-a@example.com'),
  ('c0c00000-0000-0000-0000-00000000000b', 'retain-b@example.com'),
  ('c0c00000-0000-0000-0000-00000000000e', 'retain-editor@example.com');
insert into public.driver_profiles (user_id, trial_ends_at, display_name) values
  ('c0c00000-0000-0000-0000-00000000000a', now() + interval '1 month', 'エー'),
  ('c0c00000-0000-0000-0000-00000000000b', now() + interval '1 month', 'ビー');
insert into public.admin_profiles (user_id, display_name, role) values
  ('c0c00000-0000-0000-0000-00000000000e', '編集者', 'editor');

\set A '''c0c00000-0000-0000-0000-00000000000a'''
\set B '''c0c00000-0000-0000-0000-00000000000b'''
\set E '''c0c00000-0000-0000-0000-00000000000e'''

/* 0〜100日前に1件ずつ（境目を避けて、それぞれ1時間ずらす）。本文は d0 … d100 */
insert into public.chat_messages (user_id, body, created_at)
select :A::uuid, 'd' || n, now() - make_interval(days => n, hours => 1)
from generate_series(0, 100) n;

set local role authenticated;
set local request.jwt.claim.sub = :B;

-- ---- 10日ずつ読む ------------------------------------------------------------
create temp table f1 as select public.chat_feed('general', null, 300, 10, 0) as j;
select pg_temp.assert(jsonb_array_length((select j->'messages' from f1)) = 10,
  '最初は10日ぶん（0〜9日前の10件）');
select pg_temp.assert((select (j->'messages'->0->>'body') from f1) = 'd0', '新しい順で返す');
select pg_temp.assert((select (j->>'more')::boolean from f1), 'さらに前があることを返す');
select pg_temp.assert((select (j->>'retention_days')::int from f1) = 90, '画面に残す日数（90）を返す');

select pg_temp.assert(
  jsonb_array_length(public.chat_feed('general', null, 300, 10, 20)->'messages') = 20,
  '10日のあいだが少なくても、少なくとも20件は返す');

create temp table f2 as
select public.chat_feed('general', ((select j->'messages'->9->>'created_at' from f1))::timestamptz, 300, 10, 0) as j;
select pg_temp.assert(
  jsonb_array_length((select j->'messages' from f2)) = 10
  and (select j->'messages'->0->>'body' from f2) = 'd10'
  and (select j->'messages'->9->>'body' from f2) = 'd19',
  '上へ読むと、その前の10日ぶん（10〜19日前）');

-- ---- 90日の線 ----------------------------------------------------------------
create temp table f3 as select public.chat_feed('general', null, 300) as j;
select pg_temp.assert(jsonb_array_length((select j->'messages' from f3)) = 90,
  '会員には90日ぶんまで（0〜89日前の90件）');
select pg_temp.assert(not (select j::text like '%"d90"%' or j::text like '%"d100"%' from f3),
  '90日を過ぎた書き込みは返さない');
select pg_temp.assert(not (select (j->>'more')::boolean from f3), '90日の線まで来たら、さらに前は無い');

select pg_temp.assert(
  (select count(*) from public.chat_messages where body ~ '^d[0-9]+$') = 90,
  '表を直に読んでも、会員には90日より前は見えない');

select pg_temp.assert(
  jsonb_array_length(public.chat_feed('general', null, 50)->'messages') = 50,
  'これまでの呼び方（3つの引数）も動く');

set local request.jwt.claim.sub = :E;
select pg_temp.assert(
  (select count(*) from public.chat_messages where body ~ '^d[0-9]+$') = 101,
  '管理者・編集者は、90日より前も読める（見張りと記録のため）');

-- ---- 自動の旗 ----------------------------------------------------------------
reset role;
insert into public.chat_messages (user_id, body) values
  (:A::uuid, '電話は０９０－１２３４－５６７８です'),
  (:A::uuid, '連絡は taro.yamada@example.co.jp へ'),
  (:A::uuid, 'くわしくは www.example.com を見て'),
  (:A::uuid, '品川500さ12-34の車が止まっていた'),
  /* 連投の制限（1分に5件）に当たらないよう、2人で書く */
  (:B::uuid, 'あいつはバカだ'),
  (:B::uuid, '工事は10時から10-12時までです'),
  (:B::uuid, '普通の書き込みです');

select pg_temp.assert((select flags from public.chat_messages where body like '電話は%') = '{phone}',
  '電話番号らしきもの（全角も）に旗');
select pg_temp.assert((select flags from public.chat_messages where body like '連絡は%') = '{email}',
  'メールアドレスに旗');
select pg_temp.assert((select flags from public.chat_messages where body like 'くわしくは%') = '{url}',
  'URL に旗');
select pg_temp.assert((select flags from public.chat_messages where body like '品川%') = '{plate}',
  '車の番号らしきものに旗');
select pg_temp.assert((select flags from public.chat_messages where body like 'あいつ%') = '{word}',
  '気をつける言葉に旗');
select pg_temp.assert((select flags from public.chat_messages where body like '工事は%') = '{}',
  '時刻の範囲（10-12時）は車の番号と取り違えない');
select pg_temp.assert((select flags from public.chat_messages where body like '普通の%') = '{}',
  'ふつうの書き込みには旗を立てない');

set local role authenticated;
set local request.jwt.claim.sub = :B;
select pg_temp.assert_rejects($$select flags from public.chat_messages limit 1$$,
  '会員は旗を読めない');
update public.chat_messages set flag_cleared_at = now() where body like '電話は%';
reset role;
select pg_temp.assert((select flag_cleared_at is null from public.chat_messages where body like '電話は%'),
  '会員は旗を下ろせない（変わらない）');

set local role authenticated;
set local request.jwt.claim.sub = :E;
update public.chat_messages set flag_cleared_at = now() where body like '電話は%';
select pg_temp.assert_rejects($$update public.chat_messages set flags = '{}' where body like 'あいつ%'$$,
  '旗そのものは書き換えられない');
reset role;
select pg_temp.assert(
  (select flag_cleared_at is not null and flag_cleared_by = :E::uuid and flags = '{phone}'
     from public.chat_messages where body like '電話は%'),
  '編集者は旗を下ろせる（誰が下ろしたかはデータベースが入れ、旗の記録は残る）');

-- ---- 未確認（ここまで確認した） ----------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = :B;
select pg_temp.assert_rejects($$select public.chat_mark_checked(now())$$,
  '会員は「ここまで確認した」を押せない');

set local request.jwt.claim.sub = :E;
select public.chat_mark_checked(now() - interval '5 days');
select pg_temp.assert(
  (select checked_until from public.chat_review_state where id = 1) = now() - interval '5 days'
  and (select checked_by from public.chat_review_state where id = 1) = :E::uuid,
  '編集者は「ここまで確認した」を押せる（誰が押したかも残る）');
select public.chat_mark_checked(now() - interval '30 days');
select pg_temp.assert(
  (select checked_until from public.chat_review_state where id = 1) = now() - interval '5 days',
  '印は戻らない（古い時刻で押しても先へ進めたまま）');
select public.chat_mark_checked(now() + interval '1 day');
select pg_temp.assert(
  (select checked_until from public.chat_review_state where id = 1) <= now(),
  '印は未来へは進めない');

rollback;
