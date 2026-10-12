-- =============================================================================
-- 試験提供を終えるとき、無料期間を過ぎている方に1か月（第4条第7項）を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0014_trial_end_grant_tests.sql
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

/* 手元の検証用データベースに元からいる会員は、検査に混ぜない（無料期間を先へ） */
update public.driver_profiles set trial_ends_at = now() + interval '1 year';

insert into auth.users (id, email) values
  ('e0e00000-0000-0000-0000-00000000000a', 'end-past@example.com'),
  ('e0e00000-0000-0000-0000-00000000000b', 'end-within@example.com'),
  ('e0e00000-0000-0000-0000-00000000000c', 'end-blocked@example.com'),
  ('e0e00000-0000-0000-0000-00000000000d', 'end-active@example.com'),
  ('e0e00000-0000-0000-0000-00000000000e', 'end-surveyor@example.com');
insert into public.driver_profiles (user_id, trial_ends_at, status, paid_until) values
  ('e0e00000-0000-0000-0000-00000000000a', now() - interval '20 days', 'trial', null),
  ('e0e00000-0000-0000-0000-00000000000b', now() + interval '10 days', 'trial', null),
  ('e0e00000-0000-0000-0000-00000000000c', now() - interval '20 days', 'blocked', null),
  ('e0e00000-0000-0000-0000-00000000000d', now() - interval '20 days', 'active', now() + interval '2 months'),
  ('e0e00000-0000-0000-0000-00000000000e', now() - interval '20 days', 'trial', null);
insert into public.admin_profiles (user_id, display_name, role) values
  ('e0e00000-0000-0000-0000-00000000000e', '調査員', 'surveyor');

update public.site_settings set trial_open = true where id = 1;
create temp table before_end as
  select user_id, trial_ends_at, status from public.driver_profiles
  where user_id::text like 'e0e00000-%';

-- ---- 試験提供を外す ----------------------------------------------------------
update public.site_settings set trial_open = false where id = 1;

select pg_temp.assert(
  (select trial_ends_at = now() + interval '1 month' and status = 'trial'
     from public.driver_profiles where user_id = 'e0e00000-0000-0000-0000-00000000000a'),
  '無料期間を過ぎている方は、外した時点から1か月の無料期間になる');
select pg_temp.assert(
  (select p.trial_ends_at = b.trial_ends_at from public.driver_profiles p join before_end b using (user_id)
    where user_id = 'e0e00000-0000-0000-0000-00000000000b'),
  '無料期間の途中の方は、残りの日数のまま');
select pg_temp.assert(
  (select p.trial_ends_at = b.trial_ends_at and p.status = 'blocked'
     from public.driver_profiles p join before_end b using (user_id)
    where user_id = 'e0e00000-0000-0000-0000-00000000000c'),
  '止めている方は対象外（止めたまま）');
select pg_temp.assert(
  (select p.trial_ends_at = b.trial_ends_at and p.status = 'active'
     from public.driver_profiles p join before_end b using (user_id)
    where user_id = 'e0e00000-0000-0000-0000-00000000000d'),
  'お支払い済みの方は対象外');
select pg_temp.assert(
  (select p.trial_ends_at = b.trial_ends_at from public.driver_profiles p join before_end b using (user_id)
    where user_id = 'e0e00000-0000-0000-0000-00000000000e'),
  '期限なく無料の方（調査員）は対象外');
select pg_temp.assert(
  (select (diff->'trial_end_grant'->>'members')::int = 1
     from public.audit_logs where table_name = 'site_settings' order by id desc limit 1),
  '何名に付けたかを操作履歴に残す');

-- ---- 入れ直して、また外す ----------------------------------------------------
update public.site_settings set trial_open = true where id = 1;
update public.site_settings set trial_open = false where id = 1;
select pg_temp.assert(
  (select trial_ends_at = now() + interval '1 month'
     from public.driver_profiles where user_id = 'e0e00000-0000-0000-0000-00000000000a'),
  '入れ直して外しても、二度は付かない（その時点で無料期間の途中のため）');

-- ---- 外したまま、ほかの項目を保存しても何も起きない ---------------------------
update public.driver_profiles set trial_ends_at = now() - interval '5 days'
 where user_id = 'e0e00000-0000-0000-0000-00000000000a';
update public.site_settings set trial_open = false, offline_grace_days = 30 where id = 1;
select pg_temp.assert(
  (select trial_ends_at = now() - interval '5 days'
     from public.driver_profiles where user_id = 'e0e00000-0000-0000-0000-00000000000a'),
  '外したままの保存では、付かない（入から外に変わったときだけ）');

rollback;
