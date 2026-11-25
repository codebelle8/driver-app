-- =============================================================================
-- 有料の期間の始まり（20261126000002）を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0018_paid_start_tests.sql
--
-- 見るのは、上位の方の無料の月が、有料の期間と重ならないこと（利用規約 第6条第5項）。
-- 1つの取引の中では now() が変わらないため、期限を「now() + ◯日」で突き合わせられる。
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function pg_temp.assert(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAILED: %', label; end if;
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
  ('ba120000-0000-0000-0000-00000000000a', 'start-top-trial@example.com'),
  ('ba120000-0000-0000-0000-00000000000b', 'start-top-lapsed@example.com'),
  ('ba120000-0000-0000-0000-00000000000c', 'start-top-old@example.com'),
  ('ba120000-0000-0000-0000-00000000000d', 'start-top-paid@example.com'),
  ('ba120000-0000-0000-0000-00000000000e', 'start-top-in-trial@example.com'),
  ('ba120000-0000-0000-0000-000000000099', 'start-admin@example.com');
insert into public.driver_profiles (user_id, trial_ends_at, status, paid_until) values
  /* 無料期間を過ぎて、上位の無料の月にいる */
  ('ba120000-0000-0000-0000-00000000000a', now() - interval '5 days',  'trial',  null),
  /* お支払いの期間が切れて、上位の無料の月にいる */
  ('ba120000-0000-0000-0000-00000000000b', now() - interval '2 months', 'active', now() - interval '2 days'),
  /* 上位の無料の月は、もう終わっている */
  ('ba120000-0000-0000-0000-00000000000c', now() - interval '5 days',  'trial',  null),
  /* お支払い済み（締めのときに1か月延びている） */
  ('ba120000-0000-0000-0000-00000000000d', now() - interval '2 months', 'active', now() + interval '40 days'),
  /* 無料期間のほうが、上位の無料の月より長い */
  ('ba120000-0000-0000-0000-00000000000e', now() + interval '25 days', 'trial',  null);
insert into public.admin_profiles (user_id, display_name, role) values
  ('ba120000-0000-0000-0000-000000000099', '管理者', 'admin');

insert into public.free_months (month, top_count, min_accepted) values ('2000-01', 20, 3), ('2000-02', 20, 3);
insert into public.free_grants (month, user_id, rank, accepted, free_from, free_until) values
  ('2000-02', 'ba120000-0000-0000-0000-00000000000a', 1, 9, now() - interval '3 days',  now() + interval '20 days'),
  ('2000-02', 'ba120000-0000-0000-0000-00000000000b', 2, 8, now() - interval '3 days',  now() + interval '20 days'),
  ('2000-01', 'ba120000-0000-0000-0000-00000000000c', 3, 7, now() - interval '40 days', now() - interval '10 days'),
  ('2000-02', 'ba120000-0000-0000-0000-00000000000d', 4, 6, now() - interval '3 days',  now() + interval '20 days'),
  ('2000-02', 'ba120000-0000-0000-0000-00000000000e', 5, 5, now() - interval '3 days',  now() + interval '20 days');

\set A '''ba120000-0000-0000-0000-00000000000a'''
\set B '''ba120000-0000-0000-0000-00000000000b'''
\set C '''ba120000-0000-0000-0000-00000000000c'''
\set D '''ba120000-0000-0000-0000-00000000000d'''
\set E '''ba120000-0000-0000-0000-00000000000e'''
\set X '''ba120000-0000-0000-0000-000000000099'''

-- =============================================================================
-- 1. 始まり（サーバー = service_role）
-- =============================================================================
set local role service_role;

select pg_temp.assert(
  public.paid_period_start(:A) = now() + interval '20 days',
  '無料期間を過ぎた方：上位の無料の月の終わりから');
select pg_temp.assert(
  public.paid_period_start(:B) = now() + interval '20 days',
  'お支払いの期間が切れた方：上位の無料の月の終わりから');
select pg_temp.assert(
  public.paid_period_start(:C) = now(),
  '終わった無料の月は数えない（いまから）');
select pg_temp.assert(
  public.paid_period_start(:D) = now() + interval '40 days',
  'お支払い済みの方：延びた期間の終わりから（無料の月より遅い）');
select pg_temp.assert(
  public.paid_period_start(:E) = now() + interval '25 days',
  '無料期間のほうが長い方：無料期間の終わりから');
select pg_temp.assert(
  public.paid_period_start('ba120000-0000-0000-0000-0000000000ff') is null,
  '会員が見つからなければ空');

-- =============================================================================
-- 2. お支払いの記録も、同じ始まりを使う
-- =============================================================================
select pg_temp.assert(
  (select (p).period_from = now() + interval '20 days'
      and (p).period_until = ((now() + interval '20 days') at time zone 'Asia/Tokyo' + interval '1 month') at time zone 'Asia/Tokyo'
     from (select public.record_payment(:A, 'paypay', 'monthly', 600, 'pi_test_start_a') as p) s),
  'PayPay：上位の無料の月のあとから1か月（無料の日数ぶん払わせない）');
select pg_temp.assert(
  (select paid_until = ((now() + interval '20 days') at time zone 'Asia/Tokyo' + interval '1 month') at time zone 'Asia/Tokyo'
          and status = 'active'
     from public.driver_profiles where user_id = :A),
  '期限も、無料の月のあとから1か月');
select pg_temp.assert(
  (select (p).period_from = now() + interval '20 days'
     from (select public.record_payment(:B, 'transfer', 'yearly', 5000, 'transfer:test-start-b',
                                        now(), null, null, :X) as p) s),
  '銀行振込：同じく、無料の月のあとから');
select pg_temp.assert(
  (select (p).period_from = now()
     from (select public.record_payment(:C, 'paypay', 'monthly', 600, 'pi_test_start_c') as p) s),
  '終わった無料の月があっても、いまから');
select pg_temp.assert(
  (select (p).period_from = now() + interval '1 day' and (p).period_until = now() + interval '1 month 1 day'
     from (select public.record_payment(:E, 'card', 'monthly', 600, 'in_test_start_e',
                                        now(), now() + interval '1 day', now() + interval '1 month 1 day') as p) s),
  'Stripe の期間を渡したときは、これまでどおりそのまま使う');

-- =============================================================================
-- 3. 会員・ログインしていない相手は呼べない
-- =============================================================================
reset role;
set local role authenticated;
set local request.jwt.claim.sub = :A;
select pg_temp.assert_rejects(
  format('select public.paid_period_start(%L)', :A),
  '会員は始まりを尋ねられない（サーバーだけ）');

set local role anon;
select pg_temp.assert_rejects(
  format('select public.paid_period_start(%L)', :A),
  'ログインしていない相手も呼べない');

rollback;
