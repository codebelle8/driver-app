-- =============================================================================
-- ローカル検証専用 — Supabase 環境の最小スタブ
-- =============================================================================
-- 目的:
--   Supabase プロジェクトを用意しなくても、db/migrations/ の SQL を
--   一切改変せずにローカル PostgreSQL へ適用し、検証できるようにする。
--
-- Supabase 本番環境ではこれらは既に存在するため、
-- **このファイルは Supabase へ適用しないこと。**
-- =============================================================================

-- Supabase が用意しているロール
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- Supabase Auth のスキーマ
create schema if not exists auth;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

-- 本番の auth.uid() は JWT の sub クレームを返す。
-- ローカルでは request.jwt.claim.sub をセッション変数で差し替えてテストする。
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- 本番同様、public スキーマの利用権を各ロールへ付与する
grant usage on schema public to anon, authenticated, service_role;
