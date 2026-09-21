-- =============================================================================
-- お支払いいただいた期間の終わりを持つ
--
-- ご指示（2026-09-15）
--   お支払い済みでも、期間が過ぎたら無料期間の終わりと同じように
--   「お支払いが必要です」と出し、設定より先へ進めないようにする。
--
-- **これまで持っていなかった。**
--   名簿にあったのは trial_ends_at（無料期間の終わり）だけで、
--   「ご利用中」にすると**そのまま無期限に使えた。** 1か月ぶん払った方も
--   1年ぶん払った方も、画面上はまったく同じだった。
--   規約に「お選びの期間のご利用を開始します」と書く以上、実物が
--   その期間を持っていなければ話が合わない。
--
-- **いま「ご利用中」の方は、そのまま（null）にしておく。**
--   期限を勝手に決めると、お支払い済みの方を突然締めることになる。
--   null は「期限なし」として扱い、管理画面で「入金を確認した」を
--   押し直した時点で入る。管理画面には「期限なし」と出す。
-- =============================================================================

alter table public.driver_profiles
  add column if not exists paid_until timestamptz;

comment on column public.driver_profiles.paid_until is
  'お支払いいただいた期間の終わり。null は期限なし（この欄を設ける前からの方）。'
  '決めるのは管理画面の「入金を確認した」だけで、会員からは変えられない。';

/*
  会員からは変えられないことを、あらためて確かめておく。

  **剥がさない。** update の権限は列ごとに渡してあり、列を足しても
  その指定には含まれない。paid_until は最初から会員に渡っていない。

  ここで `revoke update ... from authenticated` と書くと、いま渡して
  ある列ごとの権限まで**まとめて消える。** 消えると、料金の刻みを
  選べなくなり（plan）、顔写真を変えられなくなり（avatar_path）、
  **別の端末でログインできなくなる**（device_id）。

  いま渡してある列を、そのまま置き直すだけにする。
    display_name    20260908000003
    avatar_path     20260908000004
    plan            20260908000004
    plan_chosen_at  20260908000004
    device_id       20260909000005

  status と trial_ends_at、そして paid_until は渡さない。
  **使えるかどうかを、会員自身が決められる状態にしない。**
*/
grant update (display_name, avatar_path, plan, plan_chosen_at, device_id)
  on public.driver_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 登録の関数を置き直す
--
--   戻り値の型が表そのもの（public.driver_profiles）なので、列を足すと
--   自動で含まれる。中身は変えていない。**それでも置き直す。**
--   20260908000004 で列を足したときも同じようにしてある。
--
--   置き直さないと、依存の型が古いまま残ることがあり、アプリが
--   paid_until を受け取れない。**受け取れなければ、期限は永遠に来ない。**
-- -----------------------------------------------------------------------------
create or replace function public.ensure_driver_profile()
returns public.driver_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.driver_profiles;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;

  insert into public.driver_profiles (user_id, trial_ends_at)
  values (auth.uid(), now() + interval '1 month')
  on conflict (user_id) do nothing;

  select * into me from public.driver_profiles where user_id = auth.uid();
  return me;
end;
$$;

revoke execute on function public.ensure_driver_profile() from public, anon;
grant execute on function public.ensure_driver_profile() to authenticated;

/* 表の形が変わったことを PostgREST へ伝える。伝えないと古い形のまま答える。 */
notify pgrst, 'reload schema';
