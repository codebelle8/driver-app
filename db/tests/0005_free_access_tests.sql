-- =============================================================================
-- 無料でお使いいただける方（my_free_access）を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0005_free_access_tests.sql
--
-- 調査員だけが無料になること、止めた調査員は外れること、会員が自分で
-- 無料になれないことを見る。
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

insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000021', 'APrOfessional0575@gmail.com'),
  ('cccccccc-0000-0000-0000-000000000001', 'free-admin@example.com'),
  ('cccccccc-0000-0000-0000-000000000002', 'free-editor@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'free-surveyor@example.com'),
  ('cccccccc-0000-0000-0000-000000000004', 'free-surveyor-off@example.com'),
  ('cccccccc-0000-0000-0000-000000000011', 'free-driver@example.com');

insert into public.admin_profiles (user_id, display_name, role, is_active) values
  ('cccccccc-0000-0000-0000-000000000001', '管理者', 'admin', true),
  ('cccccccc-0000-0000-0000-000000000002', '編集者', 'editor', true),
  ('cccccccc-0000-0000-0000-000000000003', '調査員', 'surveyor', true),
  ('cccccccc-0000-0000-0000-000000000004', '止めた調査員', 'surveyor', false);

\set ADMIN        '''cccccccc-0000-0000-0000-000000000001'''
\set EDITOR       '''cccccccc-0000-0000-0000-000000000002'''
\set SURVEYOR     '''cccccccc-0000-0000-0000-000000000003'''
\set SURVEYOR_OFF '''cccccccc-0000-0000-0000-000000000004'''
\set DRIVER       '''cccccccc-0000-0000-0000-000000000011'''
\set OWNER        '''cccccccc-0000-0000-0000-000000000021'''

set local role authenticated;

set local request.jwt.claim.sub = :SURVEYOR;
select pg_temp.assert(
  public.my_free_access() = '{"reason": "surveyor", "until": null}'::jsonb,
  '調査員は無料（期限なし）');

set local request.jwt.claim.sub = :SURVEYOR_OFF;
select pg_temp.assert(public.my_free_access() is null, '止めた調査員は無料から外れる');

set local request.jwt.claim.sub = :DRIVER;
select pg_temp.assert(public.my_free_access() is null, '通常の会員は無料ではない');

set local request.jwt.claim.sub = :EDITOR;
select pg_temp.assert(public.my_free_access() is null, '編集者は対象外（ご依頼は調査員）');

set local request.jwt.claim.sub = :ADMIN;
select pg_temp.assert(public.my_free_access() is null, '管理者も対象外（ご依頼は調査員と所有者）');

-- 所有者（2026-10-05）。メールアドレスの大文字・小文字は問わない
set local request.jwt.claim.sub = :OWNER;
select pg_temp.assert(
  public.my_free_access() = '{"reason": "owner", "until": null}'::jsonb,
  '所有者は無料（期限なし）');

-- 会員が自分を調査員にして無料になることはできない
set local request.jwt.claim.sub = :DRIVER;
select pg_temp.assert_rejects(
  format($$insert into public.admin_profiles (user_id, display_name, role)
           values (%L, '自称調査員', 'surveyor')$$, 'cccccccc-0000-0000-0000-000000000011'),
  '会員は自分を調査員にできない');

set local role anon;
select pg_temp.assert_rejects(
  $$select public.my_free_access()$$,
  'ログインしていない人は尋ねられない');

rollback;
