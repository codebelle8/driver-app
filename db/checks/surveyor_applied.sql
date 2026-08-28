-- =============================================================================
-- 調査員の権限分離が適用されているかを確認する
-- =============================================================================
--
-- Supabase ダッシュボード → SQL Editor に貼り付けて実行する。
-- 適用が成功していれば、すべての行の「判定」が OK になる。
--
-- 読み取りだけを行うため、何度実行しても安全。
-- =============================================================================

with expected as (
  select * from (values
    ('1. 役割',        3,  'admin / editor / surveyor の3種類'),
    ('2. 判定関数',    5,  'is_manager など5つ'),
    ('3. 監査トリガ',  6,  '施設・進入口・注意事項・写真・カテゴリ・アカウント'),
    -- 施設2（追加・更新）＋ 進入口3・注意事項3・写真3（追加・更新・削除）
    ('4. 調査員規則', 11,  '調査員向けの行レベル規則'),
    ('5. 旧規則の除去', 0, '全操作を許していた古い規則が残っていないこと')
  ) as t(項目, 期待値, 説明)
),
actual as (
  select '1. 役割' as 項目, count(*)::int as 実際
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
   where t.typname = 'admin_role'

  union all
  select '2. 判定関数', count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('is_manager', 'is_surveyor', 'facility_is_editable',
                       'entry_point_is_editable', 'photo_is_editable')

  union all
  select '3. 監査トリガ', count(*)::int
    from pg_trigger
   where not tgisinternal
     and tgname like '%\_audit'

  union all
  select '4. 調査員規則', count(*)::int
    from pg_policies
   where schemaname = 'public'
     and policyname like '%surveyor%'

  union all
  select '5. 旧規則の除去', count(*)::int
    from pg_policies
   where schemaname = 'public'
     and policyname in ('facilities_write_staff', 'entry_points_write_staff',
                        'cautions_write_staff', 'photos_write_staff',
                        'categories_write_staff', 'catalog_snapshots_write_staff')
)
select
  e.項目,
  e.説明,
  e.期待値,
  a.実際,
  case when a.実際 = e.期待値 then 'OK' else '★要確認' end as 判定
from expected e
join actual a using (項目)
order by e.項目;
