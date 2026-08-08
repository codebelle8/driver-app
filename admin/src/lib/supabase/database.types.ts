/**
 * データベースの型定義。
 *
 * 本来は `supabase gen types typescript` で自動生成するが、
 * このコマンドは Docker を必要とし、当環境では利用できないため手書きで維持する。
 *
 * **`supabase/migrations/` を変更したら、このファイルも必ず更新すること。**
 * 対応するマイグレーション: 20260807000001 〜 20260808000002
 */

export type PublishStatus = 'draft' | 'published' | 'archived';

export type EntryPointKind =
  | 'dropoff'          // 車寄せ
  | 'entrance'         // エントランス
  | 'parking_entrance' // 駐車場入口
  | 'bus_stop'         // バス乗降場
  | 'service';         // 関係者用

export type CautionSeverity = 'info' | 'warn' | 'critical';

export type PhotoKind =
  | 'approach'  // 進入路
  | 'dropoff'   // 車寄せ
  | 'entrance'  // エントランス
  | 'night'     // 夜間
  | 'diagram'   // 進入案内図
  | 'exterior'  // 外観
  | 'other';

export type AdminRole = 'admin' | 'editor';

export type Category = {
  id: string;
  code: string;
  name: string;
  code_prefix: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type Facility = {
  id: string;
  code: string;
  name: string;
  name_kana: string;
  aliases: string[];
  category_id: string;
  postal_code: string | null;
  prefecture: string;
  city: string | null;
  address_line: string;
  summary: string | null;
  lat: number | null;
  lng: number | null;
  status: PublishStatus;
  sort_order: number;
  note_internal: string | null;
  search_text: string | null;
  created_at: string;
  updated_at: string;
}

export type EntryPoint = {
  id: string;
  facility_id: string;
  code: string;
  kind: EntryPointKind;
  name: string;
  approach_text: string | null;
  approach_from: string | null;
  nav_lat: number | null;
  nav_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  height_limit_cm: number | null;
  is_roofed: boolean | null;
  is_24h: boolean | null;
  is_active: boolean;
  sort_order: number;
  note_internal: string | null;
  created_at: string;
  updated_at: string;
}

export type Caution = {
  id: string;
  entry_point_id: string;
  body: string;
  severity: CautionSeverity;
  time_from: string | null;
  time_to: string | null;
  weekdays: number[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type Photo = {
  id: string;
  facility_id: string | null;
  entry_point_id: string | null;
  kind: PhotoKind;
  storage_path: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  taken_on: string | null;
  is_placeholder: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type AdminProfile = {
  user_id: string;
  display_name: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CatalogSnapshot = {
  version: number;
  storage_path: string;
  facility_count: number;
  entry_point_count: number;
  photo_count: number;
  published_by: string | null;
  published_at: string;
}

type Insert<T, Optional extends keyof T> = Omit<T, Optional> & Partial<Pick<T, Optional>>;

/**
 * supabase-js の `GenericTable` は Relationships を必須とする。
 * これが無いとスキーマが GenericSchema 制約を満たさず、
 * **すべてのクエリ結果が暗黙に never へ落ちる**（型エラーの原因が非常に分かりにくい）。
 * 外部キーの結合クエリは使っていないため空配列でよい。
 */
type Table<Row, Ins> = {
  Row: Row;
  Insert: Ins;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      categories: Table<
        Category,
        Insert<Category, 'id' | 'sort_order' | 'is_active' | 'created_at' | 'updated_at'>
      >;
      facilities: Table<
        Facility,
        Insert<
          Facility,
          | 'id' | 'aliases' | 'postal_code' | 'city' | 'summary' | 'lat' | 'lng'
          | 'status' | 'sort_order' | 'note_internal' | 'search_text'
          | 'created_at' | 'updated_at'
        >
      >;
      entry_points: Table<
        EntryPoint,
        Insert<
          EntryPoint,
          | 'id' | 'approach_text' | 'approach_from' | 'nav_lat' | 'nav_lng'
          | 'dropoff_lat' | 'dropoff_lng' | 'height_limit_cm' | 'is_roofed' | 'is_24h'
          | 'is_active' | 'sort_order' | 'note_internal' | 'created_at' | 'updated_at'
        >
      >;
      cautions: Table<
        Caution,
        Insert<
          Caution,
          | 'id' | 'severity' | 'time_from' | 'time_to' | 'weekdays'
          | 'sort_order' | 'created_at' | 'updated_at'
        >
      >;
      photos: Table<
        Photo,
        Insert<
          Photo,
          | 'id' | 'facility_id' | 'entry_point_id' | 'width' | 'height'
          | 'caption' | 'taken_on' | 'is_placeholder' | 'sort_order'
          | 'created_at' | 'updated_at'
        >
      >;
      admin_profiles: Table<
        AdminProfile,
        Insert<AdminProfile, 'role' | 'is_active' | 'created_at' | 'updated_at'>
      >;
      catalog_snapshots: Table<
        CatalogSnapshot,
        Insert<CatalogSnapshot, 'published_by' | 'published_at'>
      >;
    };
    Views: Record<never, never>;
    Functions: {
      validate_facility_for_publish: {
        Args: { p_facility_id: string };
        Returns: string[];
      };
    };
  };
}

// --- 表示用ラベル -------------------------------------------------------------

export const ENTRY_POINT_KIND_LABEL: Record<EntryPointKind, string> = {
  dropoff: '車寄せ',
  entrance: 'エントランス',
  parking_entrance: '駐車場入口',
  bus_stop: 'バス乗降場',
  service: '関係者用',
};

export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  approach: '進入路',
  dropoff: '車寄せ',
  entrance: 'エントランス',
  night: '夜間',
  diagram: '進入案内図',
  exterior: '外観',
  other: 'その他',
};

export const PUBLISH_STATUS_LABEL: Record<PublishStatus, string> = {
  draft: '下書き',
  published: '公開中',
  archived: '非表示',
};

export const CAUTION_SEVERITY_LABEL: Record<CautionSeverity, string> = {
  info: '情報',
  warn: '注意',
  critical: '重要',
};

export const WEEKDAY_LABEL: Record<number, string> = {
  1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土', 7: '日',
};
