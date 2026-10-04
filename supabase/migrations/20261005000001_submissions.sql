-- =============================================================================
-- 情報提供（会員から施設の情報を受け付ける）
-- =============================================================================
--
-- ご依頼（2026-10-05「考えていたとおりに開発を進めて」）。
--
--   有料化のあと、情報提供の多い方（毎月の上位20名ほど）を翌月無料にする
--   （発注元のご回答 2026-10-04）。その「件数」を数える元がこの表。
--
-- **件数に数えるのは「採用」されたものだけ**（発注元への提案 2026-10-05）。
--   送った数で数えると、同じ内容のくり返しで上位に入れてしまう。
--   採用・不採用を決めるのは管理者・編集者（is_manager）。調査員は含めない。
--
-- **会員にできること**
--   * 自分の名前で送る（状態は必ず「審査待ち」で始まる）
--   * 自分の送ったものを読む
--   **書き換え・取り消しはできない。** 採用の判断のあとで中身が変わると、
--   何を採用したのかが分からなくなる。
--
-- **写真は非公開の置き場所に置く**（submissions）。
--   車寄せの写真には、人の顔やナンバーが写りうる。施設の写真
--   （facility-photos・公開）とは分け、送った本人と管理者・編集者だけが
--   読める。採用した写真を施設に載せるときは、職員が施設の写真として
--   あらためて入れる（これまでの手順どおり）。
--
-- **位置は、本人が「添える」を選んだときだけ**受け取る。
-- =============================================================================

create table if not exists public.submissions (
  id              uuid primary key default gen_random_uuid(),

  /* 送った会員。退会すると一緒に消える（delete_my_account が auth.users を消す） */
  user_id         uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,

  /*
    どの施設・入口についてか。

    施設が消えても行は残す（set null）。採用の件数は、その月の無料の
    判断に使う。施設を消したせいで、送った方の件数が減ってはいけない。
  */
  facility_id     uuid references public.facilities (id) on delete set null,
  entry_point_id  uuid references public.entry_points (id) on delete set null,

  /*
    種類（発注元への提案 2026-10-05）。

      wrong_place … 入口の位置が違う
      new_entry   … 新しい入口がある
      photo       … 写真を送る
      caution     … 注意事項（工事・時間帯の規制など）
      other       … その他
  */
  kind            text not null
                  check (kind in ('wrong_place', 'new_entry', 'photo', 'caution', 'other')),

  body            text not null
                  check (char_length(btrim(body)) between 1 and 1000),

  /* 写真の置き場所（submissions の中）。3枚まで */
  photo_paths     text[] not null default '{}'
                  check (cardinality(photo_paths) <= 3),

  /* 送ったときの位置（本人が添えた場合だけ）。片方だけは受け付けない */
  lat             double precision check (lat between -90 and 90),
  lng             double precision check (lng between -180 and 180),
  constraint submissions_latlng_pair check ((lat is null) = (lng is null)),

  /*
    審査の状態。

      pending  … 審査待ち（送られた直後は必ずこれ）
      accepted … 採用
      rejected … 不採用
  */
  status          text not null default 'pending'
                  check (status in ('pending', 'accepted', 'rejected')),

  /* 審査した日時と人。状態を変えたときに自動で入る（下のトリガー） */
  reviewed_at     timestamptz,
  reviewed_by     uuid references auth.users (id) on delete set null,

  /* 職員の覚え書き（会員には見せない） */
  review_note     text check (review_note is null or char_length(review_note) <= 500),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.submissions is
  '会員からの情報提供。件数に数えるのは採用（accepted）だけ。採用の月は reviewed_at で決める。';

/* 審査待ちの一覧（管理画面）と、月ごとの採用件数（翌月無料の判断）で引く */
create index if not exists submissions_status_created_idx
  on public.submissions (status, created_at desc);
create index if not exists submissions_user_created_idx
  on public.submissions (user_id, created_at desc);
create index if not exists submissions_accepted_idx
  on public.submissions (reviewed_at) where status = 'accepted';

drop trigger if exists submissions_set_updated_at on public.submissions;
create trigger submissions_set_updated_at
  before update on public.submissions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 審査の日時と人は、状態を変えたときにデータベースが入れる
--
--   画面から渡させると、日付をさかのぼって「先月の採用」にできてしまう。
--   採用の月は翌月無料の判断に使うため、ここで決める。
-- -----------------------------------------------------------------------------
create or replace function public.stamp_submission_review()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'pending' then
      new.reviewed_at := null;
      new.reviewed_by := null;
    else
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
    end if;
  else
    new.reviewed_at := old.reviewed_at;
    new.reviewed_by := old.reviewed_by;
  end if;
  return new;
end;
$$;

drop trigger if exists submissions_stamp_review on public.submissions;
create trigger submissions_stamp_review
  before update on public.submissions
  for each row execute function public.stamp_submission_review();

-- -----------------------------------------------------------------------------
-- 送りすぎを止める（1人につき24時間で20件まで）
--
--   いたずらや誤操作の連打で、審査の一覧が埋まらないように。現地で
--   まとめて送る方でも、1日20件あれば足りる。
-- -----------------------------------------------------------------------------
create or replace function public.limit_submissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
begin
  select count(*) into recent
  from public.submissions
  where user_id = new.user_id
    and created_at > now() - interval '24 hours';

  if recent >= 20 then
    raise exception 'too_many_submissions'
      using hint = '24時間に送れる情報は20件までです';
  end if;
  return new;
end;
$$;

drop trigger if exists submissions_limit on public.submissions;
create trigger submissions_limit
  before insert on public.submissions
  for each row execute function public.limit_submissions();

-- -----------------------------------------------------------------------------
-- 権限
--
--   新しい表は、既定で authenticated に一通りの権限が付く。いったん
--   すべて外し、要るものだけを渡す（admin_notices と同じ考え方）。
-- -----------------------------------------------------------------------------
revoke all on public.submissions from anon, authenticated;

/*
  読める列。**職員の覚え書き（review_note）と審査した人（reviewed_by）は渡さない。**
  本人は自分の行を読めるため、列ごと外しておかないと覚え書きが見える。
  管理画面は service_role で読むので、ここに無い列も読める。
*/
grant select (id, user_id, facility_id, entry_point_id, kind, body, photo_paths,
              lat, lng, status, reviewed_at, created_at, updated_at)
  on public.submissions to authenticated;
/*
  会員が送るときに書ける列だけ。状態・審査の列は書かせない。

  id は端末で決めてよい。写真を先に置き場所へ上げ、その道筋
  （<自分のid>/<この情報のid>_1.jpg）に同じ id を使うため。
*/
grant insert (id, user_id, facility_id, entry_point_id, kind, body, photo_paths, lat, lng)
  on public.submissions to authenticated;
/* 審査（管理者・編集者）。誰がいつ審査したかはトリガーが入れる */
grant update (status, review_note) on public.submissions to authenticated;

alter table public.submissions enable row level security;

/*
  送る。

  * 自分の名前でしか送れない
  * 止められている会員（blocked）は送れない
  * 写真は、自分の置き場所（submissions/<自分のid>/…）にあるものだけ
*/
drop policy if exists submissions_insert_own on public.submissions;
create policy submissions_insert_own on public.submissions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.driver_profiles d
      where d.user_id = auth.uid() and d.status <> 'blocked'
    )
    and not exists (
      select 1 from unnest(photo_paths) as p
      where split_part(p, '/', 1) <> auth.uid()::text
    )
  );

/* 読む。本人の分と、管理者・編集者はすべて */
drop policy if exists submissions_read on public.submissions;
create policy submissions_read on public.submissions
  for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

/* 審査。管理者・編集者だけ */
drop policy if exists submissions_review on public.submissions;
create policy submissions_review on public.submissions
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- -----------------------------------------------------------------------------
-- 操作履歴
--
--   審査（状態の変更）だけを記録する。会員が送ったこと自体は記録しない。
--   操作履歴は職員の操作の記録で、会員の投稿で埋まると読めなくなる。
-- -----------------------------------------------------------------------------
drop trigger if exists submissions_audit on public.submissions;
create trigger submissions_audit
  after update on public.submissions
  for each row execute function public.record_audit();

-- -----------------------------------------------------------------------------
-- 写真の置き場所（非公開）
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
  自分の置き場所（submissions/<自分のid>/…）にだけ置ける。読めるのは本人と
  管理者・編集者。消せるのも本人（退会のとき）と管理者・編集者。

  storage.foldername() ではなく split_part を使う（avatars と同じ理由。
  手元の検証用データベースに独自の関数が無い）。
*/
drop policy if exists "kurumayose_submission_insert" on storage.objects;
create policy "kurumayose_submission_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "kurumayose_submission_read" on storage.objects;
create policy "kurumayose_submission_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and (split_part(name, '/', 1) = auth.uid()::text or public.is_manager())
  );

drop policy if exists "kurumayose_submission_delete" on storage.objects;
create policy "kurumayose_submission_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'submissions'
    and (split_part(name, '/', 1) = auth.uid()::text or public.is_manager())
  );

notify pgrst, 'reload schema';
