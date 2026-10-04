-- =============================================================================
-- 無料でお使いいただける方（調査員）
-- =============================================================================
--
-- ご依頼（2026-10-05）。有料化のあとも、調査員の方は無料でお使いいただく
-- （発注元のご回答 2026-10-04「調査員20名…調査員同様に無料で」）。
--
-- **管理画面で「調査員」として登録されている方を、そのまま無料にする。**
--   アプリと管理画面は同じログインを使っているため、調査員はご自身の
--   アカウントでアプリにも入れる。無料の対象を別に登録しないので、
--   調査員を止めれば（is_active = false）無料も自動で外れる。人数が
--   増えても減っても、このまま使える。
--
-- **アプリはこの関数で尋ねる。** 結果は端末の控えにも入るため、圏外でも
-- 同じように効く。
--
--   戻り値  { "reason": "surveyor", "until": null }  … 無料（期限なし）
--           null                                     … 通常の会員
--
--   until は、毎月の上位の方を翌月無料にする段（次の段）で使う。
--   いまは常に null（期限なし）。形を先に決めておき、アプリを作り直さずに
--   済むようにしている。
-- =============================================================================

create or replace function public.my_free_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_surveyor() then jsonb_build_object('reason', 'surveyor', 'until', null)
    else null
  end;
$$;

comment on function public.my_free_access() is
  '自分が無料でお使いいただける方か。調査員（有効）なら {reason:surveyor, until:null}。それ以外は null。';

revoke execute on function public.my_free_access() from public, anon;
grant execute on function public.my_free_access() to authenticated;

notify pgrst, 'reload schema';
