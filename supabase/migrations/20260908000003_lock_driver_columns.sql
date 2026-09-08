-- =============================================================================
-- 会員が自分の無料期間を書き換えられる状態を塞ぐ
-- =============================================================================
--
-- 何が起きていたか:
--   20260908000001 で、こう書いていた。
--
--     grant select on public.driver_profiles to authenticated;
--     grant update (display_name) on public.driver_profiles to authenticated;
--
--   意図は「読めるのは自分の行、直せるのは表示名だけ」。
--   実際には**何も絞れていなかった。**
--
--   Supabase は public スキーマの新しい表へ、既定ですべての権限を
--   authenticated へ渡している（alter default privileges）。表を作った
--   時点で全列の update を持っており、そこへ狭い grant を足しても
--   権限は増えるだけで、減らない。
--
--   結果として、ログインした会員が自分の行に対して
--
--     PATCH /rest/v1/driver_profiles?user_id=eq.<自分>
--     { "trial_ends_at": "2099-01-01", "status": "active" }
--
--   を通せた。RLS は「自分の行」を通すため止まらない。
--   **会員が誰でも、無期限に無料で使える状態だった。**
--
--   本番で再現を確認している（tools/check-account-guard.mjs）。
--   会員は1人もおらず、新規登録も閉じていたため、実害は出ていない。
--
-- なぜ気づけなかったか:
--   RLS は「どの行か」しか絞れず、「どの列か」は列ごとの GRANT で絞る。
--   その GRANT は**足すだけでは効かない。先に剥がす必要がある。**
--   足し忘れではなく逆向きの間違いで、SQL を読んでも気づけない。
--   外から突いて確かめる検査を足した（同ファイル 5・6 番）。
--
-- 直し方:
--   いったん全部剥がしてから、要るものだけを渡し直す。
--   revoke は既定の権限にも効く。
-- =============================================================================

revoke all on public.driver_profiles from authenticated;

/* 読めるのは自分の行だけ（絞りは RLS の driver_profiles_read_own）。 */
grant select on public.driver_profiles to authenticated;

/*
  直せるのは表示名だけ。

  status と trial_ends_at は渡さない。この2つは、支払いを確かめた
  こちら側（service_role）と ensure_driver_profile() だけが決める。
*/
grant update (display_name) on public.driver_profiles to authenticated;

/*
  insert と delete は渡さない。

  行を作れるのは ensure_driver_profile()（security definer）だけ。
  退会したときは auth.users の削除に連れて消える（on delete cascade）。
*/
