-- =============================================================================
-- チャットの「書いた人の目印」（オンライン状態の表示に使う）を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0009_chat_presence_tests.sql
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
  ('abab0000-0000-0000-0000-00000000000a', 'presence-a@example.com'),
  ('abab0000-0000-0000-0000-00000000000b', 'presence-b@example.com');
insert into public.driver_profiles (user_id, trial_ends_at, display_name) values
  ('abab0000-0000-0000-0000-00000000000a', now() + interval '1 month', 'エー'),
  ('abab0000-0000-0000-0000-00000000000b', now() + interval '1 month', 'ビー');

\set A '''abab0000-0000-0000-0000-00000000000a'''
\set B '''abab0000-0000-0000-0000-00000000000b'''

insert into public.chat_messages (user_id, body) values
  (:A::uuid, 'エーの書き込み 1'),
  (:A::uuid, 'エーの書き込み 2'),
  (:B::uuid, 'ビーの書き込み');

set local role authenticated;
set local request.jwt.claim.sub = :A;
create temp table f as select public.chat_feed() as j;
grant select on f to authenticated;

select pg_temp.assert(
  (select count(distinct m->>'author') = 2 from f, jsonb_array_elements(j->'messages') m),
  '書いた方ごとに目印が付く（同じ方なら同じ目印、2名なら2種類）');
select pg_temp.assert(
  (select bool_and((m->>'author') = (f.j->'me'->>'key')) from f, jsonb_array_elements(j->'messages') m
    where (m->>'mine')::boolean),
  '自分の書き込みの目印と、自分の目印（me.key）が一致する');
select pg_temp.assert(
  (select position('abab0000' in j::text) = 0 from f),
  '会員の id そのものは返さない');

set local request.jwt.claim.sub = :B;
select pg_temp.assert(
  (select (public.chat_feed())->'me'->>'key') <> (select j->'me'->>'key' from f),
  'ほかの方とは目印が違う');

select pg_temp.assert_rejects(
  format($$select public.chat_key(%L)$$, 'abab0000-0000-0000-0000-00000000000a'),
  '会員は、id から目印を作る関数を直接は呼べない');

rollback;
