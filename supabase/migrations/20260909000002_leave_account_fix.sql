-- =============================================================================
-- 退会：顔写真の消し方を直す
-- =============================================================================
--
-- 何が起きていたか:
--   20260909000001 の中で、顔写真の実体を
--
--     delete from storage.objects where bucket_id = 'avatars' and ...
--
--   で消していた。**Supabase はこれを禁じている。**
--
--     42501: Direct deletion from storage tables is not allowed.
--            Use the Storage API instead.
--
--   security definer で権限を借りていても通らない。仕組みとして
--   止められている（置き場所の実体と表が食い違うのを防ぐため）。
--   結果、退会そのものが 403 で失敗していた。
--
--   手元の検証用データベースには storage の仕掛けが無く、当てても
--   通ってしまう。**本番で呼んで初めて分かった。**
--
-- 直し方:
--   顔写真はアプリ側で Storage API を使って先に消し、そのあとで
--   この関数を呼ぶ（app/src/lib/account.ts）。ここでは auth.users だけを
--   消す。driver_profiles などは外部キーの連鎖で一緒に消える。
--
--   万一こちらだけが実行されても、残るのは持ち主の分からない画像
--   1枚で、他人から辿れる道は無い（道筋は利用者 id + でたらめな名前）。
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
    顔写真の実体は、ここでは消さない。

    storage の表を直に消すことは Supabase が禁じている。
    アプリ側が Storage API で先に消してから、ここへ来る。
  */

  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
