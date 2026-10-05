-- =============================================================================
-- 情報提供ランキング（submission_ranking）と匿名の設定を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0006_ranking_tests.sql
--
-- 順位は、毎月の上位の方を翌月無料にする段でも使う。数え方（採用だけ・
-- 月の区切り・同数の並び）と、ほかの方について何を返すか（名前・匿名）を見る。
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

-- 登場人物: 会員 A・B・C・D（止められた）、調査員 S、所有者 O
insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-00000000000a', 'rank-a@example.com'),
  ('dddddddd-0000-0000-0000-00000000000b', 'rank-b@example.com'),
  ('dddddddd-0000-0000-0000-00000000000c', 'rank-c@example.com'),
  ('dddddddd-0000-0000-0000-00000000000d', 'rank-d@example.com'),
  ('dddddddd-0000-0000-0000-000000000005', 'rank-s@example.com'),
  ('dddddddd-0000-0000-0000-000000000006', 'aprofessional0575@gmail.com');

insert into public.admin_profiles (user_id, display_name, role) values
  ('dddddddd-0000-0000-0000-000000000005', '調査員', 'surveyor');

insert into public.driver_profiles (user_id, trial_ends_at, status, display_name, rank_anonymous) values
  ('dddddddd-0000-0000-0000-00000000000a', now() + interval '1 month', 'trial', 'エー', false),
  ('dddddddd-0000-0000-0000-00000000000b', now() + interval '1 month', 'trial', 'ビー', true),
  ('dddddddd-0000-0000-0000-00000000000c', now() + interval '1 month', 'trial', 'シー', false),
  ('dddddddd-0000-0000-0000-00000000000d', now() + interval '1 month', 'blocked', 'ディー', false),
  ('dddddddd-0000-0000-0000-000000000005', now() + interval '1 month', 'trial', '調査員', false),
  ('dddddddd-0000-0000-0000-000000000006', now() + interval '1 month', 'trial', '所有者', false);

\set A '''dddddddd-0000-0000-0000-00000000000a'''
\set B '''dddddddd-0000-0000-0000-00000000000b'''
\set C '''dddddddd-0000-0000-0000-00000000000c'''

/*
  採用の記録（日本時間の 2026年10月）。
    A: 採用2件（最後の採用 10/10）＋ 不採用1件 ＋ 審査待ち1件
    B: 採用2件（最後の採用 10/05） … A と同数。先に届いたので B が上
    C: 採用1件 ＋ 9月30日 23:30（日本時間）の採用1件 … 10月は1件
    D: 採用5件だが止められている → 順位から外す
    S: 調査員・採用3件 → 外す   O: 所有者・採用4件 → 外す
*/
insert into public.submissions (user_id, kind, body, status, reviewed_at, created_at) values
  (:A::uuid, 'other', 'a1', 'accepted', '2026-10-03 10:00+09', '2026-10-02 10:00+09'),
  (:A::uuid, 'other', 'a2', 'accepted', '2026-10-10 10:00+09', '2026-10-09 10:00+09'),
  (:A::uuid, 'other', 'a3', 'rejected', '2026-10-11 10:00+09', '2026-10-10 10:00+09'),
  (:A::uuid, 'other', 'a4', 'pending', null, '2026-10-12 10:00+09'),
  (:B::uuid, 'other', 'b1', 'accepted', '2026-10-02 10:00+09', '2026-10-01 10:00+09'),
  (:B::uuid, 'other', 'b2', 'accepted', '2026-10-05 10:00+09', '2026-10-04 10:00+09'),
  (:C::uuid, 'other', 'c1', 'accepted', '2026-10-20 10:00+09', '2026-10-19 10:00+09'),
  (:C::uuid, 'other', 'c0', 'accepted', '2026-09-30 23:30+09', '2026-09-30 22:00+09'),
  ('dddddddd-0000-0000-0000-00000000000d', 'other', 'd', 'accepted', '2026-10-02 10:00+09', '2026-10-01 10:00+09'),
  ('dddddddd-0000-0000-0000-00000000000d', 'other', 'd', 'accepted', '2026-10-02 11:00+09', '2026-10-01 10:00+09'),
  ('dddddddd-0000-0000-0000-00000000000d', 'other', 'd', 'accepted', '2026-10-02 12:00+09', '2026-10-01 10:00+09'),
  ('dddddddd-0000-0000-0000-00000000000d', 'other', 'd', 'accepted', '2026-10-02 13:00+09', '2026-10-01 10:00+09'),
  ('dddddddd-0000-0000-0000-00000000000d', 'other', 'd', 'accepted', '2026-10-02 14:00+09', '2026-10-01 10:00+09'),
  ('dddddddd-0000-0000-0000-000000000005', 'other', 's', 'accepted', '2026-10-02 10:00+09', '2026-10-01 10:00+09'),
  ('dddddddd-0000-0000-0000-000000000005', 'other', 's', 'accepted', '2026-10-02 11:00+09', '2026-10-01 10:00+09'),
  ('dddddddd-0000-0000-0000-000000000005', 'other', 's', 'accepted', '2026-10-02 12:00+09', '2026-10-01 10:00+09'),
  ('dddddddd-0000-0000-0000-000000000006', 'other', 'o', 'accepted', '2026-10-02 10:00+09', '2026-10-01 10:00+09'),
  ('dddddddd-0000-0000-0000-000000000006', 'other', 'o', 'accepted', '2026-10-02 11:00+09', '2026-10-01 10:00+09'),
  ('dddddddd-0000-0000-0000-000000000006', 'other', 'o', 'accepted', '2026-10-02 12:00+09', '2026-10-01 10:00+09'),
  ('dddddddd-0000-0000-0000-000000000006', 'other', 'o', 'accepted', '2026-10-02 13:00+09', '2026-10-01 10:00+09');

set local role authenticated;
set local request.jwt.claim.sub = :A;

create temp table r as select public.submission_ranking('2026-10') as j;
grant select on r to authenticated;

select pg_temp.assert((select jsonb_array_length(j->'top') from r) = 3,
  '順位に入るのは A・B・C の3名（止められた会員・調査員・所有者は外す）');
select pg_temp.assert((select j->'top'->0->>'rank' = '1' and j->'top'->0->>'accepted' = '2'
                         and j->'top'->0->>'name' is null from r),
  '1位は B（A と同数だが先に届いた）。匿名なので名前は出さない');
select pg_temp.assert((select j->'top'->1->>'name' = 'エー' and (j->'top'->1->>'me')::boolean from r),
  '2位は A。表示名が出て、本人の行と分かる');
select pg_temp.assert((select j->'top'->2->>'name' = 'シー' and j->'top'->2->>'accepted' = '1' from r),
  '3位は C。9月30日（日本時間）の採用は10月に数えない');
select pg_temp.assert((select j->'me'->>'rank' = '2' and j->'me'->>'accepted' = '2' and j->'me'->>'sent' = '4' from r),
  '本人の分: 2位・採用2件・送った4件（不採用・審査待ちも含む）');
select pg_temp.assert((select j->>'participants' = '3' from r), '順位に入った人数');
select pg_temp.assert(
  (select position('rank-' in j::text) = 0 and position('member_no' in j::text) = 0 from r),
  'ほかの方のメールアドレスや会員番号は返さない');

select pg_temp.assert(
  (select (public.submission_ranking('2026-09'))->'top'->0->>'name' = 'シー'),
  '9月の順位も引ける（月を指定）');

set local request.jwt.claim.sub = :B;
select pg_temp.assert(
  (select (public.submission_ranking('2026-10'))->'me'->>'sent' = '2'),
  '送った件数は、それぞれ本人の分だけ');

set local request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000005';
select pg_temp.assert(
  (select (public.submission_ranking('2026-10'))->'me'->>'excluded' = 'surveyor'
          and (public.submission_ranking('2026-10'))->'me'->>'rank' is null),
  '調査員は順位から外れていることが本人に分かる');

-- 匿名の設定は本人だけが変えられる
set local request.jwt.claim.sub = :A;
update public.driver_profiles set rank_anonymous = true where user_id = :A::uuid;
update public.driver_profiles set rank_anonymous = true where user_id = :C::uuid;
reset role;
select pg_temp.assert(
  (select rank_anonymous from public.driver_profiles where user_id = :A::uuid),
  '自分を匿名にできる');
select pg_temp.assert(
  (select not rank_anonymous from public.driver_profiles where user_id = :C::uuid),
  'ほかの方を匿名に変えることはできない');

set local role authenticated;
set local request.jwt.claim.sub = :C;
select pg_temp.assert(
  (select (public.submission_ranking('2026-10'))->'top'->1->>'name' is null),
  '匿名にした A の名前は、ほかの方から見えない');

select pg_temp.assert_rejects($$select public.submission_ranking('2026-13')$$, '月の書き方が違えば断る');
select pg_temp.assert_rejects($$select public.free_reason_of('dddddddd-0000-0000-0000-000000000005')$$,
  '会員は、ほかの方が調査員かどうかを直接は引けない');

set local role anon;
select pg_temp.assert_rejects($$select public.submission_ranking()$$, 'ログインしていない人は見られない');

rollback;
