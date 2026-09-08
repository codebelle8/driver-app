-- =============================================================================
-- 会員（ドライバー）のアカウント
-- =============================================================================
--
-- 背景:
--   初期版は会員登録を持たず、誰でも同じ公開データを読む作りだった
--   （app/src/lib/supabase.ts）。運用版へ進むにあたり、
--   メールアドレスによる会員登録と、1か月の無料期間を設ける。
--
-- 管理者と混ぜない理由:
--   admin_profiles は「管理画面を操作できる人」を表す。会員はそこへ入れない。
--   同じ表に役割を足していくと、会員が1人増えるたびに管理画面側の
--   権限判定（is_staff / is_admin）が重くなり、取り違えれば会員が
--   管理画面へ入れてしまう。**境界は表で分ける。**
--
--   Supabase の利用者（auth.users）は1つで、そこへ2つの別の名簿が
--   ぶら下がる形になる。同じ人が両方に載ることは妨げない。
--
-- メールアドレスをここへ控えない理由:
--   auth.users が持っている。控えると二重管理になり、変更されたときに
--   古いものが残る。管理画面は service_role で auth.users を引いており
--   （admin/src/app/(admin)/accounts/page.tsx）、会員一覧も同じ手で作れる。
--
-- status を列挙型にしない理由:
--   PostgreSQL は列挙型へ追加した値を同じトランザクション内で使えない。
--   admin_role で実際にこれに当たり、マイグレーションを分ける羽目になった
--   （20260827000001）。課金を入れる段で状態は必ず増えるため、
--   最初から text + check にしておく。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 名簿
-- -----------------------------------------------------------------------------
create table public.driver_profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,

  /* 表示名。任意。登録時は空で、あとからマイページで入れられる。 */
  display_name  text,

  /*
    いまの状態。

      trial   … 無料期間の中
      active  … 支払い済み（課金を入れる段で使う）
      expired … 無料期間が切れ、支払いも無い
      blocked … こちらで止めた

    いまの段では trial しか作らない。残りは、次の段で使う場所を
    先に空けてある。後から列挙型へ足すと、上に書いた制約に当たる。
  */
  status        text not null default 'trial'
                check (status in ('trial', 'active', 'expired', 'blocked')),

  /*
    無料期間の終わり。

    **登録した時刻から1か月。** 起算日を「初めて使った日」にする案もあるが、
    登録と初回利用が離れると、こちらからは無料期間の残りを説明できなくなる。
    登録日なら、利用者にも「登録から1か月」で伝わる。

    この値は ensure_driver_profile() が決める。端末からは渡させない
    （渡せると、いくらでも先へ延ばせる）。
  */
  trial_ends_at timestamptz not null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

/* 期限切れを拾うため。会員数が増えるまでは効かないが、後から足すと重い。 */
create index driver_profiles_trial_idx on public.driver_profiles (trial_ends_at);

create trigger driver_profiles_set_updated_at
  before update on public.driver_profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 権限
--
--   anon（未ログイン）には何も渡さない。会員の名簿は、鍵を持っているだけの
--   相手に見せるものではない。アプリの anon キーは配布物の中にあり、
--   解析すれば読める前提で設計している（20260807000002 の方針）。
--
--   insert を誰にも渡さないのが要点。行を作れるのは ensure_driver_profile()
--   だけで、無料期間の終わりはその中で決まる。
--
--   update は display_name だけに絞る。列ごとの GRANT で表す。
--   RLS では「どの行か」は絞れても「どの列か」は絞れない。
-- -----------------------------------------------------------------------------
revoke all on public.driver_profiles from anon;

grant select on public.driver_profiles to authenticated;
grant update (display_name) on public.driver_profiles to authenticated;

alter table public.driver_profiles enable row level security;

/* 自分の行だけ読める。管理者は会員一覧のため全件読める。 */
create policy driver_profiles_read_own on public.driver_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

/* 自分の行だけ直せる。直せる列は上の GRANT で絞ってある。 */
create policy driver_profiles_update_own on public.driver_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 登録
--
--   ログインしたあとに1回呼ぶ。行が無ければ作り、あれば今のものを返す。
--
--   **何度呼んでも無料期間は延びない。** on conflict do nothing にしてある。
--   ここを upsert にすると、アプリを開き直すたびに1か月が振り出しへ戻る。
--
--   security definer にしている理由:
--     authenticated には insert 権限を渡していない。この関数だけが
--     行を作れる。そのため無料期間の終わりを端末から動かせない。
-- -----------------------------------------------------------------------------
create or replace function public.ensure_driver_profile()
returns public.driver_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.driver_profiles;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;

  insert into public.driver_profiles (user_id, trial_ends_at)
  values (auth.uid(), now() + interval '1 month')
  on conflict (user_id) do nothing;

  select * into me from public.driver_profiles where user_id = auth.uid();
  return me;
end;
$$;

revoke execute on function public.ensure_driver_profile() from public, anon;
grant execute on function public.ensure_driver_profile() to authenticated;
