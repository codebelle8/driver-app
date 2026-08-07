-- =============================================================================
-- スキーマ検証テスト
-- =============================================================================
--   psql -d kurumayose -v ON_ERROR_STOP=1 -f db/tests/0001_schema_tests.sql
--
-- 失敗した時点で例外を投げて停止する。最後まで到達すれば全件合格。
-- 検証内容: 制約 / 検索正規化 / 公開前バリデーション / RLS
-- =============================================================================

\set ON_ERROR_STOP on
-- 合格した検証項目を1行ずつ表示するため notice を出す
set client_min_messages to notice;

create or replace function pg_temp.assert(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not cond then
    raise exception 'FAILED: %', label;
  end if;
  raise notice 'ok  %', label;
end;
$$;

-- 例外を投げるはずの SQL を実行し、実際に投げたかを確認する
create or replace function pg_temp.assert_rejects(sql text, label text)
returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok  % (%)' , label, replace(split_part(sqlerrm, E'\n', 1), '"', '');
    return;
  end;
  raise exception 'FAILED: % — 拒否されるべき SQL が通ってしまった', label;
end;
$$;

begin;

-- =============================================================================
-- 1. 制約
-- =============================================================================
select pg_temp.assert_rejects($$
  insert into public.facilities (code, name, name_kana, category_id, prefecture, address_line)
  values ('bad-code', 'テスト', 'てすと',
          (select id from public.categories where code='hotel'), '東京都', 'テスト1-1')
$$, '施設コードの形式違反を拒否する');

select pg_temp.assert_rejects($$
  insert into public.facilities (code, name, name_kana, category_id, prefecture, address_line, lat, lng)
  values ('HTL-9999', 'テスト', 'てすと',
          (select id from public.categories where code='hotel'), '東京都', 'テスト1-1', 95.0, 139.0)
$$, '緯度の範囲外を拒否する');

-- =============================================================================
-- 2. 検索用文字列の正規化
-- =============================================================================
insert into public.facilities
  (code, name, name_kana, aliases, category_id, prefecture, city, address_line, summary, status)
values
  ('HTL-0001', 'グランドホテル汐留', 'グランドホテルシオドメ',
   array['汐留グランド','GHS'],
   (select id from public.categories where code='hotel'),
   '東京都', '港区', '東新橋1-8-2', '地上38階の大型シティホテル。', 'draft');

select pg_temp.assert(
  (select search_text like '%しおどめ%' from public.facilities where code='HTL-0001'),
  'カタカナがひらがなへ正規化される (シオドメ → しおどめ)');

select pg_temp.assert(
  (select search_text like '%ghs%' from public.facilities where code='HTL-0001'),
  '英字が小文字へ正規化される (GHS → ghs)');

select pg_temp.assert(
  exists (select 1 from public.facilities
           where search_text like '%' || public.normalize_search_text('汐留') || '%'),
  '漢字の部分一致で引ける (汐留 → グランドホテル汐留)');

select pg_temp.assert(
  exists (select 1 from public.facilities
           where search_text like '%' || public.normalize_search_text('シオドメ') || '%'),
  'カタカナ入力で引ける (検索語も同じ正規化を通す)');

select pg_temp.assert(
  exists (select 1 from public.facilities
           where search_text like '%' || public.normalize_search_text('東新橋') || '%'),
  '住所でも引ける');

-- =============================================================================
-- 3. 公開前バリデーション
-- =============================================================================
select pg_temp.assert(
  '有効な車寄せ・エントランスが1件も登録されていません'
    = any(public.validate_facility_for_publish(
            (select id from public.facilities where code='HTL-0001'))),
  '進入口が無い施設は公開不可と判定される');

insert into public.entry_points
  (facility_id, code, kind, name, approach_text, approach_from, nav_lat, nav_lng, is_roofed)
values
  ((select id from public.facilities where code='HTL-0001'), 'A', 'dropoff',
   '正面車寄せ（メインポーチ）',
   '海岸通り側から進入し、スロープを上がって2階レベルの車寄せへ。',
   '海岸通り（北行き）から', 35.6656, 139.7604, true);

select pg_temp.assert(
  array_length(public.validate_facility_for_publish(
    (select id from public.facilities where code='HTL-0001')), 1) = 1,
  '写真が無い進入口は公開不可と判定される（残り1件）');

insert into public.photos (entry_point_id, kind, storage_path, caption, is_placeholder)
values ((select id from public.entry_points where code='A'
           and facility_id=(select id from public.facilities where code='HTL-0001')),
        'dropoff', 'placeholder/dropoff.png', '正面車寄せ', true);

select pg_temp.assert(
  (select count(*) from unnest(public.validate_facility_for_publish(
     (select id from public.facilities where code='HTL-0001'))) p
    where p not like '［警告］%') = 0,
  '仮画像のみ残る状態は公開可能（警告どまり）');

select pg_temp.assert(
  exists (select 1 from unnest(public.validate_facility_for_publish(
            (select id from public.facilities where code='HTL-0001'))) p
           where p like '［警告］%'),
  '仮画像の残存は警告として報告される');

-- 座標が対で入っていないケース
select pg_temp.assert_rejects($$
  update public.entry_points set nav_lng = null
   where code='A' and facility_id=(select id from public.facilities where code='HTL-0001')
$$, 'ナビ座標を緯度のみにする更新を拒否する');

-- 案内図は1進入口につき1枚
insert into public.photos (entry_point_id, kind, storage_path, is_placeholder)
values ((select id from public.entry_points where code='A'
           and facility_id=(select id from public.facilities where code='HTL-0001')),
        'diagram', 'placeholder/diagram.png', true);

select pg_temp.assert_rejects($$
  insert into public.photos (entry_point_id, kind, storage_path, is_placeholder)
  values ((select id from public.entry_points where code='A'
             and facility_id=(select id from public.facilities where code='HTL-0001')),
          'diagram', 'placeholder/diagram2.png', true)
$$, '案内図の重複登録を拒否する（1進入口1枚）');

-- =============================================================================
-- 4. 時間帯つき注意事項
-- =============================================================================
insert into public.cautions (entry_point_id, body, severity, time_from, time_to)
values ((select id from public.entry_points where code='A'
           and facility_id=(select id from public.facilities where code='HTL-0001')),
        '17〜20時は送迎バスが停車するため手前のレーンは通過できません。',
        'warn', '17:00', '20:00');

select pg_temp.assert(
  exists (select 1 from public.cautions
           where time_from = '17:00' and time_to = '20:00'),
  '注意事項の時間帯が構造化して保持される');

select pg_temp.assert_rejects($$
  insert into public.cautions (entry_point_id, body, weekdays)
  values ((select id from public.entry_points where code='A'
             and facility_id=(select id from public.facilities where code='HTL-0001')),
          'テスト', array[0,8]::smallint[])
$$, '曜日の範囲外 (0, 8) を拒否する');

-- =============================================================================
-- 5. RLS — anon から見えるものの検証
-- =============================================================================
-- HTL-0001 は draft のまま。公開済みの施設をもう1件用意する。
insert into public.facilities
  (code, name, name_kana, category_id, prefecture, address_line, status)
values ('RSD-0001', 'パークタワー麻布', 'パークタワーアザブ',
        (select id from public.categories where code='residence'),
        '東京都', '六本木6-10-1', 'published');

insert into public.entry_points
  (facility_id, code, kind, name, approach_text, nav_lat, nav_lng)
values ((select id from public.facilities where code='RSD-0001'), 'A', 'dropoff',
        '来客用車寄せ', 'けやき坂側の側道から進入。', 35.6604, 139.7292);

set local role anon;

select pg_temp.assert(
  (select count(*) from public.facilities) = 1,
  'anon には published の施設のみ見える (draft は不可視)');

select pg_temp.assert(
  (select code from public.facilities) = 'RSD-0001',
  'anon に見えているのは公開済みの施設である');

select pg_temp.assert(
  (select count(*) from public.entry_points) = 1,
  'anon には未公開施設の進入口が見えない');

select pg_temp.assert(
  (select count(*) from public.categories) = 6,
  'anon はカテゴリを読める');

select pg_temp.assert_rejects(
  'insert into public.facilities (code, name, name_kana, category_id, prefecture, address_line)
   values (''HTL-0002'', ''不正'', ''ふせい'',
           (select id from public.categories limit 1), ''東京都'', ''X'')',
  'anon は施設を追加できない');

select pg_temp.assert_rejects(
  'update public.facilities set name = ''改ざん''',
  'anon は施設を更新できない');

select pg_temp.assert_rejects(
  'select count(*) from public.admin_profiles',
  'anon は管理者テーブルを読めない');

select pg_temp.assert_rejects(
  'select count(*) from public.audit_logs',
  'anon は監査ログを読めない');

reset role;

rollback;

\echo ''
\echo '================================================='
\echo ' 全テスト合格'
\echo '================================================='
