-- =============================================================================
-- 顔写真（アバター）と、料金の選択
-- =============================================================================
--
-- ご指示（2026-09-08）:
--   * アカウント管理で、お名前・パスワード・顔写真を変えられるようにする
--   * 無料期間（1か月）が切れたら、料金の案内を出し、1つ選ぶ形にする
--   * 料金は 月額 800円 と 年額 8,000円 の2つ
--
-- 金額をここに置かない理由:
--   2つしかなく、変えるたびに画面の文言も一緒に変わる。表に持たせると
--   「表の金額」と「画面の但し書き」がずれる余地ができる。
--   金額はアプリ側の1か所（app/src/lib/plans.ts）に置き、ここには
--   「どちらを選んだか」だけを残す。
--
-- **まだ課金はしていない。**
--   支払いの仕組み（決済業者）は未定で、支払者がドライバー個人か
--   事業者かも未回答（docs/12-phase2-design.md 2-1）。ここで記録するのは
--   「ご本人がどちらを選んだか」であって、支払い済みかどうかではない。
--   使えるかどうかは status が決める。plan では決まらない。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 名簿に列を足す
-- -----------------------------------------------------------------------------
alter table public.driver_profiles
  /*
    顔写真の置き場所（avatars バケットの中の道筋）。

    URL ではなく道筋を持つ。URL を持つと、置き場所を変えたときに
    全員ぶんの行を書き換えることになる。
  */
  add column avatar_path text,

  /*
    選んだ料金。まだ選んでいなければ null。

    'monthly' … 月額
    'yearly'  … 年額
  */
  add column plan text check (plan in ('monthly', 'yearly')),

  /* いつ選んだか。選び直したら更新する。 */
  add column plan_chosen_at timestamptz;

-- -----------------------------------------------------------------------------
-- 直せる列を渡し直す
--
--   20260908000003 で全部剥がしてある。**足す前に剥がす**という順番は
--   ここでも同じ。列を足しただけでは会員は書けない（既定の権限は
--   表を作った時点のもので、後から足した列には及ばない）。
--
--   status と trial_ends_at は渡さない。使えるかどうかを会員自身が
--   決められる状態にしない。
-- -----------------------------------------------------------------------------
grant update (display_name, avatar_path, plan, plan_chosen_at)
  on public.driver_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 顔写真の置き場所
--
--   公開バケットにしている。理由は施設の写真と同じで、署名付きの URL は
--   期限が切れるため、電波の届かない場所で持ち歩けない（20260808000001）。
--
--   道筋は「利用者の id / でたらめな名前」にする。他人の顔写真を
--   一覧する手立ては無く、名前を当てられない限り開けない。
--   **顔写真は本人しか見ない**（上部の帯と、アカウントの画面）。
--   他の会員へ見せる場面が出てきたら、その時点で見直す。
--
--   上限 2MB。顔写真にそれ以上は要らず、うっかり原本を上げても弾ける。
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
  読むのは誰でも。書けるのは本人の folder だけ。

  道筋の先頭（最初の / まで）が利用者の id と一致するときだけ通す。
  他人の場所へは置けない。

  storage.foldername() という Supabase 独自の関数もあるが、標準の
  split_part を使う。独自の関数は手元の検証用データベースに無く、
  当てて確かめられなくなる。実際にそれで一度止まった。
*/
drop policy if exists "kurumayose_avatar_read" on storage.objects;
create policy "kurumayose_avatar_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "kurumayose_avatar_insert" on storage.objects;
create policy "kurumayose_avatar_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "kurumayose_avatar_update" on storage.objects;
create policy "kurumayose_avatar_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "kurumayose_avatar_delete" on storage.objects;
create policy "kurumayose_avatar_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- 登録の関数を、足した列まで返すように作り直す
--
--   戻り値の型が表そのもの（public.driver_profiles）なので、列を足すと
--   自動で含まれる。関数の中身は変えていないが、依存の作り直しのために
--   置き直しておく。
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
