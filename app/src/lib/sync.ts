/**
 * サーバーの内容を端末へ取り込む。
 *
 * いつ走らせるか:
 *   起動時に1回。走行中に取りに行くと、電波の悪い場所で待たされる。
 *   出発前に取り込んでおき、あとは端末の中だけで完結させる。
 *
 * 失敗しても止めない:
 *   取り込めなければ前回の内容がそのまま残る。圏外での起動は
 *   むしろ想定される場面なので、失敗は異常ではなく通常の分岐として扱う。
 */
import {
  getCachedFacilityCount,
  getSyncedAt,
  replaceCatalog,
  type CatalogPayload,
} from './catalog';
import { supabase } from './supabase';
import type { Caution, Category, EntryPoint, Facility, Photo } from './types';

/**
 * 1回の問い合わせで取る最大件数。
 * PostgREST は既定で 1000 件までしか返さないため、超える場合に備えて
 * 明示的に範囲を指定して取り切る。
 */
const PAGE_SIZE = 1000;

/** 上限に達しても取り切れるよう、範囲をずらしながら全件を集める */
async function fetchAll<T>(
  table: string,
  columns: string,
  order: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(order)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export interface SyncResult {
  ok: boolean;
  /** 端末に入っている施設の件数 */
  facilityCount: number;
  /** 端末の内容がいつのものか */
  syncedAt: Date | null;
  /** 取り込めなかった場合の理由。利用者へ出す文言。 */
  message?: string;
}

/**
 * サーバーから全件を取得する。**端末へは保存しない。**
 *
 * 保存と分けている理由:
 *   保存には端末のデータベースが要るが、取得は通信だけで完結する。
 *   分けておくと「サーバーから正しく取れるか」を、端末が無くても
 *   確かめられる（tools/test-app-data.mjs がこれを使う）。
 *
 * 公開済みのものしか返らない。絞り込みはサーバー側の RLS が行うため、
 * ここで条件を書いていなくても下書きは届かない。
 */
export async function fetchCatalog(): Promise<CatalogPayload> {
  const [categories, facilities, entryPoints, cautions, photos] = await Promise.all([
      fetchAll<Category>('categories', 'id, code, name, sort_order', 'sort_order'),
      fetchAll<Facility>(
        'facilities',
        'id, code, name, name_kana, aliases, category_id, prefecture, city, address_line, summary, lat, lng, updated_at',
        'name_kana',
      ),
      fetchAll<EntryPoint>(
        'entry_points',
        'id, facility_id, code, kind, name, approach_text, approach_from, nav_lat, nav_lng, dropoff_lat, dropoff_lng, height_limit_cm, is_roofed, is_24h, sort_order',
        'sort_order',
      ),
      fetchAll<Caution>(
        'cautions',
        'id, entry_point_id, body, severity, time_from, time_to, weekdays, sort_order',
        'sort_order',
      ),
      fetchAll<Photo>(
        'photos',
        'id, facility_id, entry_point_id, kind, storage_path, caption, is_placeholder, sort_order',
        'sort_order',
      ),
  ]);

  return { categories, facilities, entryPoints, cautions, photos };
}

/** 取り込みを試みる。取得して端末へ保存するところまで。 */
export async function syncCatalog(): Promise<SyncResult> {
  try {
    const payload = await fetchCatalog();
    await replaceCatalog(payload);

    return {
      ok: true,
      facilityCount: payload.facilities.length,
      syncedAt: await getSyncedAt(),
    };
  } catch {
    // 取り込めなかった場合、端末に何が残っているかを返す。
    // 「取り込めなかった」だけでは、使える状態かどうかが分からない。
    const [facilityCount, syncedAt] = await Promise.all([
      getCachedFacilityCount(),
      getSyncedAt(),
    ]);

    return {
      ok: false,
      facilityCount,
      syncedAt,
      message:
        facilityCount > 0
          ? '最新の情報を取得できませんでした。前回取得した内容を表示しています。'
          : '情報を取得できませんでした。電波の届く場所で一度お開きください。',
    };
  }
}

/** 「3分前」「昨日 14:30」のような、更新時期の短い説明 */
export function describeSyncedAt(syncedAt: Date | null): string {
  if (!syncedAt) return '未取得';

  const minutes = Math.floor((Date.now() - syncedAt.getTime()) / 60000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;

  const days = Math.floor(hours / 24);
  // 「17日前」まで来ると、いつの情報か分からなくなる。日付で示す。
  if (days > 7) {
    return `${syncedAt.getMonth() + 1}月${syncedAt.getDate()}日`;
  }
  return `${days}日前`;
}

// --- 起動時に1回だけ走らせる ---------------------------------------------------

let pending: Promise<SyncResult> | null = null;

/**
 * 取り込みを1回だけ行い、結果を使い回す。
 *
 * 画面ごとに呼んでも重ならないようにしている。検索画面と詳細画面が
 * それぞれ取りに行くと、同じ内容を二重に取得したうえ、
 * 片方が書き込んでいる最中にもう片方が読むことになる。
 */
export function ensureSynced(): Promise<SyncResult> {
  pending ??= syncCatalog();
  return pending;
}

/** 利用者が明示的に更新したときに使う。前回の結果は捨てる。 */
export function resync(): Promise<SyncResult> {
  pending = syncCatalog();
  return pending;
}
