-- =============================================================================
-- チャット：書き込みに画像を1枚添える
-- =============================================================================
--
-- ご指示（2026-11-08「チャットに画像を添えられるように」）。
--
-- **1件に1枚。** 文だけ・画像だけ・文と画像、のどれでも書ける。
--   何枚も送りたいときは、続けて書き込む（連投の制限はそのまま効く）。
--
-- **置き場所は非公開**（chat-images）。
--   チャットは会員だけが読む場所で、運営が非表示にした書き込みは会員に
--   見せない。公開の置き場所にすると、非表示にしたあとも道筋を知っている人には
--   画像が見え、会員でない人にも渡ってしまう。
--   アプリは、読めるときだけ期限つきの URL（1時間）をもらって出す。
--
-- **読める画像は、読める書き込みの画像だけ**（データベースが決める）
--   * 会員 … 隠されておらず、90日以内の書き込みの画像（chat_messages の読み取りの
--            決まりがそのまま効く）。自分が上げた画像は、いつでも読める
--   * 管理者・編集者 … すべて（見張りのため）
--
-- **道筋は `<自分のid>/<書き込みのid>.jpg` に決める。**
--   書き込みの id はアプリが決めて送る（情報提供の写真と同じ）。データベースは、
--   道筋がその書き込みの id と書いた本人の id でできているかを確かめる。
--   他人の画像や、隠された書き込みの画像を、別の書き込みに付け直して見せる
--   ことはできない。
--
-- **画像には必ず「要確認」の旗を立てる**（image）。画像の中身はデータベースが
--   読めない。顔や車の番号が写っていないかは、職員が目で確かめる。
--
-- **1日に20枚まで**（文の連投の制限とは別に）。置き場所の容量を守るため。
--   アプリは送る前に長いほうの辺を 1280px へ縮める（1枚 100〜300KB）。
--
-- **消した書き込みの画像は、あとで置き場所からも消す。**
--   データベースの関数からは置き場所のファイルを消せない（Supabase の決まり）。
--   書き込みが消えたら（本人が消した・1年を過ぎた・退会した）道筋を
--   chat_image_trash へ控え、管理画面を開いたときにまとめて消す。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 書き込みに画像の列を足す
-- -----------------------------------------------------------------------------
alter table public.chat_messages
  add column if not exists image_path   text,
  add column if not exists image_width  integer,
  add column if not exists image_height integer;

comment on column public.chat_messages.image_path is
  '添えた画像の道筋（chat-images バケットの中。<書いた人のid>/<書き込みのid>.jpg）。無ければ null';

/* 文は空でもよい（画像があるとき）。上限は 500字のまま */
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages drop constraint if exists chat_messages_content_check;
alter table public.chat_messages add constraint chat_messages_content_check check (
  char_length(btrim(body)) <= 500
  and (char_length(btrim(body)) >= 1 or image_path is not null)
);

alter table public.chat_messages drop constraint if exists chat_messages_image_check;
alter table public.chat_messages add constraint chat_messages_image_check check (
  (image_path is null and image_width is null and image_height is null)
  or (
    image_path = user_id::text || '/' || id::text || '.jpg'
    and image_width between 1 and 4096
    and image_height between 1 and 4096
  )
);

/* 置き場所の決まり（下）が、道筋から書き込みを引くため */
create index if not exists chat_messages_image_idx
  on public.chat_messages (image_path)
  where image_path is not null;

grant select (image_path, image_width, image_height) on public.chat_messages to authenticated;
grant insert (image_path, image_width, image_height) on public.chat_messages to authenticated;

-- -----------------------------------------------------------------------------
-- 2. 連投の制限に「画像は1日に20枚まで」を足す
-- -----------------------------------------------------------------------------
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
  if new.image_path is not null
     and (select count(*) from public.chat_messages
           where user_id = new.user_id and image_path is not null
             and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'too_many_images'
      using hint = '画像は1日に20枚までです';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. 画像には「要確認」の旗（image）を立てる
-- -----------------------------------------------------------------------------
create or replace function public.flag_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.flags := public.chat_flags_of(new.body)
    || case when new.image_path is not null then array['image'] else '{}'::text[] end;
  new.flag_cleared_at := null;
  new.flag_cleared_by := null;
  return new;
end;
$$;

comment on column public.chat_messages.flags is
  '自動の旗（phone / email / url / plate / word / image）。会員には見せない';

-- -----------------------------------------------------------------------------
-- 4. 置き場所（非公開）
--
--   上限 2MB。アプリが縮めて送るので 300KB ほどに収まる。縮めずに原本を
--   送られても弾ける。形式は jpeg だけ（アプリが jpeg に描き直して送る。
--   描き直すときに、写真に埋め込まれた撮影位置なども落ちる）。
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
  置けるのは、書き込める会員が、自分の場所（chat-images/<自分のid>/…）にだけ。
  storage.foldername() ではなく split_part を使う（avatars と同じ理由。
  手元の検証用データベースに独自の関数が無い）。
*/
drop policy if exists "kurumayose_chat_image_insert" on storage.objects;
create policy "kurumayose_chat_image_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and split_part(name, '/', 1) = auth.uid()::text
    and exists (
      select 1 from public.driver_profiles d
      where d.user_id = auth.uid() and d.status <> 'blocked' and not d.chat_muted
    )
  );

/*
  読めるのは、自分の画像と、読める書き込みの画像。管理者・編集者はすべて。
  chat_messages を引くと、その表の読み取りの決まり（隠したもの・90日より前は
  会員に返さない）がそのまま効く。
  管理者・編集者に全部を読ませるのは、置き場所の削除が「読める行」しか
  消せないため（20260828000001）。書き込みに付かなかった画像も消せるようにする。
*/
drop policy if exists "kurumayose_chat_image_read" on storage.objects;
create policy "kurumayose_chat_image_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-images'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (select 1 from public.chat_messages m where m.image_path = objects.name)
      or public.is_manager()
    )
  );

/* 消せるのは本人（自分の書き込みを消したとき）と管理者・編集者 */
drop policy if exists "kurumayose_chat_image_delete" on storage.objects;
create policy "kurumayose_chat_image_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-images'
    and (split_part(name, '/', 1) = auth.uid()::text or public.is_manager())
  );

-- -----------------------------------------------------------------------------
-- 5. 消した書き込みの画像を控える（あとで置き場所から消す）
--
--   読むのも消すのも管理画面（service_role）だけ。会員にも職員の鍵にも渡さない。
-- -----------------------------------------------------------------------------
create table if not exists public.chat_image_trash (
  path        text primary key,
  created_at  timestamptz not null default now()
);
comment on table public.chat_image_trash is
  '消した書き込みの画像の道筋。管理画面を開いたときに、置き場所（chat-images）から消して行も消す';

revoke all on public.chat_image_trash from anon, authenticated;
alter table public.chat_image_trash enable row level security;

create or replace function public.trash_chat_image()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.image_path is not null then
    insert into public.chat_image_trash (path) values (old.image_path)
    on conflict (path) do nothing;
  end if;
  return old;
end;
$$;

drop trigger if exists chat_messages_trash_image on public.chat_messages;
create trigger chat_messages_trash_image
  after delete on public.chat_messages
  for each row execute function public.trash_chat_image();

-- -----------------------------------------------------------------------------
-- 6. 読む関数が、画像の道筋と縦横を返すようにする
--
--   引数は変えない（20261008000001 と同じ5つ）。足したのは image_path・
--   image_width・image_height だけ。
-- -----------------------------------------------------------------------------
create or replace function public.chat_feed(
  p_channel text default 'general',
  p_before  timestamptz default null,
  p_limit   integer default 50,
  p_days    integer default null,
  p_min     integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  prof      public.driver_profiles;
  floor_at  timestamptz := now() - interval '90 days';
  anchor    timestamptz := coalesce(p_before, now() + interval '1 minute');
  lim       integer := least(greatest(coalesce(p_limit, 50), 1), 300);
  keep_min  integer := greatest(coalesce(p_min, 20), 0);
  since     timestamptz;
  picked    jsonb;
  oldest    timestamptz;
  has_more  boolean;
begin
  if me is null then
    raise exception 'ログインしていません';
  end if;

  select * into prof from public.driver_profiles where user_id = me;

  /* 日数で区切るときの境目（読む位置から p_days 日前） */
  if p_days is not null then
    since := coalesce(p_before, now()) - make_interval(days => greatest(p_days, 1));
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) - 'rn' order by x.created_at desc), '[]'::jsonb),
         min(x.created_at)
    into picked, oldest
  from (
    select m.id, m.body, m.created_at,
           m.user_id = me as mine,
           nullif(btrim(d.display_name), '') as name,
           d.avatar_path,
           public.chat_key(m.user_id) as author,
           m.image_path, m.image_width, m.image_height,
           row_number() over (order by m.created_at desc) as rn
    from public.chat_messages m
    left join public.driver_profiles d on d.user_id = m.user_id
    where m.channel = coalesce(p_channel, 'general')
      and m.hidden_at is null
      and m.created_at > floor_at
      and m.created_at < anchor
    order by m.created_at desc
    limit lim
  ) x
  where since is null or x.rn <= keep_min or x.created_at >= since;

  has_more := oldest is not null and exists (
    select 1 from public.chat_messages m
    where m.channel = coalesce(p_channel, 'general')
      and m.hidden_at is null
      and m.created_at > floor_at
      and m.created_at < oldest
  );

  return jsonb_build_object(
    'messages', picked,
    'more', has_more,
    'retention_days', 90,
    'me', jsonb_build_object(
      'can_post', prof.user_id is not null and prof.status <> 'blocked' and not prof.chat_muted,
      'muted', coalesce(prof.chat_muted, false),
      'blocked', coalesce(prof.status = 'blocked', false),
      'has_name', coalesce(btrim(prof.display_name), '') <> '',
      'key', public.chat_key(me)
    )
  );
end;
$$;

revoke execute on function public.chat_feed(text, timestamptz, integer, integer, integer) from public, anon;
grant execute on function public.chat_feed(text, timestamptz, integer, integer, integer) to authenticated;

notify pgrst, 'reload schema';
