-- =============================================================================
-- 運営者のアカウント（上野修さん）も、有料版で無料にする
-- =============================================================================
--
-- ご指示（2026-10-07）「osa603mu@yahoo.co.jp のアカウントは、有料版でも無料のまま
-- にする」。上野修さんのアカウント（管理画面では管理者、会員番号 1236）。
--
-- **所有者と同じ「運営者のアカウント」として扱う**（reason = 'owner'）。
--   アプリには「運営者のアカウントのため無料でお使いいただけます」、管理画面の
--   会員の一覧には「無料（運営者）」と出る。期限なし。試験提供を外しても無料。
--
-- **加えるのは無料だけ。** 所有者のアカウント（aprofessional0575@gmail.com）には、
--   ほかの管理者から削除・停止・降格されない保護もある
--   （20260830000001_protect_owner_account.sql）。こちらはご依頼に無いので加えない。
--
-- **順位からは外れる。** free_reason_of は「期限なく無料の方」を引くもので、
--   情報提供の順位（翌月無料）から外す判断にも使っている。運営者が上位を占めて
--   ドライバーの無料の枠を減らさないため、これでよい（利用規約 第14条第7項）。
--
-- メールアドレスは admin/src/lib/owner.ts の FREE_OPERATOR_EMAILS と同じ値
-- （変えるときは揃えて直すこと）。
-- =============================================================================

create or replace function public.free_reason_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when exists (
      select 1 from public.admin_profiles a
      where a.user_id = p_user and a.role = 'surveyor' and a.is_active
    ) then 'surveyor'
    when exists (
      select 1 from auth.users u
      where u.id = p_user
        and lower(u.email) in ('aprofessional0575@gmail.com', 'osa603mu@yahoo.co.jp')
    ) then 'owner'
    else null
  end;
$$;

revoke execute on function public.free_reason_of(uuid) from public, anon, authenticated;
