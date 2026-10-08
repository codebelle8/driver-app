-- =============================================================================
-- チャット：90日で会員の画面から外す・10日ずつ読む・未確認・自動の旗
-- =============================================================================
--
-- ご指示（2026-10-08）
--   * 書き込みは、90日を過ぎたら会員の画面から外す
--   * 一度に90日ぶんを出さない。最初は10日ぶん、上へスクロールしたら前を取りに行く
--   * 管理画面 ①「未確認」だけを出す ② 怪しい書き込みに自動で旗を立てる
--
-- **線引きはデータベースで行う。** アプリで隠すだけだと、アプリを通さずに
--   読めば古い書き込みも見える。読む関数（chat_feed）と表の読み取りの決まり
--   （RLS）の両方で、会員には90日より前を返さない。管理者・編集者は見張りと
--   記録のため、引き続き読める（消してはいない）。
--
-- **10日ずつ読む。** chat_feed に「何日ぶん」（p_days）と「少なくとも何件」
--   （p_min）を足した。10日のあいだに書き込みが少なくても画面が空にならない
--   よう、少なくとも20件は返す。多すぎるとき（上限300件）は、続きをスクロールで
--   読む。さらに前があるか（more）も返す（90日の線まで来たら false）。
--   これまでの呼び方（3つの引数）は、そのまま同じ動き（＋90日の線）になる。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 会員は、90日より前の書き込みを読めない（表を直に読んでも）
-- -----------------------------------------------------------------------------
drop policy if exists chat_messages_read on public.chat_messages;
create policy chat_messages_read on public.chat_messages
  for select to authenticated
  using (
    (hidden_at is null and created_at > now() - interval '90 days')
    or public.is_manager()
  );

-- -----------------------------------------------------------------------------
-- 2. 自動の旗
--
--   書き込まれたときに、データベースが本文を見て旗を立てる（アプリでは見ない。
--   どこから書いても同じに効く）。旗は「職員が見るべき」という印で、書き込みを
--   止めたり隠したりはしない。会員には旗の列を見せない。
--
--     phone … 電話番号らしきもの（0 から始まる10〜11桁。全角・ハイフン・空白も）
--     email … メールアドレス
--     url   … URL（http・www・よくある末尾 .com / .jp など）
--     plate … 車の番号らしきもの（ひらがな＋「12-34」の形）
--     word  … サイト設定の「気をつける言葉」を含む
--
--   旗を下ろす（問題なし）のは管理者・編集者。誰がいつ下ろしたかはデータベースが入れる。
-- -----------------------------------------------------------------------------
alter table public.site_settings
  add column if not exists chat_flag_words text[] not null default array[
    '死ね', 'しね', '殺す', 'ころす', '消えろ', 'きえろ',
    'バカ', 'ばか', '馬鹿', 'アホ', 'あほ', 'クズ', 'カス', 'ゴミ', 'きもい', 'キモい',
    '詐欺', '副業', '稼げる', 'LINE', 'ライン'
  ];
comment on column public.site_settings.chat_flag_words is
  'チャットで「要確認」の旗を立てる言葉。含まれていても書き込みは止めない（職員が見る）';
grant update (chat_flag_words) on public.site_settings to authenticated;

alter table public.chat_messages
  add column if not exists flags text[] not null default '{}',
  add column if not exists flag_cleared_at timestamptz,
  add column if not exists flag_cleared_by uuid references auth.users (id) on delete set null;
comment on column public.chat_messages.flags is
  '自動の旗（phone / email / url / plate / word）。会員には見せない';

/* 要確認（旗が立っていて、まだ下ろしておらず、隠してもいないもの）を早く引く */
create index if not exists chat_messages_flagged_idx
  on public.chat_messages (created_at)
  where cardinality(flags) > 0 and flag_cleared_at is null and hidden_at is null;

create or replace function public.chat_flags_of(p_body text)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  /* 全角の数字・記号を半角へ。電話番号やメールアドレスを全角で書かれても拾う */
  n      text := translate(coalesce(p_body, ''),
                  '０１２３４５６７８９－ー―‐＠．：／',
                  '0123456789----@.:/');
  digits text;
  nomail text;
  words  text[];
  w      text;
  f      text[] := '{}';
begin
  /* 電話番号：区切り（ハイフン・空白）を除いて、0 から始まる10〜11桁 */
  digits := regexp_replace(n, '[-[:space:]()（）]', '', 'g');
  if digits ~ '(^|[^0-9])0[0-9]{9,10}([^0-9]|$)' then f := array_append(f, 'phone'); end if;

  if n ~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+' then f := array_append(f, 'email'); end if;

  /* URL は、メールアドレスを除いた文で見る（「…@example.co.jp」の後ろを URL と数えない） */
  nomail := regexp_replace(n, '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+', '', 'gi');
  if nomail ~* '(https?://|www\.)' or nomail ~* '[a-z0-9-]+\.(com|net|org|jp|io|me|info|biz|xyz|ly)([^a-z0-9]|$)' then
    f := array_append(f, 'url');
  end if;

  /* 「500 さ 12-34」の形か、「さ12-34」の形。「から10-12時」のような時刻の範囲は除く */
  if n ~ '[0-9]{2,3}[[:space:]]*[ぁ-ゖ][[:space:]]*[0-9]{1,2}-?[0-9]{2}'
     or n ~ '[ぁ-ゖ][[:space:]]*[0-9]{2}-[0-9]{2}([^0-9時分]|$)' then
    f := array_append(f, 'plate');
  end if;

  select chat_flag_words into words from public.site_settings where id = 1;
  foreach w in array coalesce(words, '{}') loop
    if btrim(w) <> '' and position(lower(btrim(w)) in lower(n)) > 0 then
      f := array_append(f, 'word');
      exit;
    end if;
  end loop;

  return f;
end;
$$;

revoke execute on function public.chat_flags_of(text) from public, anon, authenticated;

create or replace function public.flag_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.flags := public.chat_flags_of(new.body);
  new.flag_cleared_at := null;
  new.flag_cleared_by := null;
  return new;
end;
$$;

drop trigger if exists chat_messages_flag on public.chat_messages;
create trigger chat_messages_flag
  before insert on public.chat_messages
  for each row execute function public.flag_chat_message();

/*
  これまでの書き込みにも旗を立てておく（見張りの最初の一覧に出すため）。
  旗を書き換えさせない仕掛け（下）より先に行う。操作履歴の記録は止める
  （書き込みの数だけ「変更」が記録されてしまう。職員の操作ではない）。
*/
alter table public.chat_messages disable trigger chat_messages_audit;
update public.chat_messages
   set flags = public.chat_flags_of(body)
 where cardinality(flags) = 0;
alter table public.chat_messages enable trigger chat_messages_audit;

/* 旗を下ろした人と日時は、データベースが入れる（画面から渡させない） */
create or replace function public.stamp_chat_flag_cleared()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.flag_cleared_at is distinct from old.flag_cleared_at then
    if new.flag_cleared_at is null then
      new.flag_cleared_by := null;
    else
      new.flag_cleared_at := now();
      new.flag_cleared_by := auth.uid();
    end if;
  else
    new.flag_cleared_by := old.flag_cleared_by;
  end if;
  /* 旗そのものは書き換えさせない（データベースが本文から決める） */
  new.flags := old.flags;
  return new;
end;
$$;

drop trigger if exists chat_messages_stamp_flag on public.chat_messages;
create trigger chat_messages_stamp_flag
  before update on public.chat_messages
  for each row execute function public.stamp_chat_flag_cleared();

/* 旗を下ろす（管理者・編集者。chat_messages_hide の決まりがそのまま効く） */
grant update (flag_cleared_at) on public.chat_messages to authenticated;

-- -----------------------------------------------------------------------------
-- 3. 未確認（「ここまで確認した」の印。職員で1つを共有する）
--
--   印より新しい書き込みが「未確認」。だれか1人が確認すれば、ほかの職員の
--   画面からも消える（同じ書き込みを何人もが読まない）。
--   印は、画面に出ていたいちばん新しい書き込みの時刻まで進める（押した時刻
--   ではない）。画面を開いてから押すまでに来た書き込みを、読まずに確認済みに
--   しないため。
-- -----------------------------------------------------------------------------
create table if not exists public.chat_review_state (
  id             smallint primary key default 1 check (id = 1),
  checked_until  timestamptz,
  checked_by     uuid references auth.users (id) on delete set null,
  checked_at     timestamptz
);
comment on table public.chat_review_state is
  'チャットの見張りの「ここまで確認した」の印（職員で共有）。checked_until より新しい書き込みが未確認';

insert into public.chat_review_state (id) values (1) on conflict (id) do nothing;

revoke all on public.chat_review_state from anon, authenticated;
grant select on public.chat_review_state to authenticated;
alter table public.chat_review_state enable row level security;
drop policy if exists chat_review_state_read on public.chat_review_state;
create policy chat_review_state_read on public.chat_review_state
  for select to authenticated
  using (public.is_manager());

create or replace function public.chat_mark_checked(p_until timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  next_until timestamptz;
begin
  /*
    is_manager() は、職員でない方には false ではなく null を返す（役割が無いため）。
    「not null」は null で、if を素通りしてしまう。null も「職員でない」として扱う。
  */
  if not coalesce(public.is_manager(), false) then
    raise exception '管理者・編集者だけが行えます' using errcode = '42501';
  end if;
  /* 先へ進めるだけ（戻さない）。未来の時刻にはしない */
  update public.chat_review_state
     set checked_until = greatest(coalesce(checked_until, '-infinity'::timestamptz), least(p_until, now())),
         checked_by = auth.uid(),
         checked_at = now()
   where id = 1
  returning checked_until into next_until;
  return next_until;
end;
$$;

revoke execute on function public.chat_mark_checked(timestamptz) from public, anon;
grant execute on function public.chat_mark_checked(timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. 読む（10日ずつ・90日まで）
--
--   引数を足すため、いまの関数を外してから作り直す（同じ名前で引数違いを
--   並べると、呼び出しがどちらか決まらなくなる）。
--
--     p_before … この時刻より前を読む（無ければ、いちばん新しいものから）
--     p_limit  … 上限（既定50・最大300）
--     p_days   … 何日ぶんか（無ければ件数だけで区切る ＝ これまでの動き）
--     p_min    … 日数で区切っても、少なくともこの件数は返す（既定20）
--
--   戻り値に足したもの
--     more            … さらに前（90日の線まで）に書き込みがあるか
--     retention_days  … 会員の画面に残す日数（90）
-- -----------------------------------------------------------------------------
drop function if exists public.chat_feed(text, timestamptz, integer);

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
