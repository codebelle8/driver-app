-- =============================================================================
-- チャット：オンライン状態の表示に使う「書いた人の目印」
-- =============================================================================
--
-- ご指示（2026-10-06）「チャットで、アイコンの横にオンライン状態を出す」。
--
-- **オンラインかどうかは、データベースに書かない。** アプリを開いている方が
-- Supabase Realtime の Presence（その場の出席簿）に名乗り、閉じれば消える。
-- 表を作らないので、記録も残らない。
--
-- ここで足すのは、**出席簿の名前と書き込みを結びつける目印**だけ。
--   会員の id そのものは出さない（ほかの記録と結びつけられる）。
--   id から作った別の文字列（chat_key）を使う。同じ方なら常に同じ値で、
--   値から id へは戻せない。
--
--   chat_feed の戻り値に足すもの
--     messages[].author … 書いた方の目印
--     me.key            … 自分の目印（出席簿に名乗るときに使う）
-- =============================================================================

create or replace function public.chat_key(p_user uuid)
returns text
language sql
immutable
as $$
  select md5('kurumayose-chat:' || p_user::text);
$$;

revoke execute on function public.chat_key(uuid) from public, anon, authenticated;

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
               d.avatar_path,
               public.chat_key(m.user_id) as author
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
      'has_name', coalesce(btrim(prof.display_name), '') <> '',
      'key', public.chat_key(me)
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.chat_feed(text, timestamptz, integer) from public, anon;
grant execute on function public.chat_feed(text, timestamptz, integer) to authenticated;

notify pgrst, 'reload schema';
