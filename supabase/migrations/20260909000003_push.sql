-- =============================================================================
-- プッシュ通知
-- =============================================================================
--
-- 合意書の第2フェーズにある機能（docs/12-phase2-design.md 3）。
--
-- **アプリ内のお知らせとの違い**
--   既にある「お知らせ」は、アプリを開いたときに気づくもの。
--   注意事項の追加は出発前に知りたい性質のもので、開かないと
--   気づけないのでは足りない場面がある。
--
-- **iOS の制約**
--   16.4 以上、かつ**ホーム画面へ追加**した場合のみ受け取れる。
--   追加していない方には届かない。案内は別途アプリ側で出す。
--
-- **鍵をここに置く理由**
--   Web Push は VAPID という鍵の組を使う。公開鍵はアプリが購読の
--   ときに使い、秘密鍵は送る側（管理画面）だけが使う。
--
--   環境変数に置くやり方もあるが、それだと両方の配布先へ設定を足して
--   配り直すことになる。ここに置けば、鍵を作った時点から使える。
--
--   **秘密鍵は会員に渡さない。** 列ごとの GRANT で公開鍵だけを渡す。
--   RLS は「どの行か」しか絞れず、列は GRANT で絞る（20260908000003 の顛末）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 鍵。1行だけ。
-- -----------------------------------------------------------------------------
create table public.push_settings (
  id          smallint primary key default 1 check (id = 1),

  /** 購読のときにアプリが使う。会員も読める。 */
  public_key  text,
  /** 送るときだけ使う。**会員には渡さない。** */
  private_key text,
  /**
   * 送り主の連絡先（mailto:…）。
   * 配信元が問い合わせ先を求める決まりになっている。
   */
  subject     text,

  updated_at  timestamptz not null default now()
);

create trigger push_settings_set_updated_at
  before update on public.push_settings
  for each row execute function public.set_updated_at();

insert into public.push_settings (id) values (1) on conflict (id) do nothing;

revoke all on public.push_settings from anon, authenticated;

/*
  公開鍵と連絡先だけを渡す。秘密鍵は渡さない。

  表ごと渡して RLS で隠す、という手は使えない。RLS は行を絞るもので、
  列は絞れない。
*/
grant select (public_key, subject) on public.push_settings to authenticated;

alter table public.push_settings enable row level security;

create policy push_settings_read on public.push_settings
  for select to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- 購読（どの端末へ送るか）
--
--   1つのブラウザにつき1件。endpoint が端末とブラウザの組を表す。
--   同じ人が携帯とPCの両方から入れば2件になる。
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,

  /** 配信元の宛先。ブラウザが決める。 */
  endpoint     text not null unique,
  /** 中身を暗号化するための鍵。ブラウザが出す。 */
  p256dh       text not null,
  auth         text not null,

  /** どの端末か、後から見て分かるように。 */
  user_agent   text,

  created_at   timestamptz not null default now(),
  /**
   * 最後に確かめた時刻。
   *
   * 配信元が「もう無い」と返した購読は消す。消し損ねたものを
   * 後から片付けられるよう、いつのものかを持っておく。
   */
  last_seen_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

revoke all on public.push_subscriptions from anon, authenticated;

grant select, insert, update, delete on public.push_subscriptions to authenticated;

alter table public.push_subscriptions enable row level security;

/*
  自分の購読だけ。

  他人の宛先を読めると、その人の端末へ送れることになる
  （送るのは配信元だが、宛先が漏れれば同じこと）。
*/
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
