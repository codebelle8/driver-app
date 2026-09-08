-- =============================================================================
-- 退会（ご本人によるアカウントの削除）
-- =============================================================================
--
-- 背景:
--   会員がご自分でアカウントを消せなかった。ダッシュボードからしか消せず、
--   お預かりしているもの（メールアドレス・顔写真・お気に入り・履歴）を
--   ご本人の意思で消す道が無い。
--
-- **なぜ関数にするか**
--   auth.users を消すには、会員に渡せない権限が要る。かといって
--   管理画面へお願いする形にすると、退会だけ人手を挟むことになる。
--   自分自身しか消せない関数を1つ置き、その中でだけ権限を借りる。
--
-- **消えるもの**
--   auth.users を消すと、外部キーの連鎖で次が一緒に消える。
--     driver_profiles / driver_favorites / driver_history
--   顔写真の実体は Storage にあり、連鎖では消えない。ここで明示的に消す。
--
-- **管理画面のアカウントは消させない**
--   同じ利用者が管理画面と会員の両方に載っていることがある
--   （動作の確認などで）。ここから消すと管理画面へ入れなくなり、
--   誰も戻せない。弾いて、管理者にご相談いただく。
-- =============================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'ログインしていません';
  end if;

  /*
    管理画面の利用者は弾く。

    自分で自分を締め出すと、他の管理者に戻してもらうしかない。
    管理者が1人しかいなければ、戻せる人がいない。
  */
  if exists (select 1 from public.admin_profiles where user_id = me) then
    raise exception '管理画面のアカウントは、この画面からは削除できません';
  end if;

  /*
    顔写真の実体。

    外部キーの連鎖では消えない。名簿だけ消して実体を残すと、
    誰のものとも分からない画像が置き場所に溜まり続ける。
  */
  delete from storage.objects
   where bucket_id = 'avatars'
     and split_part(name, '/', 1) = me::text;

  /* 本体。driver_profiles などは on delete cascade で一緒に消える。 */
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
