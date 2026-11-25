-- =============================================================================
-- 有料の期間の始まりを1か所で決める（上位の方の無料の月を含める）
-- =============================================================================
--
-- 20261126000001 の record_payment() は、有料の期間を
--   払った時点・お支払い済みの期間の終わり・無料期間の終わり
-- のうち遅いほうから始めていた。**情報提供の上位で無料の月にいる方
-- （free_grants）が抜けていた。**
--
--   お支払い済みの方は、締めのときに paid_until が1か月延びているので困らない。
--   困るのは、無料期間を過ぎた方（status = 'trial'）や、お支払いの期間が切れた方が、
--   無料の月の途中で申し込んだとき。無料の月と有料の期間が重なり、無料のはずの
--   日数ぶん払うことになる（利用規約 第6条第5項「同項に定める期間、利用料金を要しません」）。
--
-- 始まりを paid_period_start() にまとめ、record_payment() はそれを使う。
--   * カードの自動更新（受け口の段）で Stripe に渡す最初の決済日も、これを使う
--   * アプリの申込みの最後の画面（app/src/lib/checkout.ts の paidStart）も、
--     同じ決め方で日付を出す。**片方だけ直さないこと**（画面と記録が食い違う）
--
-- record_payment() は、始まりの決め方のほかは 20261126000001 と同じ。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 有料の期間の始まり
--
--   次のうち、いちばん遅いもの（greatest は null を飛ばす）
--     p_at                … 払った時点（申し込む時点）
--     paid_until          … お支払い済みの期間の終わり
--     trial_ends_at       … 無料期間の終わり
--     free_grants の終わり … 上位の方の無料の月（まだ終わっていないものだけ）
--
--   会員が見つからなければ null。
-- -----------------------------------------------------------------------------
create or replace function public.paid_period_start(p_user uuid, p_at timestamptz default now())
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    p_at,
    d.paid_until,
    d.trial_ends_at,
    (select max(g.free_until)
       from public.free_grants g
      where g.user_id = d.user_id
        and g.free_until > p_at)
  )
  from public.driver_profiles d
  where d.user_id = p_user;
$$;

revoke execute on function public.paid_period_start(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.paid_period_start(uuid, timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- 2. お支払いを記録して、期限を延ばす（始まりを paid_period_start に替える）
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
    /* 無料期間・お支払い済みの期間・上位の方の無料の月のあとから（上の 1） */
    v_from  := public.paid_period_start(p_user, p_paid_at);
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

notify pgrst, 'reload schema';
