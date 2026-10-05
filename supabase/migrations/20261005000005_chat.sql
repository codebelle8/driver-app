-- =============================================================================
-- チャット：会員どうしの書き込み（「情報交換」チャンネル）
-- =============================================================================
--
-- ご指示（2026-10-05「会員どうしの書き込み」）。チャットの第2段。
--
-- **全員に見える掲示板の形だけにする。1対1のやりとり（DM）は作らない。**
--   会員どうしの個別のやりとりを仲介すると、電気通信事業法の届出が要る
--   場合がある。全員に見える形なら通常は当たらないとされるが、最終的には
--   弁護士のご確認事項（docs/16-legal-drafts.md）。
--
-- **安全に始めるために、最初から揃えるもの**
--   * 通報（会員）… 他人の書き込みを1人1回まで
--   * 非表示（管理者・編集者）… 消さずに隠す。操作履歴に残る
--   * 書き込みの停止（管理者・編集者）… 会員ごと。アプリは使えるまま
--   * 連投の制限 … 1分に5件、1日に100件まで。1件500字まで
--   * 止められた会員（blocked）・書き込みを止めた会員は書けない
--
-- **名前は表示名**（無ければ「名前未設定の会員」と出す）。会員番号や
-- メールアドレスは出さない。会員番号は振込名義に使うため、人に見せない。
--
-- **無料期間が切れて締め出されている方も、読める・書ける**（チャットは
-- 締め出しの対象外。ご回答 2026-10-05）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 書き込み
-- -----------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  /* チャンネル。いまは「情報交換」（general）だけ。増やすときはここへ足す */
  channel     text not null default 'general' check (channel in ('general')),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  /* 非表示にした日時と人（管理者・編集者）。null なら見える */
  hidden_at   timestamptz,
  hidden_by   uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.chat_messages is
  'チャットの書き込み。全員に見える掲示板の形（DM は無い）。hidden_at があるものは会員に見せない。';

create index if not exists chat_messages_channel_created_idx
  on public.chat_messages (channel, created_at desc);
create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at desc);

/* 書き込みの停止（会員ごと）。変えられるのは職員だけ（会員には権限を渡さない） */
alter table public.driver_profiles
  add column if not exists chat_muted boolean not null default false;
comment on column public.driver_profiles.chat_muted is
  'チャットへの書き込みを止めている（管理者・編集者が設定）。読むことはできる。';

-- 非表示にした人と日時は、データベースが入れる（画面から渡させない）
create or replace function public.stamp_chat_hidden()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.hidden_at is distinct from old.hidden_at then
    if new.hidden_at is null then
      new.hidden_by := null;
    else
      new.hidden_at := now();
      new.hidden_by := auth.uid();
    end if;
  else
    new.hidden_by := old.hidden_by;
  end if;
  return new;
end;
$$;

drop trigger if exists chat_messages_stamp_hidden on public.chat_messages;
create trigger chat_messages_stamp_hidden
  before update on public.chat_messages
  for each row execute function public.stamp_chat_hidden();

-- 連投の制限（1分に5件、1日に100件まで）
create or replace function public.limit_chat_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.chat_messages
       where user_id = new.user_id and created_at > now() - interval '1 minute') >= 5
     or (select count(*) from public.chat_messages
          where user_id = new.user_id and created_at > now() - interval '24 hours') >= 100 then
    raise exception 'too_many_messages'
      using hint = '書き込みが多すぎます。少し時間をおいてください';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_messages_limit on public.chat_messages;
create trigger chat_messages_limit
  before insert on public.chat_messages
  for each row execute function public.limit_chat_messages();

revoke all on public.chat_messages from anon, authenticated;
grant select (id, channel, user_id, body, created_at) on public.chat_messages to authenticated;
grant insert (id, channel, user_id, body) on public.chat_messages to authenticated;
grant delete on public.chat_messages to authenticated;
/* 非表示（管理者・編集者）。誰がいつ隠したかはトリガーが入れる */
grant update (hidden_at) on public.chat_messages to authenticated;

alter table public.chat_messages enable row level security;

drop policy if exists chat_messages_read on public.chat_messages;
create policy chat_messages_read on public.chat_messages
  for select to authenticated
  using (hidden_at is null or public.is_manager());

drop policy if exists chat_messages_insert_own on public.chat_messages;
create policy chat_messages_insert_own on public.chat_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.driver_profiles d
      where d.user_id = auth.uid() and d.status <> 'blocked' and not d.chat_muted
    )
  );

/* 自分の書き込みは消せる。管理者・編集者は消さずに「非表示」を使う */
drop policy if exists chat_messages_delete_own on public.chat_messages;
create policy chat_messages_delete_own on public.chat_messages
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists chat_messages_hide on public.chat_messages;
create policy chat_messages_hide on public.chat_messages
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

/* 非表示にした・戻したことを操作履歴へ（会員の書き込みそのものは残さない） */
drop trigger if exists chat_messages_audit on public.chat_messages;
create trigger chat_messages_audit
  after update on public.chat_messages
  for each row execute function public.record_audit();

-- -----------------------------------------------------------------------------
-- 2. 通報
-- -----------------------------------------------------------------------------
create table if not exists public.chat_reports (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.chat_messages (id) on delete cascade,
  reporter_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason       text check (reason is null or char_length(reason) <= 200),
  /* open … 未対応　done … 対応済み（非表示にした／問題なしと判断した） */
  state        text not null default 'open' check (state in ('open', 'done')),
  created_at   timestamptz not null default now(),
  unique (message_id, reporter_id)
);

create index if not exists chat_reports_open_idx on public.chat_reports (state, created_at);

revoke all on public.chat_reports from anon, authenticated;
grant insert (message_id, reporter_id, reason) on public.chat_reports to authenticated;
grant select on public.chat_reports to authenticated;
grant update (state) on public.chat_reports to authenticated;

alter table public.chat_reports enable row level security;

/* 他人の書き込みだけを、本人の名前で通報できる */
drop policy if exists chat_reports_insert on public.chat_reports;
create policy chat_reports_insert on public.chat_reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and exists (
      select 1 from public.chat_messages m
      where m.id = message_id and m.user_id <> auth.uid()
    )
  );

/* 通報を読む・片付けるのは管理者・編集者だけ（誰が通報したかを会員に見せない） */
drop policy if exists chat_reports_read on public.chat_reports;
create policy chat_reports_read on public.chat_reports
  for select to authenticated
  using (public.is_manager());

drop policy if exists chat_reports_update on public.chat_reports;
create policy chat_reports_update on public.chat_reports
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- -----------------------------------------------------------------------------
-- 3. 読む（名前つき）
--
--   会員は、ほかの会員の名簿（driver_profiles）を読めない。名前を添えて
--   返すため、ここでまとめる。返すのは本文・時刻・表示名・顔写真の置き場所・
--   自分の書き込みか、だけ。
--
--   戻り値
--     { "messages": [ { "id", "body", "created_at", "mine", "name", "avatar_path" }, … ]  ← 新しい順
--       "me": { "can_post": true, "muted": false, "blocked": false, "has_name": true } }
-- -----------------------------------------------------------------------------
create or replace function public.chat_feed(
  p_channel text default 'general',
  p_before  timestamptz default null,
  p_limit   integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  prof   public.driver_profiles;
  result jsonb;
begin
  if me is null then
    raise exception 'ログインしていません';
  end if;

  select * into prof from public.driver_profiles where user_id = me;

  select jsonb_build_object(
    'messages', coalesce((
      select jsonb_agg(x order by x.created_at desc)
      from (
        select m.id, m.body, m.created_at,
               m.user_id = me as mine,
               nullif(btrim(d.display_name), '') as name,
               d.avatar_path
        from public.chat_messages m
        left join public.driver_profiles d on d.user_id = m.user_id
        where m.channel = coalesce(p_channel, 'general')
          and m.hidden_at is null
          and (p_before is null or m.created_at < p_before)
        order by m.created_at desc
        limit least(greatest(coalesce(p_limit, 50), 1), 100)
      ) x
    ), '[]'::jsonb),
    'me', jsonb_build_object(
      'can_post', prof.user_id is not null and prof.status <> 'blocked' and not prof.chat_muted,
      'muted', coalesce(prof.chat_muted, false),
      'blocked', coalesce(prof.status = 'blocked', false),
      'has_name', coalesce(btrim(prof.display_name), '') <> ''
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.chat_feed(text, timestamptz, integer) from public, anon;
grant execute on function public.chat_feed(text, timestamptz, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. 新しい書き込みをすぐ届ける（Supabase Realtime）
--
--   中身は届けない（行が増えたことだけを合図にし、アプリが chat_feed で
--   読み直す）。手元の検証用データベースには配信の仕組みが無いため、
--   あるときだけ足す。
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.chat_messages;
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;

notify pgrst, 'reload schema';
