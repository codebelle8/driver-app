-- =============================================================================
-- 規約類の掲載先を、ログインする前でも読めるようにする／気をつける言葉を会員に見せない
-- =============================================================================
--
-- ご回答（2026-10-08）「登録の画面に『利用規約とプライバシーポリシーに同意して
-- 登録』を置く」。登録の画面はログインする前に出るが、掲載先（site_settings）は
-- ログインしている人にしか読めなかった。同意の欄に規約へのリンクを出せない。
--
-- **ログイン前（anon）に見せるのは、掲示するための項目だけ。**
--   運営者名・問い合わせ先・利用規約・プライバシーポリシー・特商法の表記の掲載先。
--   いずれも公開するためのもので、隠すものではない。
--
-- **会員（authenticated）からは「気をつける言葉」を外す。**
--   20261008000001 で同じ表に足したが、表ごと読める権限のままだった。どの言葉で
--   「要確認」になるかが分かると、それを避けて書かれてしまう。会員に要る列だけを
--   読めるようにする（管理画面は service_role で読むので影響しない）。
-- =============================================================================

revoke select on public.site_settings from anon, authenticated;

grant select (
  id, operator_name, contact_email, terms_url, privacy_url, law_url,
  offline_grace_days, free_top_count, free_min_accepted, trial_open, updated_at
) on public.site_settings to authenticated;

grant select (
  id, operator_name, contact_email, terms_url, privacy_url, law_url
) on public.site_settings to anon;

drop policy if exists site_settings_read_anon on public.site_settings;
create policy site_settings_read_anon on public.site_settings
  for select to anon
  using (true);

notify pgrst, 'reload schema';
