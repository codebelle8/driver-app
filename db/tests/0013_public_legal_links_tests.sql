-- =============================================================================
-- 規約類の掲載先（ログイン前でも読める）と、気をつける言葉（会員に見せない）を検証する
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0013_public_legal_links_tests.sql
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

update public.site_settings
   set terms_url = 'https://example.com/terms', privacy_url = 'https://example.com/privacy'
 where id = 1;

insert into auth.users (id, email) values ('d0d00000-0000-0000-0000-00000000000a', 'links-member@example.com');
insert into public.driver_profiles (user_id, trial_ends_at) values
  ('d0d00000-0000-0000-0000-00000000000a', now() + interval '1 month');

-- ---- ログイン前 --------------------------------------------------------------
set local role anon;
select pg_temp.assert(
  (select terms_url = 'https://example.com/terms' and privacy_url = 'https://example.com/privacy'
     from public.site_settings where id = 1),
  'ログインする前でも、規約とプライバシーポリシーの掲載先を読める');
select pg_temp.assert_rejects($$select chat_flag_words from public.site_settings$$,
  'ログインする前は、気をつける言葉を読めない');
select pg_temp.assert_rejects($$select trial_open from public.site_settings$$,
  'ログインする前は、掲示のため以外の設定を読めない');
select pg_temp.assert_rejects($$update public.site_settings set terms_url = 'https://evil.example' where id = 1$$,
  'ログインする前は、掲載先を書き換えられない');

-- ---- 会員 --------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd0d00000-0000-0000-0000-00000000000a';
select pg_temp.assert(
  (select terms_url is not null and offline_grace_days > 0 from public.site_settings where id = 1),
  '会員は、掲載先と、アプリが使う設定（圏外の日数など）を読める');
select pg_temp.assert_rejects($$select chat_flag_words from public.site_settings$$,
  '会員は、気をつける言葉を読めない');

rollback;
