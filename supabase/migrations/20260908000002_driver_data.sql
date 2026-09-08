-- =============================================================================
-- お気に入りと閲覧履歴を、端末から引き継げるようにする
-- =============================================================================
--
-- 背景:
--   どちらも端末の中だけに持っており、機種変更で失われる。
--   「いつもの行き先」を留める機能なので、失われる前提のままでは
--   運用版として成り立たない（docs/12-phase2-design.md 1-1）。
--
--   マイページには既に「登録すると、機種変更しても引き継げます」と
--   出している。**この表ができるまで、その約束は果たされていない。**
--
-- 端末側と同じ形にしている理由:
--   端末側は施設ごとに1行で、時刻を1つ持つ（同じ施設を3回開いても
--   3行にはせず、先頭へ動かして時刻を更新する）。形を変えると、
--   突き合わせのたびに変換が要り、どちらが正かで迷う。
--   主キーを (利用者, 施設) にして、同じ持ち方にする。
--
-- 行数に上限を置かない理由:
--   施設への外部キーがあるため、1人あたり施設の数（現在193）を超えない。
--   上限を設けて古いものを削る仕掛けは、その分だけ壊れる余地が増える。
--   画面側の上限（お気に入り50・履歴100）は、これまでどおりアプリで見る。
--
-- **記録の置き場所が変わることについて**
--   これまで「どのドライバーがどの施設を見たか」は端末の外へ出していな
--   かった（app/src/lib/history.ts の但し書き）。引き継ぎを入れる以上、
--   サーバーへ預かることになる。
--
--   そこで、次の線を引いている。
--     * 管理画面からは読めない。管理者向けの参照ポリシーを作らない。
--     * 会員は自分の行しか読めない。
--     * 退会すれば消える（auth.users への on delete cascade）。
--
--   ただし service_role の鍵は RLS を迂回するため、運用者は技術的には
--   読める。これは伏せずに、発注元へお伝えしてある。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- お気に入り
-- -----------------------------------------------------------------------------
create table public.driver_favorites (
  user_id     uuid not null references auth.users (id)      on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete cascade,
  /* 留めた時刻。並びに使う。 */
  pinned_at   timestamptz not null default now(),
  primary key (user_id, facility_id)
);

/* 新しい順に引く。主キーの並びでは効かない。 */
create index driver_favorites_order_idx
  on public.driver_favorites (user_id, pinned_at desc);

-- -----------------------------------------------------------------------------
-- 閲覧履歴
-- -----------------------------------------------------------------------------
create table public.driver_history (
  user_id     uuid not null references auth.users (id)      on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete cascade,
  /* 最後に見た時刻。同じ施設を見直したら、この値だけを進める。 */
  seen_at     timestamptz not null default now(),
  primary key (user_id, facility_id)
);

create index driver_history_order_idx
  on public.driver_history (user_id, seen_at desc);

-- -----------------------------------------------------------------------------
-- 権限
--
--   anon には何も渡さない。誰がどこへ向かったかは、鍵を持っているだけの
--   相手に見せるものではない。
--
--   会員は自分の行を作り・読み・直し・消せる。どの行かは RLS で絞る。
--   管理者向けのポリシーは**作らない**。管理画面から他人の行き先を
--   眺められる状態にしない。
--
--   **足すだけでは絞れない。先に剥がす。**
--   Supabase は public スキーマの新しい表へ、既定ですべての権限を
--   authenticated へ渡している。狭い grant を足しても権限は増えるだけで、
--   減らない。driver_profiles で実際にこれに当たり、会員が自分の
--   無料期間を書き換えられる状態になっていた（20260908000003）。
-- -----------------------------------------------------------------------------
revoke all on public.driver_favorites from anon, authenticated;
revoke all on public.driver_history   from anon, authenticated;

grant select, insert, update, delete on
  public.driver_favorites,
  public.driver_history
to authenticated;

alter table public.driver_favorites enable row level security;
alter table public.driver_history   enable row level security;

create policy driver_favorites_own on public.driver_favorites
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy driver_history_own on public.driver_history
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
