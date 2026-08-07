-- =============================================================================
-- 車寄せナビ — 初期スキーマ
-- 対象: PostgreSQL 15+ (Supabase)
-- =============================================================================
-- 設計方針
--   1. 施設 (facilities) と 車寄せ/エントランス (entry_points) を分離する。
--      1施設に複数の進入口が存在し、それぞれ説明文・写真・座標が異なるため。
--   2. データは段階的に入稿される（まずホテル、次にレジデンス…）。
--      未完成のデータを draft のまま保持でき、完成したものだけ published にする。
--   3. 注意事項 (cautions) は時間帯を構造化して保持する。
--      アプリ側で「今の時刻に該当する注意」だけを強調表示するため。
--   4. 写真は実データ差し替えを前提とし、is_placeholder で仮画像を区別する。
-- =============================================================================

create extension if not exists "pgcrypto";

-- 日本語の部分一致検索に使う。全文検索 (tsvector) は空白で語を区切るため、
-- 「グランドホテル汐留」が1トークンになり「汐留」で引けない。
-- 日本語では trigram + ILIKE の方が正しく機能する。
create extension if not exists "pg_trgm";

-- -----------------------------------------------------------------------------
-- 共通: updated_at 自動更新
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- カテゴリ
-- -----------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  code        text        not null unique,   -- 'hotel' 等。施設コードの接頭辞と対応
  name        text        not null,          -- 'ホテル'
  code_prefix text        not null unique,   -- 'HTL'。施設コード採番に使用
  sort_order  integer     not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index categories_sort_idx on public.categories (sort_order) where is_active;

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 施設
-- -----------------------------------------------------------------------------
create type public.publish_status as enum ('draft', 'published', 'archived');

create table public.facilities (
  id            uuid primary key default gen_random_uuid(),

  -- 人が読める管理用ID (例: HTL-0001)。写真ファイル名と対応させるため必須。
  code          text        not null unique,

  name          text        not null,
  name_kana     text        not null,          -- 検索用。ひらがな/カタカナ どちらでも可
  aliases       text[]      not null default '{}',  -- 「汐留シティセンター」等の通称

  category_id   uuid        not null references public.categories (id) on delete restrict,

  postal_code   text,
  prefecture    text        not null,
  city          text,
  address_line  text        not null,

  summary       text,                            -- 施設概要 2〜3行

  -- 施設の代表地点。地図の初期表示に使う。ナビの目的地には使わない。
  lat           double precision,
  lng           double precision,

  status        public.publish_status not null default 'draft',
  sort_order    integer     not null default 0,
  note_internal text,                            -- 管理者用メモ。アプリには出さない

  -- 検索用に正規化した文字列。トリガで自動生成する。
  -- 生成列 (generated) にできないのは、正規化に使う array_to_string や
  -- translate の組み合わせが IMMUTABLE 要件を満たさないため。
  search_text   text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint facilities_code_format
    check (code ~ '^[A-Z]{3}-[0-9]{4}$'),
  constraint facilities_lat_range check (lat is null or (lat between -90 and 90)),
  constraint facilities_lng_range check (lng is null or (lng between -180 and 180))
);

-- 管理画面の検索用。アプリ側は端末内 SQLite で検索するためここは管理用途のみ。
-- -----------------------------------------------------------------------------
-- 検索文字列の正規化
--   ドライバーは「シオドメ」「しおどめ」「汐留」のいずれでも検索しうる。
--   カタカナをひらがなへ寄せ、英数字を小文字化して表記ゆれを吸収する。
--   アプリ側 (端末内 SQLite) でも同じ正規化を行い、挙動を一致させる。
-- -----------------------------------------------------------------------------
create or replace function public.normalize_search_text(input text)
returns text
language sql
immutable
as $$
  select lower(translate(
    coalesce(input, ''),
    'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロワヲンー',
    'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろわをんー'
  ));
$$;

create or replace function public.facilities_refresh_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text := public.normalize_search_text(
    concat_ws(' ',
      new.name,
      new.name_kana,
      array_to_string(new.aliases, ' '),
      new.prefecture,
      new.city,
      new.address_line
    )
  );
  return new;
end;
$$;

create trigger facilities_refresh_search_text
  before insert or update on public.facilities
  for each row execute function public.facilities_refresh_search_text();

-- 日本語の部分一致は trigram で引く。「汐留」で「グランドホテル汐留」に当たる。
create index facilities_search_idx on public.facilities
  using gin (search_text gin_trgm_ops);

create index facilities_category_idx on public.facilities (category_id, sort_order);
create index facilities_status_idx   on public.facilities (status);

create trigger facilities_set_updated_at
  before update on public.facilities
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 車寄せ / エントランス — アプリの中核データ
-- -----------------------------------------------------------------------------
create type public.entry_point_kind as enum (
  'dropoff',           -- 車寄せ
  'entrance',          -- エントランス
  'parking_entrance',  -- 駐車場入口
  'bus_stop',          -- バス乗降場
  'service'            -- 荷捌き・関係者用
);

create table public.entry_points (
  id             uuid primary key default gen_random_uuid(),
  facility_id    uuid not null references public.facilities (id) on delete cascade,

  -- 施設内の連番記号 (A, B, C...)。写真ファイル名と対応させる。
  code           text not null,

  kind           public.entry_point_kind not null,
  name           text not null,                  -- 「正面車寄せ（メインポーチ）」

  approach_text  text,                           -- 進入方法の説明文
  approach_from  text,                           -- 進入元の道路名・方向

  -- ナビ投入座標。建物中心ではなく「進入レーン上の地点」を入れる。
  -- ここが本アプリの価値の中心。
  nav_lat        double precision,
  nav_lng        double precision,

  -- 実際の停車位置。ナビ地点と分ける（進入方向を担保するため両方持つ）。
  dropoff_lat    double precision,
  dropoff_lng    double precision,

  height_limit_cm integer,                       -- ハイヤー・ワゴンの可否判断
  is_roofed      boolean,
  is_24h         boolean,

  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  note_internal  text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (facility_id, code),
  constraint entry_points_code_format check (code ~ '^[A-Z]$'),
  constraint entry_points_nav_pair
    check ((nav_lat is null) = (nav_lng is null)),
  constraint entry_points_dropoff_pair
    check ((dropoff_lat is null) = (dropoff_lng is null)),
  constraint entry_points_height check (height_limit_cm is null or height_limit_cm > 0)
);

create index entry_points_facility_idx on public.entry_points (facility_id, sort_order);

create trigger entry_points_set_updated_at
  before update on public.entry_points
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 注意事項（時間帯つき）
-- -----------------------------------------------------------------------------
create type public.caution_severity as enum ('info', 'warn', 'critical');

create table public.cautions (
  id             uuid primary key default gen_random_uuid(),
  entry_point_id uuid not null references public.entry_points (id) on delete cascade,

  body           text not null,
  severity       public.caution_severity not null default 'warn',

  -- 適用時間帯。null なら常時適用。
  -- time_from > time_to の場合は日をまたぐ（例 22:00〜05:00）。
  time_from      time,
  time_to        time,

  -- 適用曜日。ISO 8601 準拠で 1=月曜 … 7=日曜。空配列なら全曜日。
  weekdays       smallint[] not null default '{}',

  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint cautions_time_pair check ((time_from is null) = (time_to is null)),
  constraint cautions_weekdays_range
    check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
);

create index cautions_entry_point_idx on public.cautions (entry_point_id, sort_order);

create trigger cautions_set_updated_at
  before update on public.cautions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 写真・進入案内図
-- -----------------------------------------------------------------------------
create type public.photo_kind as enum (
  'approach',   -- 進入路
  'dropoff',    -- 車寄せ
  'entrance',   -- エントランス
  'night',      -- 夜間
  'diagram',    -- 進入案内図
  'exterior',   -- 外観
  'other'
);

create table public.photos (
  id             uuid primary key default gen_random_uuid(),

  -- どちらか一方に紐づく。施設全体の外観写真は facility_id のみ。
  facility_id    uuid references public.facilities (id) on delete cascade,
  entry_point_id uuid references public.entry_points (id) on delete cascade,

  kind           public.photo_kind not null,

  storage_path   text not null,          -- Supabase Storage 上のパス
  width          integer,
  height         integer,
  caption        text,                   -- 「正面車寄せ（夜間）」
  taken_on       date,

  -- 仮画像フラグ。実写真の入稿待ちを一覧で抽出できるようにする。
  is_placeholder boolean not null default false,

  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint photos_owner_present
    check (facility_id is not null or entry_point_id is not null)
);

create index photos_facility_idx    on public.photos (facility_id, sort_order);
create index photos_entry_point_idx on public.photos (entry_point_id, kind, sort_order);
create index photos_placeholder_idx on public.photos (is_placeholder) where is_placeholder;

create trigger photos_set_updated_at
  before update on public.photos
  for each row execute function public.set_updated_at();

-- 案内図は1つの進入口につき1枚。
create unique index photos_one_diagram_per_entry_point
  on public.photos (entry_point_id)
  where kind = 'diagram' and entry_point_id is not null;

-- -----------------------------------------------------------------------------
-- 管理者
-- -----------------------------------------------------------------------------
create type public.admin_role as enum ('admin', 'editor');

create table public.admin_profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role        public.admin_role not null default 'editor',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger admin_profiles_set_updated_at
  before update on public.admin_profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 監査ログ
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id          bigserial primary key,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,          -- 'insert' | 'update' | 'delete' | 'publish'
  table_name  text not null,
  record_id   uuid,
  diff        jsonb,
  created_at  timestamptz not null default now()
);

create index audit_logs_record_idx  on public.audit_logs (table_name, record_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- -----------------------------------------------------------------------------
-- カタログスナップショット
--   アプリは起動時にこのバージョンを見て、差分があれば取得する。
--   毎回 API を叩かせず、CDN 上の静的ファイル1本で配信するための管理表。
-- -----------------------------------------------------------------------------
create table public.catalog_snapshots (
  version        integer primary key,
  storage_path   text not null,
  facility_count integer not null,
  entry_point_count integer not null,
  photo_count    integer not null,
  published_by   uuid references auth.users (id) on delete set null,
  published_at   timestamptz not null default now()
);

-- =============================================================================
-- 公開前バリデーション
--   施設を published にしてよいかを検査し、問題点を配列で返す。
--   段階的にデータが入稿されるため、「published にできる状態か」を
--   機械的に判定できることが運用上重要になる。
-- =============================================================================
create or replace function public.validate_facility_for_publish(p_facility_id uuid)
returns text[]
language plpgsql
stable
as $$
declare
  problems text[] := '{}';
  f        public.facilities%rowtype;
  ep_count integer;
  bad_nav  integer;
  no_text  integer;
  no_photo integer;
  placeholder_photos integer;
begin
  select * into f from public.facilities where id = p_facility_id;
  if not found then
    return array['施設が見つかりません'];
  end if;

  if coalesce(trim(f.name), '') = '' then
    problems := array_append(problems, '施設名が未入力です');
  end if;
  if coalesce(trim(f.name_kana), '') = '' then
    problems := array_append(problems, '施設名（かな）が未入力です。検索に必要です');
  end if;
  if coalesce(trim(f.address_line), '') = '' then
    problems := array_append(problems, '住所が未入力です');
  end if;

  select count(*) into ep_count
    from public.entry_points where facility_id = p_facility_id and is_active;
  if ep_count = 0 then
    problems := array_append(problems, '有効な車寄せ・エントランスが1件も登録されていません');
  end if;

  select count(*) into bad_nav
    from public.entry_points
   where facility_id = p_facility_id and is_active and nav_lat is null;
  if bad_nav > 0 then
    problems := array_append(problems, format('ナビ投入座標が未設定の進入口が %s 件あります', bad_nav));
  end if;

  select count(*) into no_text
    from public.entry_points
   where facility_id = p_facility_id and is_active
     and coalesce(trim(approach_text), '') = '';
  if no_text > 0 then
    problems := array_append(problems, format('進入方法の説明が未入力の進入口が %s 件あります', no_text));
  end if;

  select count(*) into no_photo
    from public.entry_points ep
   where ep.facility_id = p_facility_id and ep.is_active
     and not exists (select 1 from public.photos p where p.entry_point_id = ep.id);
  if no_photo > 0 then
    problems := array_append(problems, format('写真が1枚も無い進入口が %s 件あります', no_photo));
  end if;

  select count(*) into placeholder_photos
    from public.photos p
    join public.entry_points ep on ep.id = p.entry_point_id
   where ep.facility_id = p_facility_id and p.is_placeholder;
  if placeholder_photos > 0 then
    -- これは警告。仮画像のままでも公開はできる運用とする。
    problems := array_append(problems, format('［警告］仮画像が %s 枚残っています', placeholder_photos));
  end if;

  return problems;
end;
$$;

comment on function public.validate_facility_for_publish(uuid) is
  '施設を公開してよいか検査し、問題点の一覧を返す。空配列なら公開可。
   「［警告］」で始まる項目は公開を妨げない。';
