-- =============================================================================
-- チャット：1年を過ぎた書き込みを消す（purge_old_chat）を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0015_chat_retention_purge_tests.sql
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
  ('f1f10000-0000-0000-0000-00000000000a', 'purge-a@example.com'),
  ('f1f10000-0000-0000-0000-00000000000b', 'purge-b@example.com');
insert into public.driver_profiles (user_id, trial_ends_at) values
  ('f1f10000-0000-0000-0000-00000000000a', now() + interval '1 month'),
  ('f1f10000-0000-0000-0000-00000000000b', now() + interval '1 month');

/* 手元の検証用データベースに元からある書き込みは、検査に混ぜない */
delete from public.chat_messages where created_at < now() - interval '1 year';

insert into public.chat_messages (id, user_id, body, created_at, hidden_at) values
  ('f1f1aaaa-0000-0000-0000-000000000001', 'f1f10000-0000-0000-0000-00000000000a', '1年と1日前', now() - interval '366 days', null),
  ('f1f1aaaa-0000-0000-0000-000000000002', 'f1f10000-0000-0000-0000-00000000000a', '非表示にした古いもの', now() - interval '400 days', now() - interval '399 days'),
  ('f1f1aaaa-0000-0000-0000-000000000003', 'f1f10000-0000-0000-0000-00000000000a', '364日前', now() - interval '364 days', null);
insert into public.chat_reports (message_id, reporter_id) values
  ('f1f1aaaa-0000-0000-0000-000000000001', 'f1f10000-0000-0000-0000-00000000000b');

set local role anon;
select pg_temp.assert_rejects($$select public.purge_old_chat()$$, 'ログイン前は呼べない');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'f1f10000-0000-0000-0000-00000000000b';
select pg_temp.assert(public.purge_old_chat() = 2, '会員が呼んでも、1年を過ぎたもの（非表示のものも）だけを消す（2件）');

reset role;
select pg_temp.assert(
  not exists (select 1 from public.chat_messages
               where id in ('f1f1aaaa-0000-0000-0000-000000000001', 'f1f1aaaa-0000-0000-0000-000000000002')),
  '1年を過ぎた書き込みは、データベースから消える');
select pg_temp.assert(
  exists (select 1 from public.chat_messages where id = 'f1f1aaaa-0000-0000-0000-000000000003'),
  '1年に満たない書き込みは残る');
select pg_temp.assert(
  not exists (select 1 from public.chat_reports where message_id = 'f1f1aaaa-0000-0000-0000-000000000001'),
  '消した書き込みへの通報も一緒に消える');
select pg_temp.assert(
  (select (diff->'retention'->>'count')::int = 2 and diff::text not like '%1年と1日前%'
     from public.audit_logs where table_name = 'chat_messages' and action = 'delete'
     order by id desc limit 1),
  '操作履歴に「何件消したか」を残す（本文は残さない）');

create temp table logs_before as select count(*) as n from public.audit_logs;
select pg_temp.assert(public.purge_old_chat() = 0, 'もう一度呼んでも、消すものが無ければ何もしない');
select pg_temp.assert(
  (select count(*) from public.audit_logs) = (select n from logs_before),
  '何も消さなかったときは、操作履歴を増やさない');

rollback;
