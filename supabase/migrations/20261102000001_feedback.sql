-- =============================================================================
-- ご意見箱（会員から、アプリへのご意見・ご要望を受け付ける）
-- =============================================================================
--
-- ご指示（2026-11-02）。アプリの「探す」画面の右下に、ご意見箱の絵を置き、
-- 押すとご意見を書いて送れるようにする。管理画面で読み、状態を切り替える。
--
-- **情報提供（submissions）とは別の表にする。**
--   情報提供は施設ごとの情報で、採用の件数が翌月無料の判断に入る。ご意見は
--   アプリそのものへの声で、件数を何かに数えることはしない。混ぜると、
--   ご意見が順位に数えられてしまう。
--
-- **会員にできること**
--   * 自分の名前で送る（状態は必ず「受け付けました」で始まる）
--   * 自分の送ったものと、その状態を読む
--   **書き換え・取り消しはできない**（情報提供と同じ）。
--
-- **職員の覚え書き（staff_note）は会員に見せない。**
-- =============================================================================

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),

  /* 送った会員。退会すると一緒に消える */
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,

  /*
    種類。
      feature … 新しい機能がほしい
      trouble … 使いにくいところ
      other   … その他
  */
  kind        text not null check (kind in ('feature', 'trouble', 'other')),

  body        text not null check (char_length(btrim(body)) between 1 and 1000),

  /*
    状態（管理者が切り替える）。
      new         … 受け付けました（送られた直後は必ずこれ）
      considering … 検討中
      done        … 対応しました
      declined    … 見送り
  */
  status      text not null default 'new'
              check (status in ('new', 'considering', 'done', 'declined')),

  /* 状態を変えた日時と人。状態を変えたときに自動で入る（下のトリガー） */
  handled_at  timestamptz,
  handled_by  uuid references auth.users (id) on delete set null,

  /* 職員の覚え書き（会員には見せない） */
  staff_note  text check (staff_note is null or char_length(staff_note) <= 500),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.feedback is
  '会員からアプリへのご意見（ご意見箱）。状態は管理者が切り替える。件数は何にも数えない。';

create index if not exists feedback_status_created_idx
  on public.feedback (status, created_at desc);
create index if not exists feedback_user_created_idx
  on public.feedback (user_id, created_at desc);

drop trigger if exists feedback_set_updated_at on public.feedback;
create trigger feedback_set_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 状態を変えた日時と人は、データベースが入れる（画面からは渡さない）
-- -----------------------------------------------------------------------------
create or replace function public.stamp_feedback_handled()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'new' then
      new.handled_at := null;
      new.handled_by := null;
    else
      new.handled_at := now();
      new.handled_by := auth.uid();
    end if;
  else
    new.handled_at := old.handled_at;
    new.handled_by := old.handled_by;
  end if;
  return new;
end;
$$;

drop trigger if exists feedback_stamp_handled on public.feedback;
create trigger feedback_stamp_handled
  before update on public.feedback
  for each row execute function public.stamp_feedback_handled();

-- -----------------------------------------------------------------------------
-- 送りすぎを止める（1人につき24時間で10件まで）
--
--   ご意見は落ち着いて書くもので、1日10件あれば足りる。連打で一覧が
--   埋まらないように。
-- -----------------------------------------------------------------------------
create or replace function public.limit_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
begin
  select count(*) into recent
  from public.feedback
  where user_id = new.user_id
    and created_at > now() - interval '24 hours';

  if recent >= 10 then
    raise exception 'too_many_feedback'
      using hint = '24時間に送れるご意見は10件までです';
  end if;
  return new;
end;
$$;

drop trigger if exists feedback_limit on public.feedback;
create trigger feedback_limit
  before insert on public.feedback
  for each row execute function public.limit_feedback();

-- -----------------------------------------------------------------------------
-- 権限
--
--   新しい表は、既定で authenticated に一通りの権限が付く。いったん
--   すべて外し、要るものだけを渡す（情報提供と同じ考え方）。
-- -----------------------------------------------------------------------------
revoke all on public.feedback from anon, authenticated;

/* 読める列。職員の覚え書き（staff_note）と、状態を変えた人（handled_by）は渡さない */
grant select (id, user_id, kind, body, status, handled_at, created_at, updated_at)
  on public.feedback to authenticated;
/* 会員が送るときに書ける列だけ。状態は書かせない */
grant insert (user_id, kind, body) on public.feedback to authenticated;
/* 状態の切り替えと覚え書き（管理者）。誰がいつ変えたかはトリガーが入れる */
grant update (status, staff_note) on public.feedback to authenticated;

alter table public.feedback enable row level security;

/* 送る。自分の名前でだけ。止められている会員（blocked）は送れない */
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'new'
    and exists (
      select 1 from public.driver_profiles d
      where d.user_id = auth.uid() and d.status <> 'blocked'
    )
  );

/* 読む。本人の分と、管理者はすべて */
drop policy if exists feedback_read on public.feedback;
create policy feedback_read on public.feedback
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

/* 状態の切り替え。管理者だけ */
drop policy if exists feedback_handle on public.feedback;
create policy feedback_handle on public.feedback
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 操作履歴
--
--   状態の切り替えだけを記録する。会員が送ったこと自体は記録しない
--   （操作履歴は職員の操作の記録。情報提供と同じ）。
-- -----------------------------------------------------------------------------
drop trigger if exists feedback_audit on public.feedback;
create trigger feedback_audit
  after update on public.feedback
  for each row execute function public.record_audit();

notify pgrst, 'reload schema';
