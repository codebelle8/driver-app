-- =============================================================================
-- カテゴリ初期データ
-- =============================================================================
-- 表示順は「まずは主要ホテル、有名レジデンス等を進めたい」というご要望
-- (2026-08-07 上野様) を反映し、ホテル・レジデンスを先頭に配置している。
--
-- code_prefix は施設コード (例: HTL-0001) の採番と、
-- 写真ファイル名の命名規則に使用する。後から変更すると
-- 入稿済みファイルとの対応が崩れるため、確定後は変更しないこと。
-- =============================================================================

insert into public.categories (code, name, code_prefix, sort_order, is_active) values
  ('hotel',      'ホテル',       'HTL', 10, true),
  ('residence',  'レジデンス',   'RSD', 20, true),
  ('commercial', '商業施設',     'CML', 30, true),
  ('office',     'オフィスビル', 'OFC', 40, true),
  ('hospital',   '病院',         'HSP', 50, true),
  ('station',    '駅・空港',     'STN', 60, true)
on conflict (code) do update
  set name        = excluded.name,
      code_prefix = excluded.code_prefix,
      sort_order  = excluded.sort_order,
      is_active   = excluded.is_active;
