-- =============================================================================
-- 毎月の上位の方を、翌月無料にする（無料の仕組みの第3段）
-- =============================================================================
--
-- 発注元のご回答（2026-10-04）「情報提供件数上位20名程度を、有料化後も無料で」。
-- 決め方は、こちらからの提案（2026-10-05）のとおり（ご回答を待たずに進める
-- ご指示による。設定で変えられるようにしておく）。
--
--   * 数えるのは**採用**された件数。採用した日の月（日本時間）で数える
--   * 上位 **20名**（サイト設定 free_top_count）。同じ件数なら先に届いた方が上
--   * ただし **3件以上**（サイト設定 free_min_accepted）。参加の少ない月に、
--     1件だけで無料になるのを防ぐ
--   * 無料になるのは**翌月の1か月**（日本時間の月初から月末まで）
--   * **お支払い済みの方**は、ご利用期間を1か月延ばす（無料の月と重なるだけに
--     ならないように）
--   * 調査員・所有者（はじめから無料）と、止められた会員は順位に入らない
--
-- **月の締め（集計）は、仕掛け（cron）を置かずに行う。**
--   月が替わったあと、最初にだれかがアプリを開いたときに、前の月を一度だけ
--   締める（settle_free_month）。管理画面の「履歴の整理」と同じ考え方。
--   何度呼ばれても、締めるのは1回だけ（既に締めた月は何もしない。同時に
--   呼ばれても重ならないよう、鍵をかけて確かめ直す）。
--
-- **締めた結果は残す**（free_months / free_grants）。あとから採用を取り消して
-- も、無料の判断は変わらない。誰がいつ無料になったかを、あとで確かめられる。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 設定（人数・最低件数）
-- -----------------------------------------------------------------------------
alter table public.site_settings
  add column if not exists free_top_count smallint not null default 20
    check (free_top_count between 1 and 200),
  add column if not exists free_min_accepted smallint not null default 3
    check (free_min_accepted between 1 and 100);

comment on column public.site_settings.free_top_count is
  '毎月の情報提供の上位で、翌月無料にする人数（既定 20）';
comment on column public.site_settings.free_min_accepted is
  '翌月無料になるのに要る、その月の採用件数の下限（既定 3）';

grant update (free_top_count, free_min_accepted) on public.site_settings to authenticated;

-- -----------------------------------------------------------------------------
-- 2. 順位の元（月ごと）
--
--   submission_ranking（画面に出す順位）と、月の締め（無料の判断）で同じものを
--   使う。数え方を2か所に書くと、画面の順位と無料になる方が食い違う。
--   会員には直接呼ばせない（ほかの方の id が返るため）。
-- -----------------------------------------------------------------------------
create or replace function public.ranking_rows(p_month text)
returns table (
  user_id        uuid,
  accepted       integer,
  last_at        timestamptz,
  rnk            bigint,
  display_name   text,
  rank_anonymous boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select ((p_month || '-01')::date)::timestamp at time zone 'Asia/Tokyo' as m_start,
           (((p_month || '-01')::date) + interval '1 month')::timestamp at time zone 'Asia/Tokyo' as m_end
  ),
  acc as (
    select s.user_id, count(*)::int as n, max(s.reviewed_at) as last_at
    from public.submissions s, bounds b
    where s.status = 'accepted'
      and s.reviewed_at >= b.m_start
      and s.reviewed_at < b.m_end
    group by s.user_id
  )
  select a.user_id, a.n, a.last_at,
         row_number() over (order by a.n desc, a.last_at asc, a.user_id) as rnk,
         d.display_name, d.rank_anonymous
  from acc a
  join public.driver_profiles d on d.user_id = a.user_id
  where d.status <> 'blocked'
    and public.free_reason_of(a.user_id) is null;
$$;

revoke execute on function public.ranking_rows(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. 締めた結果
-- -----------------------------------------------------------------------------
create table if not exists public.free_months (
  /* 集計した月（YYYY-MM）。無料になるのはこの翌月 */
  month         text primary key check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  settled_at    timestamptz not null default now(),
  /* 締めたときの設定（あとで設定を変えても、この月の判断は変わらない） */
  top_count     smallint not null,
  min_accepted  smallint not null,
  winners       integer not null default 0
);

create table if not exists public.free_grants (
  month          text not null references public.free_months (month) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  rank           integer not null,
  accepted       integer not null,
  /* 無料の期間（翌月の月初から月末まで。日本時間） */
  free_from      timestamptz not null,
  free_until     timestamptz not null,
  /* お支払い済みの期間を1か月延ばしたか */
  extended_paid  boolean not null default false,
  primary key (month, user_id)
);

create index if not exists free_grants_user_idx on public.free_grants (user_id, free_until desc);

comment on table public.free_grants is
  '毎月の情報提供の上位で、翌月無料になった方。月の締めのときに作る（あとから変えない）。';

revoke all on public.free_months from anon, authenticated;
revoke all on public.free_grants from anon, authenticated;
grant select on public.free_months to authenticated;
grant select on public.free_grants to authenticated;

alter table public.free_months enable row level security;
alter table public.free_grants enable row level security;

/* 締めた月は、だれが見てもよい（何人が無料になったか） */
drop policy if exists free_months_read on public.free_months;
create policy free_months_read on public.free_months
  for select to authenticated using (true);

/* 無料の記録は、本人の分と、管理者・編集者 */
drop policy if exists free_grants_read on public.free_grants;
create policy free_grants_read on public.free_grants
  for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

-- -----------------------------------------------------------------------------
-- 4. 月の締め
--
--   settle_free_month_at(時刻) … 中身。検証のために時刻を渡せる。会員には
--                                 呼ばせない（好きな月を締められてしまう）
--   settle_free_month()        … アプリと管理画面が呼ぶ。いまの時刻で前の月を締める
-- -----------------------------------------------------------------------------
create or replace function public.settle_free_month_at(p_now timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  jst      timestamp := p_now at time zone 'Asia/Tokyo';
  prev     text := to_char(date_trunc('month', jst) - interval '1 month', 'YYYY-MM');
  f_from   timestamptz := date_trunc('month', jst) at time zone 'Asia/Tokyo';
  f_until  timestamptz := (date_trunc('month', jst) + interval '1 month') at time zone 'Asia/Tokyo';
  top_n    integer;
  min_n    integer;
  won      integer;
begin
  if exists (select 1 from public.free_months where month = prev) then
    return null;
  end if;

  /* 同時に呼ばれても二重に締めないよう、鍵をかけて確かめ直す */
  perform pg_advisory_xact_lock(hashtext('kurumayose.settle_free_month'));
  if exists (select 1 from public.free_months where month = prev) then
    return null;
  end if;

  select s.free_top_count, s.free_min_accepted into top_n, min_n
  from public.site_settings s where s.id = 1;
  top_n := coalesce(top_n, 20);
  min_n := coalesce(min_n, 3);

  insert into public.free_months (month, top_count, min_accepted) values (prev, top_n, min_n);

  insert into public.free_grants (month, user_id, rank, accepted, free_from, free_until)
  select prev, r.user_id, r.rnk::int, r.accepted, f_from, f_until
  from public.ranking_rows(prev) r
  where r.rnk <= top_n and r.accepted >= min_n;
  get diagnostics won = row_count;

  /* お支払い済みで、期間がまだ残っている方は、その期間を1か月延ばす */
  with ext as (
    update public.driver_profiles d
       set paid_until = d.paid_until + interval '1 month'
      from public.free_grants g
     where g.month = prev
       and g.user_id = d.user_id
       and d.status = 'active'
       and d.paid_until is not null
       and d.paid_until > p_now
    returning d.user_id
  )
  update public.free_grants g
     set extended_paid = true
    from ext
   where g.month = prev and g.user_id = ext.user_id;

  update public.free_months set winners = won where month = prev;
  return jsonb_build_object('month', prev, 'winners', won);
end;
$$;

revoke execute on function public.settle_free_month_at(timestamptz) from public, anon, authenticated;

create or replace function public.settle_free_month()
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.settle_free_month_at(now());
$$;

revoke execute on function public.settle_free_month() from public, anon;
grant execute on function public.settle_free_month() to authenticated;

-- -----------------------------------------------------------------------------
-- 5. 自分が無料か（上位の分を足す）
--
--   調査員・所有者 … { reason: 'surveyor' / 'owner', until: null }（期限なし）
--   上位          … { reason: 'top', until: 無料の終わり }（いま無料の期間の中にいるとき）
-- -----------------------------------------------------------------------------
create or replace function public.my_free_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('reason', x.r, 'until', null)
       from (select public.free_reason_of(auth.uid()) as r) x
      where x.r is not null),
    (select jsonb_build_object('reason', 'top', 'until', g.free_until)
       from public.free_grants g
      where g.user_id = auth.uid()
        and now() >= g.free_from
        and now() < g.free_until
      order by g.free_until desc
      limit 1)
  );
$$;

revoke execute on function public.my_free_access() from public, anon;
grant execute on function public.my_free_access() to authenticated;

-- -----------------------------------------------------------------------------
-- 6. 画面に出す順位（ranking_rows を使う形に改め、無料の決まりと結果を添える）
--
--   足したもの
--     rule        … { top: 人数, min: 最低件数 }（いまの設定）
--     settled     … その月を締めたか
--     top[].free  … その月の締めで、翌月無料になった方か
--     me.free_until … いま無料の期間の中にいれば、その終わり
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
  top_n       integer;
  min_n       integer;
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

  m_start := ((month_label || '-01')::date)::timestamp at time zone 'Asia/Tokyo';
  m_end   := (((month_label || '-01')::date) + interval '1 month')::timestamp at time zone 'Asia/Tokyo';

  select s.free_top_count, s.free_min_accepted into top_n, min_n
  from public.site_settings s where s.id = 1;
  top_n := coalesce(top_n, 20);
  min_n := coalesce(min_n, 3);

  with r as (select * from public.ranking_rows(month_label))
  select jsonb_build_object(
    'month', month_label,
    'rule', jsonb_build_object('top', top_n, 'min', min_n),
    'settled', exists (select 1 from public.free_months f where f.month = month_label),
    'top', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'rank', r.rnk,
                 'accepted', r.accepted,
                 'me', r.user_id = me,
                 'name', case
                           when r.rank_anonymous or coalesce(btrim(r.display_name), '') = '' then null
                           else r.display_name
                         end,
                 'free', exists (
                   select 1 from public.free_grants g
                   where g.month = month_label and g.user_id = r.user_id
                 )
               ) order by r.rnk)
      from r
      where r.rnk <= greatest(20, top_n)
    ), '[]'::jsonb),
    'me', jsonb_build_object(
      'rank', (select r.rnk from r where r.user_id = me),
      'accepted', (
        select count(*)::int from public.submissions s
        where s.user_id = me and s.status = 'accepted'
          and s.reviewed_at >= m_start and s.reviewed_at < m_end
      ),
      'sent', (
        select count(*)::int from public.submissions s
        where s.user_id = me and s.created_at >= m_start and s.created_at < m_end
      ),
      'excluded', public.free_reason_of(me),
      'free_until', (
        select max(g.free_until) from public.free_grants g
        where g.user_id = me and now() >= g.free_from and now() < g.free_until
      )
    ),
    'participants', (select count(*) from r)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.submission_ranking(text) from public, anon;
grant execute on function public.submission_ranking(text) to authenticated;

notify pgrst, 'reload schema';
