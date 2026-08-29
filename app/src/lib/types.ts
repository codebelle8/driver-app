/**
 * アプリが受け取るデータの形。
 *
 * 管理画面側 (admin/src/lib/supabase/database.types.ts) と重複するが、
 * アプリは公開済みのデータしか読まないため、必要な列だけに絞っている。
 * 下書き用の列や管理者向けの備考は、そもそも RLS で届かない。
 */

export type EntryPointKind =
  | 'dropoff'
  | 'entrance'
  | 'parking_entrance'
  | 'bus_stop'
  | 'service';

export type CautionSeverity = 'info' | 'warn' | 'critical';

export type PhotoKind =
  | 'approach'
  | 'dropoff'
  | 'entrance'
  | 'night'
  | 'diagram'
  | 'exterior'
  | 'other';

export interface Category {
  id: string;
  code: string;
  name: string;
  sort_order: number;
}

export interface Facility {
  id: string;
  code: string;
  name: string;
  name_kana: string;
  aliases: string[];
  category_id: string;
  prefecture: string;
  city: string | null;
  address_line: string;
  summary: string | null;
  lat: number | null;
  lng: number | null;
  /** 最後に内容が変わった時刻。お知らせの並びに使う。 */
  updated_at: string;
}

export interface Caution {
  id: string;
  entry_point_id: string;
  body: string;
  severity: CautionSeverity;
  /** 'HH:MM:SS'。null なら常時適用 */
  time_from: string | null;
  time_to: string | null;
  /** ISO 8601 で 1=月曜 … 7=日曜。空配列なら全曜日 */
  weekdays: number[];
  sort_order: number;
}

export interface Photo {
  id: string;
  entry_point_id: string | null;
  facility_id: string | null;
  kind: PhotoKind;
  storage_path: string;
  caption: string | null;
  is_placeholder: boolean;
  sort_order: number;
}

export interface EntryPoint {
  id: string;
  facility_id: string;
  code: string;
  kind: EntryPointKind;
  name: string;
  approach_text: string | null;
  approach_from: string | null;
  /**
   * ナビへ渡す座標。建物の中心ではなく「進入レーンの入口」。
   * このアプリの価値の中心にあたる値。
   */
  nav_lat: number | null;
  nav_lng: number | null;
  /** 実際に停車する位置。進入方向を担保するためナビ地点と分けている */
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  height_limit_cm: number | null;
  is_roofed: boolean | null;
  is_24h: boolean | null;
  sort_order: number;
}

/** 詳細画面が扱う、組み立て済みのひとまとまり */
export interface FacilityDetail {
  facility: Facility;
  entryPoints: EntryPoint[];
  cautionsByEntryPoint: Record<string, Caution[]>;
  photosByEntryPoint: Record<string, Photo[]>;
}

export const ENTRY_POINT_KIND_LABEL: Record<EntryPointKind, string> = {
  dropoff: '車寄せ',
  entrance: 'エントランス',
  parking_entrance: '駐車場入口',
  bus_stop: 'バス乗降場',
  service: '関係者用',
};

/** 管理画面 (admin/src/lib/i18n/dictionaries.ts の photoKind) と同じ言い方に揃える */
export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  approach: '進入路',
  dropoff: '車寄せ',
  entrance: 'エントランス',
  night: '夜間',
  diagram: '進入案内図',
  exterior: '外観',
  other: 'その他',
};
