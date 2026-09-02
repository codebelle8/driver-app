-- 所有者のアカウントを、他の管理者から守る
--
-- **なぜ要るか**
--   admin_profiles_write_admin は「admin なら誰でも、どの行でも」更新・削除を許す。
--   つまり後から管理者になった人が、所有者のアカウントを停止したり
--   削除したりできてしまう。画面のボタンを隠しても、API を直接呼べば同じことができる。
--
--   締め出されると、復旧には Supabase の管理画面から SQL を実行するしかない。
--   ここで塞ぐのが、唯一「隠す」ではなく「できなくする」層にあたる。
--
-- **何を塞ぐか**
--   削除、停止 (is_active)、役割の変更 (role) の3つ。
--   役割も塞ぐのは、管理者から降格させてから消す、という順序を防ぐため。
--   表示名の変更は通す。実害がない。
--
-- **service_role でも通らない**
--   auth.users を消すと admin_profiles へ連鎖するが、その連鎖もここで止まる。
--   所有者ご自身が本当に削除される場合は、このトリガーを外してから行う。

create or replace function public.protect_owner_account()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  -- 所有者。クライアント様のご指示により固定する（2026-08-30）
  owner_email constant text := 'aprofessional0575@gmail.com';
  target_email text;
begin
  select u.email into target_email
    from auth.users u
   where u.id = coalesce(old.user_id, new.user_id);

  -- 所有者以外は、これまでどおり
  if target_email is distinct from owner_email then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception '所有者のアカウントは削除できません';
  end if;

  if new.role is distinct from old.role then
    raise exception '所有者のアカウントの役割は変更できません';
  end if;

  if new.is_active is distinct from old.is_active then
    raise exception '所有者のアカウントは停止できません';
  end if;

  return new;
end;
$$;

drop trigger if exists admin_profiles_protect_owner on public.admin_profiles;

create trigger admin_profiles_protect_owner
  before update or delete on public.admin_profiles
  for each row execute function public.protect_owner_account();

comment on function public.protect_owner_account() is
  '所有者のアカウントの削除・停止・降格を拒む。画面と Server Action の手前で効く最後の層。';
