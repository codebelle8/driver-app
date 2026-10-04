-- =============================================================================
-- 所有者のアカウントも、アプリを無料で使える
-- =============================================================================
--
-- ご指示（2026-10-05「このメールアドレスは私のもの。有料版でも無料で
-- 使えるようにしてほしい」）。
--
-- **所有者は、管理画面の所有者と同じアカウント**
--   aprofessional0575@gmail.com。他の管理者から削除・停止・降格されない
--   よう、20260830000001_protect_owner_account.sql で固定している。
--   ここでも同じ値で見分ける（**変えるときは両方を直すこと**）。
--   管理画面の側は admin/src/lib/owner.ts。
--
-- **会員の情報は書き換えない**
--   その方の行（driver_profiles）に印を付ける形にはしていない。本番の
--   アカウントには触れない約束のため、データベースの判定だけで無料にする。
--
-- **ほかの管理者・編集者は、これまでどおり対象外**（ご依頼は調査員と所有者）。
--
--   戻り値  { "reason": "surveyor", "until": null }  … 調査員
--           { "reason": "owner",    "until": null }  … 所有者
--           null                                     … 通常の会員
-- =============================================================================

create or replace function public.my_free_access()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when public.is_surveyor() then jsonb_build_object('reason', 'surveyor', 'until', null)
    when exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and lower(u.email) = 'aprofessional0575@gmail.com'
    ) then jsonb_build_object('reason', 'owner', 'until', null)
    else null
  end;
$$;

comment on function public.my_free_access() is
  '自分が無料でお使いいただける方か。調査員（有効）なら surveyor、所有者なら owner（いずれも期限なし）。それ以外は null。';

revoke execute on function public.my_free_access() from public, anon;
grant execute on function public.my_free_access() to authenticated;

notify pgrst, 'reload schema';
