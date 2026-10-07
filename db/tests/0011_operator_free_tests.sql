-- =============================================================================
-- 運営者のアカウント（osa603mu@yahoo.co.jp）が無料になることを検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0011_operator_free_tests.sql
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

begin;

-- 有料の提供のときの姿で確かめる（試験提供のあいだは、だれでも無料のため）
update public.site_settings set trial_open = false where id = 1;

insert into auth.users (id, email) values
  ('fafa0000-0000-0000-0000-00000000000a', 'OSA603MU@yahoo.co.jp'),
  ('fafa0000-0000-0000-0000-00000000000b', 'someone-else@yahoo.co.jp');
insert into public.driver_profiles (user_id, trial_ends_at, status) values
  ('fafa0000-0000-0000-0000-00000000000a', now() - interval '3 days', 'trial'),
  ('fafa0000-0000-0000-0000-00000000000b', now() - interval '3 days', 'trial');

\set OPERATOR '''fafa0000-0000-0000-0000-00000000000a'''
\set OTHER '''fafa0000-0000-0000-0000-00000000000b'''

select pg_temp.assert(public.free_reason_of(:OPERATOR::uuid) = 'owner',
  '運営者のアカウントは、期限なく無料（大文字で登録されていても）');
select pg_temp.assert(public.free_reason_of(:OTHER::uuid) is null, 'ほかの方は対象外');

set local role authenticated;
set local request.jwt.claim.sub = :OPERATOR;
select pg_temp.assert(
  public.my_free_access() = '{"reason": "owner", "until": null}'::jsonb,
  '試験提供を外しても、運営者のアカウントは無料');
set local request.jwt.claim.sub = :OTHER;
select pg_temp.assert(public.my_free_access() is null, '試験提供を外すと、ほかの方は通常の会員');

reset role;
select pg_temp.assert(
  public.free_reason_of('00000000-0000-0000-0000-000000000000'::uuid) is null,
  '存在しない方は無料にならない');

rollback;
