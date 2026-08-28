-- =============================================================================
-- 調査員の権限分離と、操作履歴の自動記録
-- =============================================================================
--
-- これまでの問題:
--   実データ(施設・進入口・注意事項・写真)の書き込みポリシーは、すべて
--   `for all using (is_staff())` の1本だけだった。is_staff() は admin と
--   editor の両方に真を返すため、editor は公開済みの施設を削除することも、
--   任意の施設を勝手に公開することもできた。
--
--   少数の管理者だけで運用する間は問題にならなかったが、現地調査を担当する
--   20名へ同じ権限を渡すことはできない。
--
-- 方針:
--   「公開済みのデータには触れさせない」を唯一の境界線とする。
--   調査員は下書きを自由に作れるが、公開された瞬間から読み取り専用になる。
--   細かく権限を刻まないのは、境界が複雑になるほど穴が生まれるため。
--
-- 補足:
--   PostgreSQL の許可ポリシーは OR で結合される。既存の緩いポリシーを残した
--   まま厳しいポリシーを足しても効果がないため、必ず drop してから作り直す。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 役割の判定
-- -----------------------------------------------------------------------------

/** 公開・削除を行える者（管理者または編集者） */
create or replace function public.is_manager()
returns boolean
language sql
stable
set search_path = public
as $$
  select public.current_admin_role() in ('admin', 'editor');
$$;

/** 現地調査担当。下書きのみ扱える。 */
create or replace function public.is_surveyor()
returns boolean
language sql
stable
set search_path = public
as $$
  select public.current_admin_role() = 'surveyor';
$$;

comment on function public.is_manager() is
  '公開・削除の権限を持つか。調査員には偽を返す。';

-- -----------------------------------------------------------------------------
-- 「調査員が触れてよいか」の判定
--
-- 進入口・注意事項・写真は、それ自体に公開状態を持たない。親をたどって
-- 施設の公開状態を見る必要があるため、判定を関数へ切り出す。
-- -----------------------------------------------------------------------------

/** その施設が未公開か（＝調査員が編集してよいか） */
create or replace function public.facility_is_editable(p_facility_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.facilities f
     where f.id = p_facility_id
       and f.status <> 'published'
  );
$$;

/** その進入口の属する施設が未公開か */
create or replace function public.entry_point_is_editable(p_entry_point_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.entry_points ep
      join public.facilities f on f.id = ep.facility_id
     where ep.id = p_entry_point_id
       and f.status <> 'published'
  );
$$;

/** 写真は施設か進入口のどちらか一方に紐づく。紐づく先の公開状態を見る。 */
create or replace function public.photo_is_editable(
  p_facility_id uuid,
  p_entry_point_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_facility_id is not null then public.facility_is_editable(p_facility_id)
    when p_entry_point_id is not null then public.entry_point_is_editable(p_entry_point_id)
    else false
  end;
$$;

-- -----------------------------------------------------------------------------
-- カテゴリ — 調査員は変更できない
--
-- カテゴリは全施設の分類体系そのもので、1つ消すと施設の参照が壊れる。
-- 現地調査の作業では触る必要がないため、管理者・編集者に限定する。
-- -----------------------------------------------------------------------------
drop policy if exists categories_write_staff on public.categories;

create policy categories_write_manager on public.categories
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- -----------------------------------------------------------------------------
-- 施設
-- -----------------------------------------------------------------------------
drop policy if exists facilities_write_staff on public.facilities;

create policy facilities_write_manager on public.facilities
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- 調査員が作る施設は必ず下書きから始まる
create policy facilities_insert_surveyor on public.facilities
  for insert to authenticated
  with check (public.is_surveyor() and status = 'draft');

-- 未公開の施設のみ編集できる。かつ、編集後も未公開でなければならない
-- （= 調査員は公開できない）
create policy facilities_update_surveyor on public.facilities
  for update to authenticated
  using (public.is_surveyor() and status <> 'published')
  with check (public.is_surveyor() and status <> 'published');

-- 削除のポリシーは作らない。ポリシーが無ければ拒否される。

-- -----------------------------------------------------------------------------
-- 進入口
-- -----------------------------------------------------------------------------
drop policy if exists entry_points_write_staff on public.entry_points;

create policy entry_points_write_manager on public.entry_points
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy entry_points_insert_surveyor on public.entry_points
  for insert to authenticated
  with check (public.is_surveyor() and public.facility_is_editable(facility_id));

create policy entry_points_update_surveyor on public.entry_points
  for update to authenticated
  using (public.is_surveyor() and public.facility_is_editable(facility_id))
  with check (public.is_surveyor() and public.facility_is_editable(facility_id));

-- 進入口は削除を許す。下書き作成中の作り直しが日常的に発生するため。
create policy entry_points_delete_surveyor on public.entry_points
  for delete to authenticated
  using (public.is_surveyor() and public.facility_is_editable(facility_id));

-- -----------------------------------------------------------------------------
-- 注意事項
-- -----------------------------------------------------------------------------
drop policy if exists cautions_write_staff on public.cautions;

create policy cautions_write_manager on public.cautions
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy cautions_insert_surveyor on public.cautions
  for insert to authenticated
  with check (public.is_surveyor() and public.entry_point_is_editable(entry_point_id));

create policy cautions_update_surveyor on public.cautions
  for update to authenticated
  using (public.is_surveyor() and public.entry_point_is_editable(entry_point_id))
  with check (public.is_surveyor() and public.entry_point_is_editable(entry_point_id));

create policy cautions_delete_surveyor on public.cautions
  for delete to authenticated
  using (public.is_surveyor() and public.entry_point_is_editable(entry_point_id));

-- -----------------------------------------------------------------------------
-- 写真
-- -----------------------------------------------------------------------------
drop policy if exists photos_write_staff on public.photos;

create policy photos_write_manager on public.photos
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy photos_insert_surveyor on public.photos
  for insert to authenticated
  with check (
    public.is_surveyor() and public.photo_is_editable(facility_id, entry_point_id)
  );

create policy photos_update_surveyor on public.photos
  for update to authenticated
  using (public.is_surveyor() and public.photo_is_editable(facility_id, entry_point_id))
  with check (
    public.is_surveyor() and public.photo_is_editable(facility_id, entry_point_id)
  );

create policy photos_delete_surveyor on public.photos
  for delete to authenticated
  using (public.is_surveyor() and public.photo_is_editable(facility_id, entry_point_id));

-- -----------------------------------------------------------------------------
-- 配信カタログ — 調査員は関与しない
-- -----------------------------------------------------------------------------
drop policy if exists catalog_snapshots_write_staff on public.catalog_snapshots;

create policy catalog_snapshots_write_manager on public.catalog_snapshots
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- -----------------------------------------------------------------------------
-- ストレージ
--
-- 写真の投入は調査員の主業務なので許可する。ただし削除は管理者・編集者のみ。
-- 誤って投入した写真は、データベース側の行を消せば一覧から消えるため、
-- 調査員が実体ファイルまで消せる必要はない。
-- -----------------------------------------------------------------------------
drop policy if exists "kurumayose_staff_delete" on storage.objects;

create policy "kurumayose_manager_delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('facility-photos', 'catalog') and public.is_manager());

-- 配信カタログの書き込みも管理者・編集者に限る
drop policy if exists "kurumayose_staff_insert" on storage.objects;

create policy "kurumayose_staff_insert" on storage.objects
  for insert to authenticated
  with check (
    (bucket_id = 'facility-photos' and public.is_staff())
    or (bucket_id = 'catalog' and public.is_manager())
  );

-- =============================================================================
-- 操作履歴の自動記録
--
-- audit_logs テーブルは当初から存在したが、書き込む仕組みが無く常に空だった。
-- 20名で運用するにあたり「誰がいつ何を変更したか」を追えないのは致命的なため、
-- ここでトリガを設ける。
--
-- 画面側の実装に頼らずトリガで記録する理由:
--   記録漏れを構造的に無くすため。画面から記録する方式では、一括取込や
--   将来追加する画面が記録を忘れた時点で履歴が信用できなくなる。
-- =============================================================================

create or replace function public.record_audit()
returns trigger
language plpgsql
-- security definer にする理由:
--   自分の操作の記録を、自分の権限で妨げられないようにするため。
security definer
set search_path = public
as $$
declare
  v_new       jsonb;
  v_old       jsonb;
  v_record_id uuid;
  v_diff      jsonb;
  v_action    text;
begin
  v_action := lower(tg_op);

  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;

  -- 主キーの列名は表によって異なる（admin_profiles は id ではなく user_id）。
  -- 列を直接参照すると表ごとに別のトリガ関数が必要になるため、
  -- jsonb へ変換してから拾う。
  v_record_id := coalesce(
    coalesce(v_new, v_old) ->> 'id',
    coalesce(v_new, v_old) ->> 'user_id'
  )::uuid;

  if tg_op = 'DELETE' then
    v_diff := v_old - 'updated_at' - 'search_text';

  elsif tg_op = 'INSERT' then
    -- 追加・削除は行全体を残す。ただし自動生成される列は除く。
    -- とくに search_text は検索用に正規化した長い文字列で、履歴としては
    -- 何の情報も持たないまま記録量だけを押し上げる。
    v_diff := v_new - 'updated_at' - 'search_text';

  else
    -- 変わった列だけを残す。全列を残すと、何が変わったのか読めない。
    v_diff := (
      select jsonb_object_agg(
               o.key,
               jsonb_build_object('before', o.value, 'after', n.value)
             )
        from jsonb_each(v_old) o
        join jsonb_each(v_new) n on n.key = o.key
       where o.value is distinct from n.value
    );

    -- 自動更新される列だけの変化は履歴に残さない（雑音になる）
    v_diff := v_diff - 'updated_at' - 'search_text';

    if v_diff is null or v_diff = '{}'::jsonb then
      return null;
    end if;

    -- 公開はとくに重要な操作なので、更新とは別の名前で記録する
    if tg_table_name = 'facilities' and v_diff ? 'status' then
      if v_diff -> 'status' ->> 'after' = 'published' then
        v_action := 'publish';
      end if;
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (auth.uid(), v_action, tg_table_name, v_record_id, v_diff);

  return null;  -- after トリガのため戻り値は使われない
end;
$$;

comment on function public.record_audit() is
  '実データの変更を audit_logs へ記録する。after トリガから呼ぶ。';

create trigger facilities_audit
  after insert or update or delete on public.facilities
  for each row execute function public.record_audit();

create trigger entry_points_audit
  after insert or update or delete on public.entry_points
  for each row execute function public.record_audit();

create trigger cautions_audit
  after insert or update or delete on public.cautions
  for each row execute function public.record_audit();

create trigger photos_audit
  after insert or update or delete on public.photos
  for each row execute function public.record_audit();

create trigger categories_audit
  after insert or update or delete on public.categories
  for each row execute function public.record_audit();

-- 誰に何の権限を与えたかも記録対象。アカウント管理そのものの監査になる。
create trigger admin_profiles_audit
  after insert or update or delete on public.admin_profiles
  for each row execute function public.record_audit();
