-- =============================================================================
-- 運営者の情報と、規約類の掲載先
-- =============================================================================
--
-- 画面仕様（docs/03-screen-spec.md S-05）に「利用規約 / プライバシー
-- ポリシー … 外部リンク」「お問い合わせ … メールリンク」とあるが、
-- アプリにまだ無い。**お金を受け取る以上、置かないままにはできない。**
--
--   * 継続課金の販売には、特定商取引法に基づく表記が要る
--     （販売者名・所在地・連絡先・金額・支払時期・解約条件）
--   * メールアドレス・顔写真・閲覧履歴をお預かりしている以上、
--     プライバシーポリシーの掲載先が要る
--
-- **文面はここに持たない。掲載先だけを持つ。**
--   要件（docs/01-client-requirements.md C-2）で「掲載先URL」を
--   いただく取り決めになっている。文面をアプリの中に抱えると、
--   直すたびに配り直しになる。外に置いていただき、こちらは指すだけ。
--
-- **空のあいだは、その行を出さない。**
--   押しても何も無いリンクは、壊れているのと同じ。入っている項目だけ
--   出す。
-- =============================================================================

create table public.site_settings (
  id             smallint primary key default 1 check (id = 1),

  /** 運営者名。特定商取引法の表記に要る。 */
  operator_name  text,
  /** 問い合わせ先。アプリからはメールを開く。 */
  contact_email  text,

  /** 掲載先。いずれも外部の URL。 */
  terms_url      text,
  privacy_url    text,
  /** 特定商取引法に基づく表記 */
  law_url        text,

  updated_at     timestamptz not null default now()
);

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 権限
--
--   **足す前に剥がす**（20260908000003 の顛末）。既定でぜんぶ渡っている。
--
--   会員は読める。規約類は見せるためのもので、隠すものではない。
--   絞り込みに使う id も渡す（列だけの権限では where が通らない。
--   20260909000004 の顛末）。
--
--   直せるのは管理者だけ。運営者名や問い合わせ先を書き換えられると、
--   利用者が別の宛先へ誘導されうる。
-- -----------------------------------------------------------------------------
revoke all on public.site_settings from anon, authenticated;

grant select on public.site_settings to authenticated;
grant update (operator_name, contact_email, terms_url, privacy_url, law_url)
  on public.site_settings to authenticated;

alter table public.site_settings enable row level security;

create policy site_settings_read on public.site_settings
  for select to authenticated
  using (true);

create policy site_settings_write_admin on public.site_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
