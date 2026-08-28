/**
 * 施設データの取得。
 *
 * **サーバーではなく端末内のデータベースから読む。**
 *   このアプリが使われるのは地下駐車場や高架下で、目的地に近づくほど
 *   電波が悪くなる。到着直前に「読み込み中」で止まっては意味がない。
 *   サーバーへの問い合わせは起動時の取り込み (sync.ts) に限り、
 *   画面の表示は常に端末の中だけで完結させる。
 *
 * 公開されていないものは、そもそも取り込み時にサーバー側の RLS が弾く。
 * 端末に届いた時点で、すべて公開済みのもの。
 */
import { ALIAS_SEPARATOR, getDatabase } from './db';
import { toSearchPattern } from './search';
import type {
  Caution,
  CautionSeverity,
  Category,
  EntryPoint,
  EntryPointKind,
  Facility,
  FacilityDetail,
  Photo,
  PhotoKind,
} from './types';

/**
 * 一度に読み込む件数。
 *
 * 走行前の限られた時間で見るため、まず15件だけ出す。
 * 続きは下端まで送ったときに読み込む。
 * 150件を一度に描くと、古い端末では最初の表示までに間が空く。
 */
export const PAGE_SIZE = 15;

// --- 端末側の形から、アプリが扱う形へ ------------------------------------------
// SQLite には配列も真偽値も無いため、保存時に文字列と 0/1 へ潰している。
// 読み出す側で元へ戻す。

interface FacilityRow {
  id: string;
  code: string;
  name: string;
  name_kana: string;
  aliases: string;
  category_id: string;
  prefecture: string;
  city: string | null;
  address_line: string;
  summary: string | null;
  lat: number | null;
  lng: number | null;
}

function toFacility(row: FacilityRow): Facility {
  return {
    ...row,
    aliases: row.aliases ? row.aliases.split(ALIAS_SEPARATOR).filter(Boolean) : [],
  };
}

interface EntryPointRow {
  id: string;
  facility_id: string;
  code: string;
  kind: string;
  name: string;
  approach_text: string | null;
  approach_from: string | null;
  nav_lat: number | null;
  nav_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  height_limit_cm: number | null;
  is_roofed: number | null;
  is_24h: number | null;
  sort_order: number;
}

/** 0/1 と null を、真偽値と「未回答」へ戻す */
function toBool(value: number | null): boolean | null {
  return value === null ? null : value === 1;
}

function toEntryPoint(row: EntryPointRow): EntryPoint {
  return {
    ...row,
    kind: row.kind as EntryPointKind,
    is_roofed: toBool(row.is_roofed),
    is_24h: toBool(row.is_24h),
  };
}

interface CautionRow {
  id: string;
  entry_point_id: string;
  body: string;
  severity: string;
  time_from: string | null;
  time_to: string | null;
  weekdays: string;
  sort_order: number;
}

function toCaution(row: CautionRow): Caution {
  return {
    ...row,
    severity: row.severity as CautionSeverity,
    weekdays: row.weekdays
      ? row.weekdays.split(',').map(Number).filter(Number.isInteger)
      : [],
  };
}

interface PhotoRow {
  id: string;
  facility_id: string | null;
  entry_point_id: string | null;
  kind: string;
  storage_path: string;
  caption: string | null;
  is_placeholder: number;
  sort_order: number;
}

function toPhoto(row: PhotoRow): Photo {
  return {
    ...row,
    kind: row.kind as PhotoKind,
    is_placeholder: row.is_placeholder === 1,
  };
}

// --- 取得 ---------------------------------------------------------------------

export async function fetchCategories(): Promise<Category[]> {
  const db = await getDatabase();
  return db.getAllAsync<Category>(
    'select id, code, name, sort_order from categories order by sort_order',
  );
}

/**
 * 施設を検索する。
 *
 * `search_text` には施設名・よみがな・別名・住所がまとめて入っている。
 * この列は取り込み時にサーバーと同じ規則で正規化しているため、
 * 「ていこく」でも「うちさいわい」でも「帝国」でも同じ施設に届く。
 */
export interface SearchPage {
  rows: Facility[];
  /** さらに読み込める分があるか */
  hasMore: boolean;
}

export async function searchFacilities(options: {
  query?: string;
  categoryId?: string | null;
  /** 0 から始まる読み込み位置 */
  offset?: number;
}): Promise<SearchPage> {
  const db = await getDatabase();
  const offset = options.offset ?? 0;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  const pattern = options.query ? toSearchPattern(options.query) : null;
  if (pattern) {
    conditions.push('search_text like ?');
    params.push(pattern);
  }
  if (options.categoryId) {
    conditions.push('category_id = ?');
    params.push(options.categoryId);
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  // 1件多く取り、続きがあるかを判断する。
  // 総件数を別途数えるより問い合わせが1回少なくて済む。
  params.push(PAGE_SIZE + 1, offset);

  const rows = await db.getAllAsync<FacilityRow>(
    `select id, code, name, name_kana, aliases, category_id, prefecture, city,
            address_line, summary, lat, lng
       from facilities
       ${where}
      order by name_kana
      limit ? offset ?`,
    params,
  );

  const hasMore = rows.length > PAGE_SIZE;
  return { rows: rows.slice(0, PAGE_SIZE).map(toFacility), hasMore };
}

/** 詳細画面に必要なものを集める */
export async function fetchFacilityDetail(id: string): Promise<FacilityDetail | null> {
  const db = await getDatabase();

  const facilityRow = await db.getFirstAsync<FacilityRow>(
    `select id, code, name, name_kana, aliases, category_id, prefecture, city,
            address_line, summary, lat, lng
       from facilities where id = ?`,
    id,
  );
  if (!facilityRow) return null;

  const entryPointRows = await db.getAllAsync<EntryPointRow>(
    `select id, facility_id, code, kind, name, approach_text, approach_from,
            nav_lat, nav_lng, dropoff_lat, dropoff_lng, height_limit_cm,
            is_roofed, is_24h, sort_order
       from entry_points where facility_id = ?
      order by sort_order, code`,
    id,
  );

  const entryPoints = entryPointRows.map(toEntryPoint);
  const ids = entryPoints.map((ep) => ep.id);

  const cautionsByEntryPoint: Record<string, Caution[]> = {};
  const photosByEntryPoint: Record<string, Photo[]> = {};

  if (ids.length) {
    // in (?, ?, ...) の形にする。件数は施設あたり数件なので問題にならない。
    const placeholders = ids.map(() => '?').join(', ');

    const cautionRows = await db.getAllAsync<CautionRow>(
      `select id, entry_point_id, body, severity, time_from, time_to, weekdays, sort_order
         from cautions where entry_point_id in (${placeholders})
        order by sort_order`,
      ids,
    );
    for (const row of cautionRows) {
      (cautionsByEntryPoint[row.entry_point_id] ??= []).push(toCaution(row));
    }

    const photoRows = await db.getAllAsync<PhotoRow>(
      `select id, facility_id, entry_point_id, kind, storage_path, caption,
              is_placeholder, sort_order
         from photos where entry_point_id in (${placeholders})
        order by sort_order`,
      ids,
    );
    for (const row of photoRows) {
      if (!row.entry_point_id) continue;
      (photosByEntryPoint[row.entry_point_id] ??= []).push(toPhoto(row));
    }
  }

  return {
    facility: toFacility(facilityRow),
    entryPoints,
    cautionsByEntryPoint,
    photosByEntryPoint,
  };
}
