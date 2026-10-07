-- =============================================================================
-- 試験提供の期間（trial_open）を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0010_trial_open_tests.sql
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
  ('dede0000-0000-0000-0000-00000000000a', 'trial-ended@example.com'),
  ('dede0000-0000-0000-0000-00000000000b', 'trial-blocked@example.com'),
  ('dede0000-0000-0000-0000-00000000000c', 'trial-surveyor@example.com'),
  ('dede0000-0000-0000-0000-00000000000d', 'trial-admin@example.com'),
  ('dede0000-0000-0000-0000-00000000000e', 'trial-within@example.com');
insert into public.driver_profiles (user_id, trial_ends_at, status) values
  /* 無料期間（1か月）が過ぎた方 */
  ('dede0000-0000-0000-0000-00000000000a', now() - interval '3 days', 'trial'),
  ('dede0000-0000-0000-0000-00000000000b', now() - interval '3 days', 'blocked'),
  ('dede0000-0000-0000-0000-00000000000c', now() - interval '3 days', 'trial'),
  /* 無料期間の途中の方 */
  ('dede0000-0000-0000-0000-00000000000e', now() + interval '10 days', 'trial');
insert into public.admin_profiles (user_id, display_name, role) values
  ('dede0000-0000-0000-0000-00000000000c', '調査員', 'surveyor'),
  ('dede0000-0000-0000-0000-00000000000d', '管理者', 'admin');

\set ENDED '''dede0000-0000-0000-0000-00000000000a'''
\set BLOCKED '''dede0000-0000-0000-0000-00000000000b'''
\set SURVEYOR '''dede0000-0000-0000-0000-00000000000c'''
\set ADMIN '''dede0000-0000-0000-0000-00000000000d'''
\set WITHIN '''dede0000-0000-0000-0000-00000000000e'''

select pg_temp.assert(
  (select trial_open from public.site_settings where id = 1),
  '入れた時点では、試験提供の期間中（既定で入っている）');

set local role authenticated;

set local request.jwt.claim.sub = :ENDED;
select pg_temp.assert(
  public.my_free_access() = '{"reason": "trial", "until": null}'::jsonb,
  '無料期間が過ぎた方も、試験提供のあいだは無料');

set local request.jwt.claim.sub = :WITHIN;
select pg_temp.assert(
  public.my_free_access() = '{"reason": "trial", "until": null}'::jsonb,
  '無料期間の途中の方にも返す（画面の出し分けはアプリ。開いたまま期限を迎えても絞らない）');

set local request.jwt.claim.sub = :BLOCKED;
select pg_temp.assert(public.my_free_access() is null, '止めた方は、試験提供のあいだも無料にしない');

set local request.jwt.claim.sub = :SURVEYOR;
select pg_temp.assert(
  public.my_free_access() = '{"reason": "surveyor", "until": null}'::jsonb,
  '調査員は調査員のまま（期限なしの無料が先）');

/* 会員は、試験提供の切り替えに触れない */
set local request.jwt.claim.sub = :ENDED;
update public.site_settings set trial_open = false where id = 1;
reset role;
select pg_temp.assert(
  (select trial_open from public.site_settings where id = 1),
  '会員は試験提供を外せない（変わらない）');

/* 管理者は外せる */
set local role authenticated;
set local request.jwt.claim.sub = :ADMIN;
update public.site_settings set trial_open = false where id = 1;
reset role;
select pg_temp.assert(
  not (select trial_open from public.site_settings where id = 1),
  '管理者は試験提供を外せる');

/* 外したあと（有料の提供） */
set local role authenticated;
set local request.jwt.claim.sub = :ENDED;
select pg_temp.assert(public.my_free_access() is null, '試験提供を外すと、無料期間が過ぎた方は通常の会員に戻る');

set local request.jwt.claim.sub = :SURVEYOR;
select pg_temp.assert(
  public.my_free_access() = '{"reason": "surveyor", "until": null}'::jsonb,
  '外しても、調査員は無料のまま');

reset role;
select pg_temp.assert(
  public.free_reason_of(:ENDED::uuid) is null,
  '期限なしの無料の判断（順位から外す基準）には、試験提供を混ぜない');

rollback;
