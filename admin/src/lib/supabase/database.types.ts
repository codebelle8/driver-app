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

export type AdminRole = 'admin' | 'editor' | 'surveyor';

export type Category = {
  id: string;
  code: string;
  name: string;
  /** 英語表記。空ならアプリは日本語を出す。 */
  name_en: string | null;
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
  /** 英語表記。空ならアプリは日本語を出す。 */
  name_en: string | null;
  name_kana: string;
  aliases: string[];
  category_id: string;
  postal_code: string | null;
  prefecture: string;
  prefecture_en: string | null;
  city: string | null;
  city_en: string | null;
  address_line: string;
  /** 英語の住所。英語では小さい単位から並べるため、並べ替えはアプリ側で行う。 */
  address_line_en: string | null;
  summary: string | null;
  summary_en: string | null;
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
  name_en: string | null;
  approach_text: string | null;
  /** 進入方法の英語。ここが読めないと英語表示の意味がない。 */
  approach_text_en: string | null;
  approach_from: string | null;
  approach_from_en: string | null;
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
  /** 英語表記。空ならアプリは日本語を出す。 */
  body_en: string | null;
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

/**
 * 会員（アプリをお使いのドライバー）。
 *
 * 管理画面を操作する AdminProfile とは別物。同じ auth.users に
 * ぶら下がるが、名簿を分けてある（supabase/migrations/20260908000001）。
 */
export type DriverProfile = {
  user_id: string;
  display_name: string | null;
  status: 'trial' | 'active' | 'expired' | 'blocked';
  /** 無料期間の終わり。サーバー側で決める。 */
  trial_ends_at: string;
  avatar_path: string | null;
  /** ご希望の料金。支払い済みの意味ではない。 */
  plan: 'monthly' | 'yearly' | null;
  plan_chosen_at: string | null;
  /** 振込名義の前に付けていただく番号 */
  member_no: number;
  created_at: string;
  updated_at: string;
}

/**
 * プッシュ通知の配信の鍵（VAPID）。1行しか持たない。
 *
 * private_key は会員に渡していない（列ごとの権限で公開鍵だけを渡す）。
 * 管理画面は service_role で読むため、ここでは両方を持つ。
 */
export type PushSettings = {
  id: number;
  public_key: string | null;
  private_key: string | null;
  /** 配信元の連絡先（mailto:…）。決まりで必須。 */
  subject: string | null;
  updated_at: string;
}

/** どの端末へ送るか。1つのブラウザにつき1件。 */
export type PushSubscription = {
  id: string;
  user_id: string;
  /** 配信元の宛先。ブラウザが決める。 */
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
}

/** お支払いの受取口座。1行しか持たない。 */
export type PaymentSettings = {
  id: number;
  bank_name: string | null;
  branch_name: string | null;
  account_type: 'futsu' | 'touza' | null;
  account_number: string | null;
  account_holder: string | null;
  account_holder_kana: string | null;
  note: string | null;
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

export type AuditLog = {
  id: number;
  actor_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  diff: Record<string, unknown> | null;
  created_at: string;
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
        Insert<Category, 'id' | 'name_en' | 'sort_order' | 'is_active' | 'created_at' | 'updated_at'>
      >;
      facilities: Table<
        Facility,
        Insert<
          Facility,
          | 'id' | 'aliases' | 'postal_code' | 'city' | 'summary' | 'lat' | 'lng'
          | 'status' | 'sort_order' | 'note_internal' | 'search_text'
          | 'name_en' | 'prefecture_en' | 'city_en' | 'address_line_en' | 'summary_en'
          | 'created_at' | 'updated_at'
        >
      >;
      entry_points: Table<
        EntryPoint,
        Insert<
          EntryPoint,
          | 'id' | 'approach_text' | 'approach_from' | 'nav_lat' | 'nav_lng'
          | 'dropoff_lat' | 'dropoff_lng' | 'height_limit_cm' | 'is_roofed' | 'is_24h'
          | 'is_active' | 'sort_order' | 'note_internal'
          | 'name_en' | 'approach_text_en' | 'approach_from_en'
          | 'created_at' | 'updated_at'
        >
      >;
      cautions: Table<
        Caution,
        Insert<
          Caution,
          | 'id' | 'body_en' | 'severity' | 'time_from' | 'time_to' | 'weekdays'
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
      driver_profiles: Table<
        DriverProfile,
        Insert<
          DriverProfile,
          | 'display_name' | 'status' | 'avatar_path' | 'plan' | 'plan_chosen_at'
          | 'member_no' | 'created_at' | 'updated_at'
        >
      >;
      payment_settings: Table<PaymentSettings, Insert<PaymentSettings, keyof PaymentSettings>>;
      push_settings: Table<PushSettings, Insert<PushSettings, keyof PushSettings>>;
      push_subscriptions: Table<
        PushSubscription,
        Insert<PushSubscription, 'id' | 'user_agent' | 'created_at' | 'last_seen_at'>
      >;
      audit_logs: Table<
        AuditLog,
        Insert<AuditLog, 'id' | 'actor_id' | 'record_id' | 'diff' | 'created_at'>
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

