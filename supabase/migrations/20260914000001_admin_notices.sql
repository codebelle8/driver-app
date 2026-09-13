-- =============================================================================
-- 管理画面の「お知らせ」
--
-- ご指示（2026-09-14）
--   1. 操作履歴を半年ごとに整理する。**勝手には消さない。**
--      管理画面へ問い合わせを出し、同意をいただいたときだけ消す。
--   2. 管理画面の上に知らせの窓を置く。出すのは次の2つ。
--        * 履歴の整理をお伺いする知らせ
--        * アプリの利用者がお支払いを済ませたという知らせ
--
-- **文言はここへ入れない。**
--   知らせの種類（kind）と手がかり（detail）だけを持つ。文面は管理画面が
--   組み立てる。文字をここへ入れると、表示の言語を切り替えても前の言語の
--   まま残る。アプリ側の取り込み（sync.ts）と同じ考え方。
-- =============================================================================

create table if not exists public.admin_notices (
  id          bigserial primary key,

  /*
    知らせの種類。

      purge_request … 操作履歴の整理をお伺いする
      payment       … 会員がお支払いを済ませた
  */
  kind        text not null check (kind in ('purge_request', 'payment')),

  /*
    いまの状態。

      open      … 未対応。ここが知らせの窓の「未読」になる
      done      … 片付いた（整理を実行した／入金を確認した）
      dismissed … 見送った（今回は消さない／取り合わない）
  */
  state       text not null default 'open'
              check (state in ('open', 'done', 'dismissed')),

  /* payment のとき、どの会員か。退会しても知らせは残す（null になる） */
  member_id   uuid references auth.users (id) on delete set null,

  /*
    手がかり。種類ごとに中身が違う。

      purge_request … { "cutoff": "2026-03-14T…", "count": 1234 }
      payment       … { "plan": "monthly", "yen": 4000 }
  */
  detail      jsonb,

  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references auth.users (id) on delete set null
);

/* 知らせの窓は「未対応を新しい順に」しか見ない */
create index if not exists admin_notices_state_idx
  on public.admin_notices (state, created_at desc);

/* 同じ会員の未対応が二重に積まれていないかを見る */
create index if not exists admin_notices_member_idx
  on public.admin_notices (member_id, state);

-- -----------------------------------------------------------------------------
-- 権限
--
-- **新しい表には、既定で authenticated へ全権限が付く。**
--   付いたままだと、アプリの利用者（authenticated）が知らせを
--   自由に書き換えられる。**まず剥がしてから、要るものだけ渡す。**
--
-- 渡すのは管理者への select だけ。書き込みは
--   * 管理画面のサーバー（service_role）… 作成・同意・片付け
--   * report_payment()（下記）             … 会員からの支払いの報告
-- の2つに限る。
-- -----------------------------------------------------------------------------
alter table public.admin_notices enable row level security;

revoke all on public.admin_notices from anon, authenticated;
revoke all on sequence public.admin_notices_id_seq from anon, authenticated;

grant select on public.admin_notices to authenticated;

drop policy if exists admin_notices_read_staff on public.admin_notices;
create policy admin_notices_read_staff on public.admin_notices
  for select to authenticated
  using (public.is_staff());

-- -----------------------------------------------------------------------------
-- 会員からの「お支払いを済ませました」の報告
--
-- **なぜ関数にするか**
--   知らせを作れるのは管理画面の側だけにしたい。会員に insert を渡すと、
--   好きな種類・好きな中身の知らせを積めてしまう。関数の中で、種類も
--   中身もこちらが決める。
--
-- **二重に積まない**
--   未対応の報告がすでにあるなら、何もしない。押し直しても増えない。
--   入金の確認は人が行うため、確認までに間が空く。そのあいだ何度か
--   押される前提で作る。
--
-- **料金を選んでいない方は報告できない**
--   いくらのお振込みか分からない知らせは、受け取っても動きようがない。
-- -----------------------------------------------------------------------------
create or replace function public.report_payment()
returns public.admin_notices
language plpgsql
security definer
set search_path = public
as $$
declare
  me     public.driver_profiles;
  found  public.admin_notices;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;

  select * into me from public.driver_profiles where user_id = auth.uid();
  if me.user_id is null then
    raise exception '会員の登録がありません';
  end if;
  if me.plan is null then
    raise exception '料金が選ばれていません';
  end if;

  -- すでに未対応の報告があるなら、それを返して終わる
  select * into found
  from public.admin_notices
  where kind = 'payment' and member_id = auth.uid() and state = 'open'
  limit 1;

  if found.id is not null then
    return found;
  end if;

  insert into public.admin_notices (kind, member_id, detail)
  values (
    'payment',
    auth.uid(),
    jsonb_build_object(
      'plan', me.plan,
      'member_no', me.member_no
    )
  )
  returning * into found;

  return found;
end;
$$;

revoke execute on function public.report_payment() from public, anon;
grant execute on function public.report_payment() to authenticated;

-- -----------------------------------------------------------------------------
-- 会員から見た「報告済みかどうか」
--
--   会員は admin_notices を読めない（is_staff でないため）。
--   自分の報告が受け付けられているかだけを、この関数で返す。
--   押したのに何も変わらないと、押したことが分からない。
-- -----------------------------------------------------------------------------
create or replace function public.my_payment_reported()
returns timestamptz
language sql
security definer
set search_path = public
stable
as $$
  select max(created_at)
  from public.admin_notices
  where kind = 'payment'
    and member_id = auth.uid()
    and state = 'open';
$$;

revoke execute on function public.my_payment_reported() from public, anon;
grant execute on function public.my_payment_reported() to authenticated;
