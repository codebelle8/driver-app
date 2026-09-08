-- =============================================================================
-- 銀行振込でのお支払い
-- =============================================================================
--
-- ご指示（2026-09-08）:
--   日本のすべての銀行からお支払いいただけるようにする。
--
-- **銀行の一覧を持たない理由**
--   「どの銀行からでも払える」ために要るのは、銀行の一覧ではなく
--   受け取る口座ひとつ。振り込む側がどの銀行を使うかは、こちらが
--   知る必要のないことで、聞けば預かる責任だけが増える。
--
--   銀行を選ばせる形（口座振替）は、収納代行業者との契約が先に要り、
--   会員の口座番号を預かることになる。契約が無いうちは作らない。
--   ご確認のうえ、まず振込で進めることになった。
--
-- **口座番号を預からない**
--   この仕組みで扱うのは「発注元の受取口座」だけ。会員の口座は
--   一切扱わない。振込は会員が自分の銀行から行う。
--
-- **誰が振り込んだか**
--   振込は名義しか届かない。同姓同名や、法人名での振込があると
--   突き合わせられない。会員ごとに短い番号を振り、名義の前に付けて
--   いただく（銀行の振込名義欄は文字数が限られるため、4桁に収める）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 会員番号
--
--   振込名義の前に付けていただく番号。短く、変わらないこと。
--   利用者 id（36文字）は振込名義欄に入らない。
--
--   会員自身には変えさせない（列ごとの GRANT に入れていない）。
-- -----------------------------------------------------------------------------
create sequence if not exists public.driver_member_no_seq start 1;

alter table public.driver_profiles
  add column member_no integer not null default nextval('public.driver_member_no_seq');

create unique index driver_profiles_member_no_idx
  on public.driver_profiles (member_no);

-- -----------------------------------------------------------------------------
-- 受取口座
--
--   1行しか持たない。id を 1 に固定し、増えないようにしてある。
--   複数持てるようにすると「いまどれが正なのか」を決める仕掛けが要る。
--
--   まだ空で構わない。空のあいだ、アプリは「準備中」と出す。
--   発注元から口座をお伺いしたら、ここへ入れる。
-- -----------------------------------------------------------------------------
create table public.payment_settings (
  id                  smallint primary key default 1 check (id = 1),

  bank_name           text,
  branch_name         text,
  /* 'futsu' 普通 / 'touza' 当座 */
  account_type        text check (account_type in ('futsu', 'touza')),
  account_number      text,
  /* 口座名義。銀行の表記そのままと、読み方の両方。 */
  account_holder      text,
  account_holder_kana text,

  /* 画面の末尾へ添える一言。振込手数料の扱いなど。 */
  note                text,

  updated_at          timestamptz not null default now()
);

create trigger payment_settings_set_updated_at
  before update on public.payment_settings
  for each row execute function public.set_updated_at();

/* 1行だけ用意しておく。中身は後から入れる。 */
insert into public.payment_settings (id) values (1) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 権限
--
--   **足す前に剥がす。** Supabase は public スキーマの新しい表へ既定で
--   すべての権限を渡している（20260908000003 の顛末）。
--
--   会員は読める。振込先は隠すものではなく、見せるためのもの。
--   未ログインには渡さない。会員でない相手へ出す場面が無い。
--
--   直せるのは管理者だけ。編集者・調査員には渡さない。口座を書き換え
--   られると、支払いがまるごと他所へ流れる。
-- -----------------------------------------------------------------------------
revoke all on public.payment_settings from anon, authenticated;

grant select on public.payment_settings to authenticated;
grant update (
  bank_name, branch_name, account_type,
  account_number, account_holder, account_holder_kana, note
) on public.payment_settings to authenticated;

alter table public.payment_settings enable row level security;

create policy payment_settings_read on public.payment_settings
  for select to authenticated
  using (true);

create policy payment_settings_write_admin on public.payment_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
