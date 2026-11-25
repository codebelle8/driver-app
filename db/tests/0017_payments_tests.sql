-- =============================================================================
-- お支払いの記録・自動更新の状態・知らせの控え（20261126000001）を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0017_payments_tests.sql
--
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
  ('ba110000-0000-0000-0000-00000000000a', 'pay-trial@example.com'),
  ('ba110000-0000-0000-0000-00000000000b', 'pay-active@example.com'),
  ('ba110000-0000-0000-0000-00000000000c', 'pay-trial-past@example.com'),
  ('ba110000-0000-0000-0000-00000000000d', 'pay-blocked@example.com'),
  ('ba110000-0000-0000-0000-00000000000e', 'pay-sub@example.com'),
  ('ba110000-0000-0000-0000-00000000000f', 'pay-active-grace@example.com'),
  ('ba110000-0000-0000-0000-000000000010', 'pay-unlimited@example.com'),
  ('ba110000-0000-0000-0000-000000000011', 'pay-none@example.com'),
  ('ba110000-0000-0000-0000-000000000012', 'pay-month-end@example.com'),
  ('ba110000-0000-0000-0000-000000000099', 'pay-admin@example.com');
insert into public.driver_profiles (user_id, trial_ends_at, status, paid_until) values
  ('ba110000-0000-0000-0000-00000000000a', now() + interval '10 days',  'trial',   null),
  ('ba110000-0000-0000-0000-00000000000b', now() - interval '1 month',  'active',  now() + interval '20 days'),
  ('ba110000-0000-0000-0000-00000000000c', now() - interval '5 days',   'trial',   null),
  ('ba110000-0000-0000-0000-00000000000d', now() - interval '5 days',   'blocked', null),
  ('ba110000-0000-0000-0000-00000000000e', now() + interval '10 days',  'trial',   null),
  ('ba110000-0000-0000-0000-00000000000f', now() - interval '1 month',  'active',  now() + interval '3 days'),
  ('ba110000-0000-0000-0000-000000000010', now() - interval '1 month',  'active',  null),
  ('ba110000-0000-0000-0000-000000000011', now() + interval '10 days',  'trial',   null),
  ('ba110000-0000-0000-0000-000000000012', now() - interval '5 days',   'trial',   null);
insert into public.admin_profiles (user_id, display_name, role) values
  ('ba110000-0000-0000-0000-000000000099', '管理者', 'admin');

\set A '''ba110000-0000-0000-0000-00000000000a'''
\set B '''ba110000-0000-0000-0000-00000000000b'''
\set C '''ba110000-0000-0000-0000-00000000000c'''
\set D '''ba110000-0000-0000-0000-00000000000d'''
\set E '''ba110000-0000-0000-0000-00000000000e'''
\set F '''ba110000-0000-0000-0000-00000000000f'''
\set G '''ba110000-0000-0000-0000-000000000010'''
\set H '''ba110000-0000-0000-0000-000000000011'''
\set M '''ba110000-0000-0000-0000-000000000012'''
\set X '''ba110000-0000-0000-0000-000000000099'''

-- =============================================================================
-- 1. お支払いを記録して、期限を延ばす（サーバー = service_role）
-- =============================================================================
set local role service_role;

select pg_temp.assert(
  (select (p).period_from = now() + interval '10 days'
      and (p).period_until = ((now() + interval '10 days') at time zone 'Asia/Tokyo' + interval '1 month') at time zone 'Asia/Tokyo'
      and (p).member_no = (select member_no from public.driver_profiles where user_id = :A)
     from (select public.record_payment(:A, 'transfer', 'monthly', 600, 'transfer:test-a-1',
                                        now(), null, null, :X) as p) s),
  '銀行振込：無料期間の残り（10日）のあとから1か月（第5条2項）');
select pg_temp.assert(
  (select tax_rate = 10 and tax_amount = 54 and receipt_no > 0 and recorded_by = :X
     from public.payments where source_ref = 'transfer:test-a-1'),
  '600円に含まれる消費税は54円。領収書の番号が付き、確かめた職員が残る');
select pg_temp.assert(
  (select d.status = 'active' and d.paid_until = p.period_until
     from public.driver_profiles d join public.payments p on p.user_id = d.user_id
    where d.user_id = :A),
  '会員は「ご利用中」になり、使える期限は期間の終わり');

select pg_temp.assert(
  (select (public.record_payment(:A, 'transfer', 'monthly', 600, 'transfer:test-a-1',
                                 now(), null, null, :X)).receipt_no
          = (select receipt_no from public.payments where source_ref = 'transfer:test-a-1')),
  '同じ番号のお支払いがもう一度届くと、前の記録を返す');
select pg_temp.assert(
  (select count(*) = 1 from public.payments where user_id = :A)
  and (select d.paid_until = p.period_until
         from public.driver_profiles d join public.payments p on p.user_id = d.user_id
        where d.user_id = :A),
  '同じ番号が2回届いても、記録は1つで、期限も二重には延びない');

select public.record_payment(:B, 'card', 'yearly', 5000, 'in_test_b_1', now(),
                             now() + interval '20 days', now() + interval '20 days' + interval '12 months');
select pg_temp.assert(
  (select tax_amount = 454 and period_from = now() + interval '20 days'
     from public.payments where source_ref = 'in_test_b_1')
  and (select paid_until = now() + interval '20 days' + interval '12 months'
         from public.driver_profiles where user_id = :B),
  'カードの自動更新：Stripe の請求書の期間をそのまま使う。5,000円の消費税は454円');

select public.record_payment(:B, 'card', 'monthly', 600, 'in_test_b_old', now(),
                             now() - interval '10 days', now() + interval '20 days');
select pg_temp.assert(
  (select paid_until = now() + interval '20 days' + interval '12 months'
     from public.driver_profiles where user_id = :B),
  '期間の終わりがいまの期限より前の記録が届いても、期限は縮めない');

select public.record_payment(:C, 'paypay', 'monthly', 600, 'pi_test_c_1');
select pg_temp.assert(
  (select status = 'active'
      and paid_until = (now() at time zone 'Asia/Tokyo' + interval '1 month') at time zone 'Asia/Tokyo'
     from public.driver_profiles where user_id = :C),
  'PayPay：無料期間が過ぎていれば、払った時点から1か月');

select public.record_payment(:D, 'paypay', 'monthly', 600, 'pi_test_d_1');
select pg_temp.assert(
  (select status = 'blocked' and paid_until is not null from public.driver_profiles where user_id = :D)
  and exists (select 1 from public.payments where source_ref = 'pi_test_d_1'),
  '止めている方は止めたまま（受け取ったお金の記録と期限は入れる）');

select public.record_payment(:M, 'paypay', 'monthly', 600, 'pi_test_m_1', '2027-01-31 08:00+09');
select pg_temp.assert(
  (select period_until = '2027-02-28 08:00+09' from public.payments where source_ref = 'pi_test_m_1'),
  '月は日本時間の暦で数える（1月31日の朝8時 → 2月28日の朝8時。UTC で数えると3月1日になる）');

select pg_temp.assert_rejects(
  $$select public.record_payment('ba110000-0000-0000-0000-000000000011', 'transfer', 'monthly', 600, 'transfer:no-staff')$$,
  '銀行振込は、確かめた職員が無いと記録しない');
select pg_temp.assert_rejects(
  $$select public.record_payment('ba110000-0000-0000-0000-000000000011', 'card', 'quarterly', 1500, 'pi_q')$$,
  '取りやめた刻み（3か月）は記録しない');
select pg_temp.assert_rejects(
  $$select public.record_payment('ba110000-0000-0000-0000-000000000011', 'card', 'monthly', 600, 'in_half', now(), now(), null)$$,
  '期間は始まりと終わりの両方が要る');
select pg_temp.assert_rejects(
  $$select public.record_payment('ba110000-0000-0000-0000-0000000000ff', 'card', 'monthly', 600, 'pi_nobody')$$,
  '名簿にいない方のお支払いは記録しない');
select pg_temp.assert_rejects(
  $$select public.record_payment('ba110000-0000-0000-0000-000000000011', 'card', 'monthly', 600, '  ')$$,
  'お支払いの番号が空なら記録しない');
select pg_temp.assert_rejects(
  $$select public.record_payment('ba110000-0000-0000-0000-000000000011', 'card', 'monthly', 0, 'pi_zero')$$,
  '金額が0円なら記録しない');
select pg_temp.assert(
  (select paid_until is null and status = 'trial' from public.driver_profiles where user_id = :H),
  '記録しなかった方の期限と状態は、そのまま');

-- =============================================================================
-- 2. 自動更新の状態（サーバー = service_role）
-- =============================================================================
select public.sync_member_billing(:E, now(), 'cus_test_e', 'sub_test_e', 'monthly', 'trialing',
                                  now() + interval '10 days', false);
select pg_temp.assert(
  (select status = 'trialing' and current_period_end = now() + interval '10 days'
      and stripe_customer = 'cus_test_e' and not cancel_at_period_end
     from public.member_billing where user_id = :E),
  '無料期間中にカードで申し込むと「最初の決済を待っている」になる（第8条2項）');

select public.sync_member_billing(:E, now() + interval '10 days', null, 'sub_test_e', 'monthly', 'past_due',
                                  now() + interval '10 days', false);
select pg_temp.assert(
  (select status = 'past_due' and past_due_since = now() + interval '10 days'
     from public.member_billing where user_id = :E)
  and (select trial_ends_at = now() + interval '17 days' from public.driver_profiles where user_id = :E),
  '最初の決済ができなかったら、7日間待つ（無料期間の終わりを7日延ばす。第9条1項）');

select public.sync_member_billing(:E, now() + interval '5 days', null, 'sub_test_e', 'monthly', 'active',
                                  now() + interval '10 days', false);
select pg_temp.assert(
  (select status = 'past_due' from public.member_billing where user_id = :E),
  '古い知らせが後から届いても、状態を戻さない');

select public.sync_member_billing(:E, now() + interval '12 days', null, 'sub_test_e', 'monthly', 'past_due',
                                  now() + interval '10 days', false);
select pg_temp.assert(
  (select past_due_since = now() + interval '10 days' from public.member_billing where user_id = :E)
  and (select trial_ends_at = now() + interval '17 days' from public.driver_profiles where user_id = :E),
  '決済をやり直してまた失敗しても、7日の起点は動かない');

select public.record_payment(:E, 'card', 'monthly', 600, 'in_test_e_1', now() + interval '13 days',
                             now() + interval '10 days', now() + interval '10 days' + interval '1 month');
select public.sync_member_billing(:E, now() + interval '13 days', null, 'sub_test_e', 'monthly', 'active',
                                  now() + interval '10 days' + interval '1 month', false);
select pg_temp.assert(
  (select status = 'active' and past_due_since is null and stripe_customer = 'cus_test_e'
     from public.member_billing where user_id = :E)
  and (select status = 'active' and paid_until = now() + interval '10 days' + interval '1 month'
         from public.driver_profiles where user_id = :E),
  '待つあいだに決済できれば、期限は Stripe の期間どおり（遅れた日数ぶん延びたりしない）');

select public.sync_member_billing(:E, now() + interval '14 days', null, 'sub_test_e', 'monthly', 'active',
                                  now() + interval '10 days' + interval '1 month', true);
select pg_temp.assert(
  (select cancel_at_period_end from public.member_billing where user_id = :E),
  '自動更新を止めると「解約の予定」になる（第10条）');

select public.sync_member_billing(:F, now() + interval '3 days', 'cus_test_f', 'sub_test_f', 'monthly', 'past_due',
                                  now() + interval '3 days', false);
select pg_temp.assert(
  (select paid_until = now() + interval '10 days' from public.driver_profiles where user_id = :F),
  'お支払い済みの方の更新が決済できなかったら、使える期限を7日延ばす');

select public.sync_member_billing(:G, now(), 'cus_test_g', 'sub_test_g', 'monthly', 'past_due', now(), false);
select pg_temp.assert(
  (select paid_until is null from public.driver_profiles where user_id = :G),
  '期限なしの方には、決済できなくても期限を付けない');

select pg_temp.assert_rejects(
  $$select public.sync_member_billing('ba110000-0000-0000-0000-000000000011', now(), 'cus_h', 'sub_h', 'monthly', 'paused', now(), false)$$,
  '決めていない状態（paused）は入らない');
select pg_temp.assert_rejects(
  $$select public.sync_member_billing('ba110000-0000-0000-0000-0000000000ff', now(), 'cus_x', 'sub_x', 'monthly', 'active', now(), false)$$,
  '名簿にいない方の状態は作らない');
select pg_temp.assert_rejects(
  $$select public.sync_member_billing('ba110000-0000-0000-0000-000000000011', now(), 'cus_h', null, 'monthly', 'active', now(), false)$$,
  '自動更新の番号が無い知らせでは、状態を変えない');

insert into public.stripe_events (id, type, created, object_id)
values ('evt_test_1', 'invoice.paid', now(), 'in_test_e_1');
select pg_temp.assert_rejects(
  $$insert into public.stripe_events (id, type, created) values ('evt_test_1', 'invoice.paid', now())$$,
  '同じ知らせは2回控えられない（二度処理しない）');
select pg_temp.assert_rejects(
  $$insert into public.stripe_events (id, type, created) values ('test_2', 'invoice.paid', now())$$,
  '知らせの番号は Stripe の形（evt_…）だけ');

-- =============================================================================
-- 3. 会員にできること（authenticated）
-- =============================================================================
set local role authenticated;
set local request.jwt.claim.sub = :A;

select pg_temp.assert(
  (select count(*) = 1 from public.payments),
  '会員は自分のお支払いだけを読める');
select pg_temp.assert(
  (select amount = 600 and tax_amount = 54 and receipt_no > 0 from public.payments),
  '金額・消費税・領収書の番号は読める（マイページと領収書のため）');
select pg_temp.assert_rejects(
  'select source_ref from public.payments',
  'Stripe の番号は読めない');
select pg_temp.assert_rejects(
  'select recorded_by from public.payments',
  '確かめた職員は読めない');
select pg_temp.assert_rejects(
  $$select public.record_payment('ba110000-0000-0000-0000-00000000000a', 'card', 'yearly', 5000, 'pi_self')$$,
  '会員は自分で「払った」と記録できない');
select pg_temp.assert_rejects(
  $$insert into public.payments (user_id, member_no, method, plan, amount, period_from, period_until, source_ref)
    values ('ba110000-0000-0000-0000-00000000000a', 1, 'card', 'yearly', 5000, now(), now() + interval '1 year', 'pi_insert')$$,
  '会員はお支払いの記録を足せない');
select pg_temp.assert_rejects(
  'update public.payments set amount = 1',
  '会員はお支払いの記録を直せない');
select pg_temp.assert_rejects(
  'delete from public.payments',
  '会員はお支払いの記録を消せない');
select pg_temp.assert_rejects(
  $$select nextval('public.payment_receipt_no_seq')$$,
  '会員は領収書の番号を進められない');
select pg_temp.assert_rejects(
  $$select public.sync_member_billing('ba110000-0000-0000-0000-00000000000a', now(), 'cus_a', 'sub_a', 'yearly', 'active', now(), false)$$,
  '会員は自動更新の状態を書けない');
select pg_temp.assert_rejects(
  'select id from public.stripe_events',
  '会員は知らせの控えを読めない');

set local request.jwt.claim.sub = :E;
select pg_temp.assert(
  (select status = 'active' and cancel_at_period_end
     from public.member_billing),
  '会員は自分の自動更新の状態（次の更新日・解約の予定）を読める');
select pg_temp.assert_rejects(
  'select stripe_customer from public.member_billing',
  'Stripe の顧客の番号は読めない');
select pg_temp.assert_rejects(
  'update public.member_billing set cancel_at_period_end = false',
  '会員は自動更新の状態を直接は直せない（止めるのは Stripe を通す）');

set local request.jwt.claim.sub = :H;
select pg_temp.assert(
  (select count(*) = 0 from public.payments) and (select count(*) = 0 from public.member_billing),
  'ほかの方のお支払いと自動更新の状態は見えない');

set local request.jwt.claim.sub = :X;
select pg_temp.assert(
  (select count(*) = 7 from public.payments where user_id::text like 'ba110000-%')
  and (select count(*) = 3 from public.member_billing where user_id::text like 'ba110000-%'),
  '管理者は全員分を読める');
select pg_temp.assert_rejects(
  'select id from public.stripe_events',
  '管理者も知らせの控えは読めない（サーバーだけ）');

set local role anon;
select pg_temp.assert_rejects(
  'select id from public.payments',
  'ログインしていない相手には何も見せない');

-- =============================================================================
-- 4. 退会
-- =============================================================================
reset role;
delete from auth.users where id in (:A, :E);

select pg_temp.assert(
  (select user_id is null and member_no is not null and amount = 600
     from public.payments where source_ref = 'transfer:test-a-1'),
  '退会しても、お支払いの記録は残る（会員番号で突き合わせる。返金と保存のため）');
select pg_temp.assert(
  exists (select 1 from public.payments where source_ref = 'in_test_e_1')
  and not exists (select 1 from public.member_billing where user_id = :E),
  '退会すると、自動更新の状態は消える');

rollback;
