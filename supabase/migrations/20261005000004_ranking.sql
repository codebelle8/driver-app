-- =============================================================================
-- 情報提供ランキング（チャットの「情報提供ランキング」チャンネル）
-- =============================================================================
--
-- ご依頼（2026-10-05）。会員は、自分がどれだけ情報を送ったか、ほかの会員と
-- 比べて何位かを見られなかった。チャットを設け、その中のチャンネルで見せる。
--
-- 決まったこと（2026-10-05 のご回答）
--   * 順位は**採用件数**で決める。送った件数は本人にだけ見せる
--   * 順位には**表示名**を出す。出したくない方は設定で「匿名」を選べる
--   * 無料期間が切れて締め出されている方も、このチャンネルは見られる
--
-- **順位から外す方**
--   調査員と所有者（はじめから無料）、利用を止めた会員。毎月の上位の方を
--   翌月無料にする段で、同じ順位を使うため。
--
-- **月は日本時間で区切る。** 採用した日（reviewed_at）の月で数える。
-- **同じ件数なら、先にその件数に届いた方を上にする**（最後の採用が早い方）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 名前を出さない（匿名）
-- -----------------------------------------------------------------------------
alter table public.driver_profiles
  add column if not exists rank_anonymous boolean not null default false;

comment on column public.driver_profiles.rank_anonymous is
  '情報提供ランキングで表示名を出さない（匿名にする）。本人が設定で選ぶ。';

/* 本人が変えられる列に足す（表示名・顔写真・料金のご希望と同じ扱い） */
grant update (rank_anonymous) on public.driver_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 2. 無料の理由を、人を指定して引く
--
--   my_free_access()（自分の分）と、ランキング（全員の分）で同じ基準を使う。
--   基準を2か所に書くと、片方だけ直して食い違う。
--
--   所有者のメールアドレスは、20260830000001_protect_owner_account.sql と
--   admin/src/lib/owner.ts と同じ値（変えるときは揃えて直すこと）。
--
--   会員には直接呼ばせない（ほかの方が調査員かどうかが分かってしまう）。
-- -----------------------------------------------------------------------------
create or replace function public.free_reason_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when exists (
      select 1 from public.admin_profiles a
      where a.user_id = p_user and a.role = 'surveyor' and a.is_active
    ) then 'surveyor'
    when exists (
      select 1 from auth.users u
      where u.id = p_user and lower(u.email) = 'aprofessional0575@gmail.com'
    ) then 'owner'
    else null
  end;
$$;

revoke execute on function public.free_reason_of(uuid) from public, anon, authenticated;

create or replace function public.my_free_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when r is null then null else jsonb_build_object('reason', r, 'until', null) end
  from (select public.free_reason_of(auth.uid()) as r) x;
$$;

revoke execute on function public.my_free_access() from public, anon;
grant execute on function public.my_free_access() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. ランキング
--
--   戻り値（例）
--     {
--       "month": "2026-10",
--       "top": [ { "rank": 1, "accepted": 12, "me": false, "name": "山田" },
--                { "rank": 2, "accepted": 9,  "me": true,  "name": null }, … ],   ← 上位20名
--       "me":  { "rank": 2, "accepted": 9, "sent": 14, "excluded": null },
--       "participants": 35
--     }
--
--   name が null … 匿名を選んだ方・表示名の無い方（画面で「匿名の会員」と出す）
--   me.sent      … 本人がその月に送った件数（審査待ち・不採用も含む）。本人にだけ返す
--   me.excluded  … 順位から外れている理由（surveyor / owner）。外れていなければ null
--
--   **ほかの方について返すのは、順位・件数・表示名だけ。** 会員番号や
--   メールアドレスは返さない。
-- -----------------------------------------------------------------------------
create or replace function public.submission_ranking(p_month text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me          uuid := auth.uid();
  month_label text;
  m_start     timestamptz;
  m_end       timestamptz;
  result      jsonb;
begin
  if me is null then
    raise exception 'ログインしていません';
  end if;

  if p_month is null then
    month_label := to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM');
  elsif p_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    month_label := p_month;
  else
    raise exception 'invalid_month';
  end if;

  /* 日本時間の月初から、次の月初まで */
  m_start := ((month_label || '-01')::date)::timestamp at time zone 'Asia/Tokyo';
  m_end   := (((month_label || '-01')::date) + interval '1 month')::timestamp at time zone 'Asia/Tokyo';

  with accepted as (
    select s.user_id, count(*)::int as n, max(s.reviewed_at) as last_at
    from public.submissions s
    where s.status = 'accepted'
      and s.reviewed_at >= m_start
      and s.reviewed_at < m_end
    group by s.user_id
  ),
  eligible as (
    select a.user_id, a.n, a.last_at, d.display_name, d.rank_anonymous
    from accepted a
    join public.driver_profiles d on d.user_id = a.user_id
    where d.status <> 'blocked'
      and public.free_reason_of(a.user_id) is null
  ),
  ranked as (
    select e.*,
           row_number() over (order by e.n desc, e.last_at asc, e.user_id) as rnk
    from eligible e
  )
  select jsonb_build_object(
    'month', month_label,
    'top', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'rank', r.rnk,
                 'accepted', r.n,
                 'me', r.user_id = me,
                 'name', case
                           when r.rank_anonymous or coalesce(btrim(r.display_name), '') = '' then null
                           else r.display_name
                         end
               ) order by r.rnk)
      from ranked r
      where r.rnk <= 20
    ), '[]'::jsonb),
    'me', jsonb_build_object(
      'rank', (select r.rnk from ranked r where r.user_id = me),
      'accepted', coalesce((select a.n from accepted a where a.user_id = me), 0),
      'sent', (
        select count(*)::int from public.submissions s
        where s.user_id = me and s.created_at >= m_start and s.created_at < m_end
      ),
      'excluded', public.free_reason_of(me)
    ),
    'participants', (select count(*) from ranked)
  ) into result;

  return result;
end;
$$;

comment on function public.submission_ranking(text) is
  '情報提供ランキング（採用件数・日本時間の月ごと）。上位20名と本人の分を返す。';

revoke execute on function public.submission_ranking(text) from public, anon;
grant execute on function public.submission_ranking(text) to authenticated;

notify pgrst, 'reload schema';
