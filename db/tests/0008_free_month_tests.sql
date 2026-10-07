-- =============================================================================
-- 毎月の締め（翌月無料）を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0008_free_month_tests.sql
--
-- 無料の判断は、会員のお金に関わる。数え方（上位・最低件数・月の区切り）、
-- 二重に締めないこと、お支払い済みの方の延長、会員が勝手に締められないことを見る。
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

-- 試験提供の期間（20261007000001）を外し、有料の提供のときの姿で確かめる。
-- 入れたままだと、すべての会員が「試験提供のため無料」になる。
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'site_settings'
               and column_name = 'trial_open') then
    execute 'update public.site_settings set trial_open = false where id = 1';
  end if;
end $$;

-- 設定: 上位2名・3件以上（検証のため小さくする）
update public.site_settings set free_top_count = 2, free_min_accepted = 3 where id = 1;

/*
  会員（2026年9月の採用件数）
    P: 5件（お支払い済み・期間は 2026-12-01 まで）→ 1位・無料・延長
    Q: 4件 → 2位・無料
    R: 4件（Q より後に届いた）→ 3位・人数の外
    S: 2件 → 最低件数に届かない
*/
insert into auth.users (id, email) values
  ('ffff0000-0000-0000-0000-00000000000a', 'free-p@example.com'),
  ('ffff0000-0000-0000-0000-00000000000b', 'free-q@example.com'),
  ('ffff0000-0000-0000-0000-00000000000c', 'free-r@example.com'),
  ('ffff0000-0000-0000-0000-00000000000d', 'free-s@example.com');

insert into public.driver_profiles (user_id, trial_ends_at, status, paid_until) values
  ('ffff0000-0000-0000-0000-00000000000a', '2026-09-01', 'active', '2026-12-01 00:00+09'),
  ('ffff0000-0000-0000-0000-00000000000b', '2026-09-01', 'trial', null),
  ('ffff0000-0000-0000-0000-00000000000c', '2026-09-01', 'trial', null),
  ('ffff0000-0000-0000-0000-00000000000d', '2026-09-01', 'trial', null);

\set P '''ffff0000-0000-0000-0000-00000000000a'''
\set Q '''ffff0000-0000-0000-0000-00000000000b'''
\set R '''ffff0000-0000-0000-0000-00000000000c'''
\set S '''ffff0000-0000-0000-0000-00000000000d'''

insert into public.submissions (user_id, kind, body, status, reviewed_at)
select :P::uuid, 'other', 'p', 'accepted', '2026-09-10 10:00+09'::timestamptz + (g || ' minutes')::interval
from generate_series(1, 5) g;
insert into public.submissions (user_id, kind, body, status, reviewed_at)
select :Q::uuid, 'other', 'q', 'accepted', '2026-09-11 10:00+09'::timestamptz + (g || ' minutes')::interval
from generate_series(1, 4) g;
insert into public.submissions (user_id, kind, body, status, reviewed_at)
select :R::uuid, 'other', 'r', 'accepted', '2026-09-20 10:00+09'::timestamptz + (g || ' minutes')::interval
from generate_series(1, 4) g;
insert into public.submissions (user_id, kind, body, status, reviewed_at)
select :S::uuid, 'other', 's', 'accepted', '2026-09-05 10:00+09'::timestamptz + (g || ' minutes')::interval
from generate_series(1, 2) g;
-- 10月1日 0時（日本時間）ちょうどの採用は、9月に数えない
insert into public.submissions (user_id, kind, body, status, reviewed_at)
values (:R::uuid, 'other', 'r-oct', 'accepted', '2026-10-01 00:00+09');

-- --- 締める（2026年10月3日 → 9月を締める） ---------------------------------------
select pg_temp.assert(
  (select public.settle_free_month_at('2026-10-03 12:00+09') = '{"month": "2026-09", "winners": 2}'::jsonb),
  '10月に入って最初に呼ぶと、9月を締める（無料は2名）');

select pg_temp.assert(
  (select array_agg(user_id order by rank) = array[:P::uuid, :Q::uuid] from public.free_grants where month = '2026-09'),
  '無料になるのは上位2名（P・Q）。同数の R は先に届いた Q の後');
select pg_temp.assert(
  (select free_from = '2026-10-01 00:00+09' and free_until = '2026-11-01 00:00+09'
     from public.free_grants where month = '2026-09' and user_id = :Q::uuid),
  '無料の期間は翌月の1か月（日本時間の10月1日から10月末まで）');
select pg_temp.assert(
  not exists (select 1 from public.free_grants where user_id = :S::uuid),
  '最低件数（3件）に届かない方は、上位でも無料にならない');
select pg_temp.assert(
  (select paid_until = '2027-01-01 00:00+09' from public.driver_profiles where user_id = :P::uuid)
  and (select extended_paid from public.free_grants where month = '2026-09' and user_id = :P::uuid),
  'お支払い済みの方は、ご利用期間を1か月延ばす（12月1日 → 1月1日）');
select pg_temp.assert(
  (select not extended_paid from public.free_grants where month = '2026-09' and user_id = :Q::uuid),
  'お支払いの無い方は、延ばさない（無料の月だけ）');
select pg_temp.assert(
  (select top_count = 2 and min_accepted = 3 and winners = 2 from public.free_months where month = '2026-09'),
  '締めたときの設定と人数を残す');

-- --- 二重に締めない ------------------------------------------------------------
select pg_temp.assert(public.settle_free_month_at('2026-10-20 12:00+09') is null, '同じ月は2回締めない');
select pg_temp.assert(
  (select paid_until = '2027-01-01 00:00+09' from public.driver_profiles where user_id = :P::uuid),
  '2回呼んでも、お支払いの期間は1回しか延びない');

-- 締めたあとで設定を変えても、締めた月の判断は変わらない
update public.site_settings set free_top_count = 10, free_min_accepted = 1 where id = 1;
select pg_temp.assert(
  (select count(*) from public.free_grants where month = '2026-09') = 2,
  '締めたあとで設定を変えても、その月の無料は変わらない');

-- --- 会員から見た、いまの無料 ------------------------------------------------------
reset role;
-- いまの時刻を無料の期間に入れる（free_from/free_until を、いまの前後へ）
update public.free_grants set free_from = now() - interval '1 day', free_until = now() + interval '1 day'
where month = '2026-09' and user_id = :Q::uuid;

set local role authenticated;
set local request.jwt.claim.sub = :Q;
select pg_temp.assert(
  (select (public.my_free_access())->>'reason' = 'top' and (public.my_free_access())->>'until' is not null),
  '上位で無料の期間にいる方は、無料（上位・終わりの日つき）');
select pg_temp.assert(
  (select count(*) from public.free_grants) = 1, '会員は自分の無料の記録だけを読める');
select pg_temp.assert(
  (select (public.submission_ranking('2026-09'))->'top'->1->>'free' = 'true'
          and (public.submission_ranking('2026-09'))->>'settled' = 'true'),
  '9月の順位に「無料になった」印が付き、締めたことが分かる');
select pg_temp.assert(
  (select (public.submission_ranking())->'me'->>'free_until' is not null),
  '本人の分に、無料の終わりが添えてある');

set local request.jwt.claim.sub = :S;
select pg_temp.assert(public.my_free_access() is null, '無料になっていない方は、通常の会員');

-- --- 会員は勝手に締められない ----------------------------------------------------
select pg_temp.assert_rejects($$select public.settle_free_month_at('2026-12-01')$$,
  '会員は好きな時刻で締められない（中身の関数は呼べない）');
select pg_temp.assert_rejects($$select * from public.ranking_rows('2026-09')$$,
  '会員は順位の元（ほかの方の id）を直接は引けない');
select pg_temp.assert_rejects(
  $$insert into public.free_grants (month, user_id, rank, accepted, free_from, free_until)
    values ('2026-09', 'ffff0000-0000-0000-0000-00000000000d', 1, 9, now(), now() + interval '1 month')$$,
  '会員は自分を無料にできない');
-- いまの時刻で締める（呼べることだけを見る。前の月は、検証用の DB では既に締めたか、未締めのどちらか）
select pg_temp.assert(true, '会員は「いまの時刻で前の月を締める」は呼べる（' ||
  coalesce((public.settle_free_month())::text, '既に締めてある') || '）');

set local role anon;
select pg_temp.assert_rejects($$select public.settle_free_month()$$, 'ログインしていない人は締められない');

rollback;
