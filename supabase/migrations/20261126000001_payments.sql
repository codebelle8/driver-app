-- =============================================================================
-- お支払いの記録・自動更新の状態・Stripe から届いた知らせの控え
-- =============================================================================
--
-- 上野様のご回答（2026-11-25。docs/20-payments.md）
--   カード（Stripe。毎月・毎年の自動更新）、PayPay（Stripe。その都度）、
--   銀行振込（いまのまま）。2027年2月ごろから有料。
--
-- **この段で作るのは、データベースの形と、期限を延ばす関数だけ。**
--   Stripe の支払い画面や、Stripe からの知らせ（webhook）の受け口は次の段で作る。
--   アプリと管理画面は、まだ何も変えない。いまは試験提供の期間中で、使えるか
--   どうかの判断はこれまでどおり。管理画面の「入金を確認した」も、いまのまま
--   （actions/members.ts）。管理画面を直す段で record_payment() に乗せ替える。
--
-- **決まり**（docs/20-payments.md「作り方の決まり」）
--   * 使えるかどうかを決めるのは、これまでどおり driver_profiles.paid_until の1つ。
--     新しい表は、それを延ばした記録と、延ばすための材料。別の決め手にはしない。
--     別の決め手を足すと、圏外の控えに入れ忘れて、電波の無い場所でだけ締め出される
--   * paid_until を書くのはサーバーだけ。ここの関数は service_role にしか渡さない。
--     アプリから「払った」とは書かせない
--   * 同じ知らせが2回届いても、二重に延ばさない（支払いごとの番号に一意の制約）
--   * カード番号・カードの下4桁・有効期限・請求先の氏名や住所は持たない
--     （規約案 第7条3項。プライバシーポリシー案1は、決済の情報を「識別子、支払方法の
--     種類、決済の成否、決済日、金額および自動更新の状態に限ります」としている）
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. お支払いの記録（1回のお支払いにつき1行）
--
--   領収書（適格請求書）の元になる。銀行振込も同じ表に入れる。
--   決済できなかった試みは入れない（Stripe 側に残る。未納は 2 の状態で持つ）。
-- -----------------------------------------------------------------------------
create sequence if not exists public.payment_receipt_no_seq start 1;

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),

  /*
    支払った会員。**退会しても記録は残す**（on delete set null）。
      * 12か月払いの方が退会したときの返金（規約 第11条・第19条5項）は、
        退会のあとで行う。記録が消えると、いくら返すかを出せない
      * 領収書の写しと帳簿は、法令で7年保存する
    規約 第19条3項の「退会により削除されるもの」に、お支払いの記録は入れていない。
    退会のあとでも突き合わせられるよう、会員番号を写しておく。
  */
  user_id         uuid references auth.users (id) on delete set null,
  member_no       integer not null,

  /* card … カード（Apple Pay・Google Pay を含む） / paypay … PayPay / transfer … 銀行振込 */
  method          text not null check (method in ('card', 'paypay', 'transfer')),

  /*
    お支払いいただいた刻み。3か月・6か月は取りやめたので入れない
    （名簿の driver_profiles.plan には、以前の値として残っている）。
  */
  plan            text not null check (plan in ('monthly', 'yearly')),

  /* 受け取った金額（円・税込）。料金を変えても、払ったときの額のまま残る */
  amount          integer not null check (amount > 0),

  /* 税率（%）。いまは10%だけ。変わるときは、この制約を張り替える */
  tax_rate        smallint not null default 10 check (tax_rate = 10),

  /*
    含まれる消費税の額（1円未満は切り捨て）。領収書に載せる額を、ここで1つに決める。
    600円 → 54円、5,000円 → 454円。画面とメールで別々に計算すると、ずれることがある。
  */
  tax_amount      integer generated always as (amount * tax_rate / (100 + tax_rate)) stored,

  /* このお支払いで使えるようになった期間 */
  period_from     timestamptz not null,
  period_until    timestamptz not null,

  paid_at         timestamptz not null default now(),

  /*
    お支払いごとの番号。**同じ番号は2回入らない**（二重に延ばさない仕掛けの本体）。
      カードの自動更新 … Stripe の請求書の番号（in_…）
      PayPay など都度  … Stripe の支払いの番号（pi_…）
      銀行振込        … 管理画面が「入金を確認した」の画面ごとに振る番号（transfer:…）
  */
  source_ref      text not null unique,

  /* 領収書の通し番号と、送った時刻（プライバシーポリシー案1「領収書の送付の記録」） */
  receipt_no      integer not null unique default nextval('public.payment_receipt_no_seq'),
  receipt_sent_at timestamptz,

  /* 返金（第11条）。一部だけ返すこともあるため、額で持つ */
  refunded_amount integer not null default 0,
  refunded_at     timestamptz,

  /* 銀行振込の入金を確かめた職員。Stripe の分は空 */
  recorded_by     uuid references auth.users (id) on delete set null,

  created_at      timestamptz not null default now(),

  constraint payments_period_check check (period_until > period_from),
  constraint payments_refund_check check (refunded_amount between 0 and amount)
);

alter sequence public.payment_receipt_no_seq owned by public.payments.receipt_no;

/* マイページで、自分のお支払いを新しい順に出す */
create index if not exists payments_user_idx on public.payments (user_id, paid_at desc);

comment on table public.payments is
  'お支払いの記録（1回につき1行）。領収書の元。退会しても残す（会員番号で突き合わせる）。'
  '書けるのは record_payment() だけ（service_role）。';


-- -----------------------------------------------------------------------------
-- 2. 自動更新の状態（カード払いの方。会員ごとに1行）
--
--   マイページの「次の更新日」「解約の予定」「決済できませんでした」の元。
--   Stripe の顧客の番号もここに持つ（PayPay だけの方も、顧客の番号は持つことがある）。
--   退会すれば消える。自動更新は退会で止まる（規約 第19条2項）。止めるのは
--   退会の処理の中で、サーバーが Stripe に伝える（受け口の段で作る）。
-- -----------------------------------------------------------------------------
create table if not exists public.member_billing (
  user_id              uuid primary key references auth.users (id) on delete cascade,

  stripe_customer      text unique,
  stripe_subscription  text unique,

  plan                 text check (plan in ('monthly', 'yearly')),

  /*
    Stripe の状態の名前をそのまま使う（Stripe の管理画面と見比べやすいように）。
      trialing … 無料期間中に申し込み、最初の決済を待っている（規約案 第8条2項）
      active   … 自動更新している
      past_due … 決済できず、待っている（第9条の7日間）
      canceled … 終わった（解約、または待つ期間が過ぎた）
    Stripe のほかの状態（incomplete など）は、受け口がこの4つのどれかに寄せる。
  */
  status               text check (status in ('trialing', 'active', 'past_due', 'canceled')),

  /* 次に決済する日（無料期間中の申込みなら、最初の決済の日） */
  current_period_end   timestamptz,

  /* 解約の予定。期間の終わりで止まる（第10条） */
  cancel_at_period_end boolean not null default false,

  /* 決済できなくなった時刻。ここから7日間待つ（第9条1項） */
  past_due_since       timestamptz,

  /*
    最後に反映した知らせの時刻（Stripe が知らせを作った時刻）。
    Stripe の知らせは、作った順に届くとは限らない。古い知らせが後から届いても、
    状態を戻さない。
  */
  last_event_at        timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists member_billing_set_updated_at on public.member_billing;
create trigger member_billing_set_updated_at
  before update on public.member_billing
  for each row execute function public.set_updated_at();

comment on table public.member_billing is
  '自動更新（カード）の状態と、Stripe の顧客の番号。会員ごとに1行。'
  '状態を書けるのは sync_member_billing() だけ（service_role）。';


-- -----------------------------------------------------------------------------
-- 3. Stripe から届いた知らせの控え
--
--   同じ知らせを二度処理しないため（Stripe は、届いたと返事をするまで、同じ知らせを
--   何度も送り直す）。処理を終えたら processed_at を入れる。途中で失敗したものは
--   空のまま残り、送り直しで、もう一度処理する（record_payment は同じ番号を二度
--   入れないので、もう一度処理しても二重には延びない）。
--
--   **知らせの中身（payload）は持たない。** 中身にはカードの下4桁、請求先の
--   メールアドレスや氏名が入ることがある。プライバシーポリシー案で「限ります」と
--   書いた範囲を超える。必要なものだけを、1 と 2 へ写す。
-- -----------------------------------------------------------------------------
create table if not exists public.stripe_events (
  /* Stripe の知らせの番号（evt_…） */
  id           text primary key check (id ~ '^evt_'),
  type         text not null,
  /* Stripe が知らせを作った時刻 */
  created      timestamptz not null,
  /* 知らせの対象（in_… / pi_… / sub_… など） */
  object_id    text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  attempts     smallint not null default 1,
  last_error   text
);

comment on table public.stripe_events is
  'Stripe から届いた知らせ（webhook）の控え。二度処理しないため。中身は持たない。service_role だけ。';


-- -----------------------------------------------------------------------------
-- 4. 権限
--
--   **足す前に剥がす。** Supabase は public スキーマの新しい表へ、既定ですべての
--   権限を anon・authenticated へ渡している（20260908000003 の顛末）。
--
--   会員：自分のお支払いと、自分の自動更新の状態を読めるだけ。書けない。
--         読める列も絞る（Stripe の番号と、確かめた職員は見せない。要らないため）。
--         列を絞ったので、アプリからは `select('*')` ではなく列を名指しして読む。
--   管理者：全員分を読める（ポリシー）。書くのはサーバー（service_role）だけ。
--   知らせの控え：会員にも管理者にも渡さない。サーバーだけ。
--   service_role は RLS を通らずに読み書きできる（Supabase の決まり）。
-- -----------------------------------------------------------------------------
revoke all on public.payments       from anon, authenticated;
revoke all on public.member_billing from anon, authenticated;
revoke all on public.stripe_events  from anon, authenticated;
/* 領収書の番号を、会員が勝手に進められないように */
revoke all on sequence public.payment_receipt_no_seq from anon, authenticated;

grant select (
  id, user_id, member_no, method, plan, amount, tax_rate, tax_amount,
  period_from, period_until, paid_at, receipt_no, receipt_sent_at,
  refunded_amount, refunded_at
) on public.payments to authenticated;

grant select (
  user_id, plan, status, current_period_end, cancel_at_period_end, past_due_since
) on public.member_billing to authenticated;

alter table public.payments       enable row level security;
alter table public.member_billing enable row level security;
alter table public.stripe_events  enable row level security;

drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists member_billing_read on public.member_billing;
create policy member_billing_read on public.member_billing
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

/* stripe_events にはポリシーを作らない（RLS を入れてポリシーが無い = だれも読めない） */


-- -----------------------------------------------------------------------------
-- 5. お支払いを記録して、期限を延ばす
--
--   Stripe の受け口（次の段）と、管理画面の「入金を確認した」（管理画面の段で
--   乗せ替える）の両方が、ここを通る。期限の延ばし方を1か所にする。
--
--   **同じ番号（p_source_ref）は2回目から何もしない。** 前の記録をそのまま返す。
--
--   **期間の決め方**
--     * Stripe の自動更新は、Stripe の請求書の期間をそのまま渡す（p_period_from と
--       p_period_until）。決済が数日遅れても、Stripe は更新日をずらさない。
--       こちらで「払った時点から1か月」と数えると、Stripe の更新日と食い違う
--     * それ以外（PayPay・銀行振込）は、ここで数える。いま使える終わり（無料期間の
--       終わり／お支払いいただいた期間の終わり、の遅いほう）のあとから、刻みの
--       月数ぶん。**無料期間の残りを切り捨てない**（規約 第5条2項。管理画面の
--       nextPaidUntil と同じ数え方。月末は、足した先の月の末日に寄せる）
--
--   **期限は縮めない。** paid_until は、いまの値と期間の終わりの遅いほうにする。
--   上位の方の無料（settle_free_month）で1か月延びている方に、延びる前の期間の
--   請求書が届いても、延びた分は消えない。自動更新の方は、その1か月ぶん Stripe の
--   次の決済を後ろへずらす（受け口の段で作る。docs/20-payments.md）。
--
--   止めている方（blocked）は止めたまま。お金は受け取ったので、記録と期限は入れる。
-- -----------------------------------------------------------------------------
create or replace function public.record_payment(
  p_user         uuid,
  p_method       text,
  p_plan         text,
  p_amount       integer,
  p_source_ref   text,
  p_paid_at      timestamptz default now(),
  p_period_from  timestamptz default null,
  p_period_until timestamptz default null,
  p_recorded_by  uuid default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  prof     public.driver_profiles;
  rec      public.payments;
  v_months integer;
  v_from   timestamptz;
  v_until  timestamptz;
begin
  if p_source_ref is null or btrim(p_source_ref) = '' then
    raise exception 'source_ref_required';
  end if;

  /* 同じお支払いは、2回目から前の記録を返すだけ */
  select * into rec from public.payments where source_ref = p_source_ref;
  if found then
    return rec;
  end if;

  v_months := case p_plan when 'monthly' then 1 when 'yearly' then 12 end;
  if v_months is null then
    raise exception 'invalid_plan: %', p_plan;
  end if;

  if (p_period_from is null) <> (p_period_until is null) then
    raise exception 'period_needs_both_ends';
  end if;

  if p_method = 'transfer' and p_recorded_by is null then
    /* 銀行振込は人が確かめる。だれが確かめたかが残らない記録は作らない */
    raise exception 'transfer_needs_recorded_by';
  end if;

  /*
    会員の行に鍵をかける。同じ会員のお支払いが同時に2つ届いても、
    片方の延長がもう片方に上書きされないように。
  */
  select * into prof from public.driver_profiles where user_id = p_user for update;
  if not found then
    raise exception 'member_not_found';
  end if;

  /* 鍵を取るまでのあいだに、同じお支払いが先に入っていないか確かめ直す */
  select * into rec from public.payments where source_ref = p_source_ref;
  if found then
    return rec;
  end if;

  if p_period_until is not null then
    v_from  := p_period_from;
    v_until := p_period_until;
  else
    /* greatest は null を飛ばす。どちらも過ぎていれば、払った時点から */
    v_from  := greatest(p_paid_at, prof.paid_until, prof.trial_ends_at);
    /*
      **月は日本時間の暦で数える。** 1月31日の朝8時（日本時間）に1か月足すと、
      2月28日の朝8時。時刻帯を決めずに足すと、データベースの時刻帯（UTC）で数え、
      UTC ではまだ1月30日のため、3月1日になってしまう。
      （管理画面の nextPaidUntil はサーバーの時刻帯で数えている。乗せ替えると揃う）
    */
    v_until := ((v_from at time zone 'Asia/Tokyo') + make_interval(months => v_months))
               at time zone 'Asia/Tokyo';
  end if;

  insert into public.payments (
    user_id, member_no, method, plan, amount,
    period_from, period_until, paid_at, source_ref, recorded_by
  ) values (
    p_user, prof.member_no, p_method, p_plan, p_amount,
    v_from, v_until, p_paid_at, p_source_ref, p_recorded_by
  )
  returning * into rec;

  update public.driver_profiles
     set paid_until = greatest(paid_until, v_until),
         status     = case when status = 'blocked' then status else 'active' end
   where user_id = p_user;

  return rec;
end;
$$;

revoke execute on function public.record_payment(uuid, text, text, integer, text, timestamptz, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.record_payment(uuid, text, text, integer, text, timestamptz, timestamptz, timestamptz, uuid)
  to service_role;


-- -----------------------------------------------------------------------------
-- 6. 自動更新の状態を、Stripe の知らせに合わせる
--
--   Stripe の自動更新（subscription）が作られた・変わった・終わった、の知らせを
--   受けたときに、受け口（次の段）が呼ぶ。
--
--   **古い知らせは捨てる。** p_event_at が、最後に反映した知らせより前なら何もしない。
--   （同じ秒の知らせは、届いた順に反映する。Stripe の時刻は秒までのため）
--
--   **決済できなかったとき（past_due）は、7日間待つ**（第9条1項）。
--     最初に past_due になった時刻から7日後まで、使える期限を延ばす。
--     Stripe が途中で決済をやり直して、また失敗しても、7日の起点は動かさない。
--     待つあいだに決済できれば、record_payment が Stripe の期間で期限を入れ直す。
--     決済できないまま終われば、7日後で止まる。
--     延ばす先は、アプリがいま見ている終わり（app/src/lib/account.ts の endsAt）。
--       お支払い済み（active）の方 … paid_until
--       無料期間の方（最初の決済ができなかった） … trial_ends_at
--     期限なし（paid_until が空のまま active）の方には、期限を付けない。
-- -----------------------------------------------------------------------------
create or replace function public.sync_member_billing(
  p_user                 uuid,
  p_event_at             timestamptz,
  p_customer             text,
  p_subscription         text,
  p_plan                 text,
  p_status               text,
  p_period_end           timestamptz,
  p_cancel_at_period_end boolean default false
)
returns public.member_billing
language plpgsql
security definer
set search_path = public
as $$
declare
  cur       public.member_billing;
  v_since   timestamptz;
  v_grace   timestamptz;
begin
  if p_event_at is null or p_subscription is null or p_status is null then
    raise exception 'event_at_subscription_status_required';
  end if;

  if not exists (select 1 from public.driver_profiles where user_id = p_user) then
    raise exception 'member_not_found';
  end if;

  insert into public.member_billing (user_id) values (p_user)
  on conflict (user_id) do nothing;

  select * into cur from public.member_billing where user_id = p_user for update;

  if cur.last_event_at is not null and p_event_at < cur.last_event_at then
    return cur;
  end if;

  v_since := case
               when p_status = 'past_due' then coalesce(cur.past_due_since, p_event_at)
               else null
             end;

  update public.member_billing
     set stripe_customer      = coalesce(p_customer, stripe_customer),
         stripe_subscription  = p_subscription,
         plan                 = coalesce(p_plan, plan),
         status               = p_status,
         current_period_end   = p_period_end,
         cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
         past_due_since       = v_since,
         last_event_at        = p_event_at
   where user_id = p_user
  returning * into cur;

  if v_since is not null then
    v_grace := v_since + interval '7 days';
    update public.driver_profiles
       set paid_until = case
                          when status = 'active' and paid_until is not null
                            then greatest(paid_until, v_grace)
                          else paid_until
                        end,
           trial_ends_at = case
                             when status in ('trial', 'expired')
                               then greatest(trial_ends_at, v_grace)
                             else trial_ends_at
                           end
     where user_id = p_user;
  end if;

  return cur;
end;
$$;

revoke execute on function public.sync_member_billing(uuid, timestamptz, text, text, text, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.sync_member_billing(uuid, timestamptz, text, text, text, text, timestamptz, boolean)
  to service_role;

/* 表の形が変わったことを PostgREST へ伝える */
notify pgrst, 'reload schema';
