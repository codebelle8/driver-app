-- =============================================================================
-- お知らせが二重に積まれないようにする
--
-- **なぜ要るか**
--   整理のお伺いが、**2件同時に作られた**（2026-09-14 実測、id 22 と 23、
--   差は2ミリ秒）。
--
--   管理画面は、外枠（layout）と中身（page）が**同時に**描かれる。
--   どちらも「まだ無いか」を確かめてから作る作りにしていたため、
--   両方が「まだ無い」と判断し、両方が作った。
--
--   確かめてから作る形は、同時に走ると必ずこうなる。**数え直しでは
--   防げない。** データベース側で「1件しか作れない」ことにする。
--
-- **消えるわけではない**
--   ここで弾かれるのは2件目の作成だけ。1件目は残る。
--   弾かれた側は何もせずに終わる（作る側は失敗を無視している）。
-- =============================================================================

/*
  未対応の整理のお伺いは、同時に1件まで。

  対応が済んだもの（done / dismissed）は何件でも残る。
  半年ごとの記録として辿れるようにしておく。
*/
create unique index if not exists admin_notices_one_open_purge
  on public.admin_notices (kind)
  where kind = 'purge_request' and state = 'open';

/*
  未対応のお支払いの報告は、会員ひとりにつき1件まで。

  関数の中でも同じ確認をしているが、そちらは「確かめてから作る」形で、
  同じ方が2つの端末から同時に押すと擦り抜ける。
*/
create unique index if not exists admin_notices_one_open_payment
  on public.admin_notices (member_id)
  where kind = 'payment' and state = 'open';

-- -----------------------------------------------------------------------------
-- 報告の関数を、弾かれたときに落ちないようにする
--
--   上の索引により、同時に押されると2件目の insert が失敗する。
--   失敗を利用者へ返す理由が無い（すでに1件受け付けているため）。
--   受け付け済みの行を引き直して返す。
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

  begin
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
  exception
    when unique_violation then
      -- ほぼ同時にもう一方が作った。そちらを返す。
      select * into found
      from public.admin_notices
      where kind = 'payment' and member_id = auth.uid() and state = 'open'
      limit 1;
  end;

  return found;
end;
$$;

revoke execute on function public.report_payment() from public, anon;
grant execute on function public.report_payment() to authenticated;
