-- =============================================================================
-- チャット（書き込み・通報・非表示・書き込みの停止・連投の制限）を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0007_chat_tests.sql
--
-- 会員どうしの書き込みは、他人の名前で書けたり、隠したものが見えたり、
-- 通報した人が分かったりすると、そのまま揉め事になる。実際に操作して確かめる。
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
  ('eeee0000-0000-0000-0000-00000000000a', 'chat-a@example.com'),
  ('eeee0000-0000-0000-0000-00000000000b', 'chat-b@example.com'),
  ('eeee0000-0000-0000-0000-00000000000c', 'chat-blocked@example.com'),
  ('eeee0000-0000-0000-0000-000000000001', 'chat-editor@example.com'),
  ('eeee0000-0000-0000-0000-000000000002', 'chat-surveyor@example.com');

insert into public.admin_profiles (user_id, display_name, role) values
  ('eeee0000-0000-0000-0000-000000000001', '編集者', 'editor'),
  ('eeee0000-0000-0000-0000-000000000002', '調査員', 'surveyor');

insert into public.driver_profiles (user_id, trial_ends_at, status, display_name) values
  ('eeee0000-0000-0000-0000-00000000000a', now() - interval '1 day', 'trial', 'エー'),
  ('eeee0000-0000-0000-0000-00000000000b', now() + interval '1 month', 'trial', null),
  ('eeee0000-0000-0000-0000-00000000000c', now() + interval '1 month', 'blocked', 'シー');

\set A        '''eeee0000-0000-0000-0000-00000000000a'''
\set B        '''eeee0000-0000-0000-0000-00000000000b'''
\set BLOCKED  '''eeee0000-0000-0000-0000-00000000000c'''
\set EDITOR   '''eeee0000-0000-0000-0000-000000000001'''
\set SURVEYOR '''eeee0000-0000-0000-0000-000000000002'''

set local role authenticated;

-- --- 書く ---------------------------------------------------------------------
set local request.jwt.claim.sub = :A;
insert into public.chat_messages (id, body)
values ('eeee1111-0000-0000-0000-000000000001', '帝国ホテルの B 入口、今日は工事中でした');
select pg_temp.assert(true, '会員は書き込める（無料期間が切れていても）');

select pg_temp.assert_rejects(
  format($$insert into public.chat_messages (user_id, body) values (%L, 'なりすまし')$$,
         'eeee0000-0000-0000-0000-00000000000b'),
  '他人の名前では書けない');
select pg_temp.assert_rejects($$insert into public.chat_messages (body) values ('   ')$$, '空の書き込みはできない');
select pg_temp.assert_rejects(
  $$insert into public.chat_messages (body) values (repeat('あ', 501))$$, '501字以上は書けない');
select pg_temp.assert_rejects(
  $$insert into public.chat_messages (channel, body) values ('secret', '知らないチャンネル')$$,
  '決められたチャンネルにしか書けない');
select pg_temp.assert_rejects(
  $$insert into public.chat_messages (body, hidden_at) values ('隠して書く', now())$$,
  '書くときに非表示の列は渡せない');

-- 連投の制限（1分に5件）。1件書いてあるので、あと4件で上限
insert into public.chat_messages (body) select '連投 ' || g from generate_series(1, 4) g;
select pg_temp.assert_rejects($$insert into public.chat_messages (body) values ('6件目')$$,
  '1分に書けるのは5件まで');

set local request.jwt.claim.sub = :BLOCKED;
select pg_temp.assert_rejects($$insert into public.chat_messages (body) values ('止められた会員')$$,
  '止められた会員は書けない');

-- --- 読む（名前つき） ------------------------------------------------------------
set local request.jwt.claim.sub = :B;
create temp table f as select public.chat_feed() as j;
grant select on f to authenticated;
select pg_temp.assert((select jsonb_array_length(j->'messages') from f) = 5, 'ほかの会員の書き込みを読める');
select pg_temp.assert(
  (select j->'messages'->4->>'name' = 'エー' and not (j->'messages'->4->>'mine')::boolean from f),
  '表示名が添えてあり、自分の書き込みではないと分かる');
select pg_temp.assert(
  (select position('chat-a@' in j::text) = 0 and position('member_no' in j::text) = 0 from f),
  'メールアドレスや会員番号は返さない');
select pg_temp.assert(
  (select (j->'me'->>'can_post')::boolean and not (j->'me'->>'has_name')::boolean from f),
  '本人の分: 書ける・表示名が無いことが分かる');

-- --- 通報 ---------------------------------------------------------------------
insert into public.chat_reports (message_id, reason)
values ('eeee1111-0000-0000-0000-000000000001', '確認のため');
select pg_temp.assert(true, 'ほかの方の書き込みを通報できる');
select pg_temp.assert_rejects(
  $$insert into public.chat_reports (message_id) values ('eeee1111-0000-0000-0000-000000000001')$$,
  '同じ書き込みを2回は通報できない');
select pg_temp.assert(
  (select count(*) from public.chat_reports) = 0,
  '会員は通報を読めない（誰が通報したかは見えない）');

set local request.jwt.claim.sub = :A;
select pg_temp.assert_rejects(
  $$insert into public.chat_reports (message_id) values ('eeee1111-0000-0000-0000-000000000001')$$,
  '自分の書き込みは通報できない');

-- 会員は非表示にできない（using に反する → 0件）
update public.chat_messages set hidden_at = now() where id = 'eeee1111-0000-0000-0000-000000000001';
select pg_temp.assert(
  (select count(*) from public.chat_messages where id = 'eeee1111-0000-0000-0000-000000000001') = 1,
  '会員は書き込みを非表示にできない');

-- 調査員は審査しない（チャットの管理も管理者・編集者だけ）
set local request.jwt.claim.sub = :SURVEYOR;
update public.chat_messages set hidden_at = now() where id = 'eeee1111-0000-0000-0000-000000000001';
select pg_temp.assert(
  (select count(*) from public.chat_reports) = 0, '調査員は通報を読めない');

-- --- 編集者が非表示にする -----------------------------------------------------------
set local request.jwt.claim.sub = :EDITOR;
select pg_temp.assert((select count(*) from public.chat_reports) = 1, '編集者は通報を読める');
update public.chat_messages set hidden_at = '2000-01-01' where id = 'eeee1111-0000-0000-0000-000000000001';
update public.chat_reports set state = 'done' where message_id = 'eeee1111-0000-0000-0000-000000000001';
reset role;
select pg_temp.assert(
  (select hidden_by = :EDITOR::uuid and hidden_at > now() - interval '1 minute'
     from public.chat_messages where id = 'eeee1111-0000-0000-0000-000000000001'),
  '非表示にした人と日時が自動で入る（日付をさかのぼれない）');
select pg_temp.assert(
  (select count(*) from public.audit_logs
     where table_name = 'chat_messages' and record_id = 'eeee1111-0000-0000-0000-000000000001') = 1,
  '非表示は操作履歴に残る');
select pg_temp.assert(
  (select state = 'done' from public.chat_reports where message_id = 'eeee1111-0000-0000-0000-000000000001'),
  '通報を片付けられる');

set local role authenticated;
set local request.jwt.claim.sub = :B;
select pg_temp.assert(
  (select jsonb_array_length((public.chat_feed())->'messages')) = 4,
  '非表示にした書き込みは、会員には見えない');

-- --- 書き込みの停止 ----------------------------------------------------------------
select pg_temp.assert_rejects(
  format($$update public.driver_profiles set chat_muted = true where user_id = %L$$,
         'eeee0000-0000-0000-0000-00000000000a'),
  '会員は書き込みの停止を変えられない');
reset role;
update public.driver_profiles set chat_muted = true where user_id = :B::uuid;
set local role authenticated;
set local request.jwt.claim.sub = :B;
select pg_temp.assert_rejects($$insert into public.chat_messages (body) values ('止められた')$$,
  '書き込みを止めた会員は書けない');
select pg_temp.assert(
  (select not ((public.chat_feed())->'me'->>'can_post')::boolean
          and ((public.chat_feed())->'me'->>'muted')::boolean),
  '止められていることが本人に分かる（読むことはできる）');

-- --- 消す ---------------------------------------------------------------------
set local request.jwt.claim.sub = :A;
delete from public.chat_messages where body = '連投 1';
select pg_temp.assert(
  (select count(*) from public.chat_messages where body = '連投 1') = 0, '自分の書き込みは消せる');

set local request.jwt.claim.sub = :EDITOR;
delete from public.chat_messages where body = '連投 2';
reset role;
select pg_temp.assert(
  (select count(*) from public.chat_messages where body = '連投 2') = 1,
  '職員も他人の書き込みは消せない（非表示を使う）');

set local role anon;
select pg_temp.assert_rejects($$select public.chat_feed()$$, 'ログインしていない人は読めない');

rollback;
