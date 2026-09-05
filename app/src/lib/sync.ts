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
import type { Dictionary } from './i18n/dictionaries';
import { supabase } from './supabase';
import type { Caution, Category, EntryPoint, Facility, Photo } from './types';
import { describeSince } from './when';

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
  /**
   * 取り込めなかった場合の理由。
   *
   * 文言そのものではなく、どちらの理由かだけを持つ。ここは画面の
   * 外にあり、いま選ばれている言語を知らない。文言を組み立てて
   * しまうと、言語を切り替えても前の言語のまま残る。
   */
  problem?: 'stale' | 'failed';
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
      fetchAll<Category>('categories', 'id, code, name, name_en, sort_order', 'sort_order'),
      fetchAll<Facility>(
        'facilities',
        'id, code, name, name_en, name_kana, aliases, category_id, prefecture, prefecture_en, city, city_en, address_line, address_line_en, summary, summary_en, lat, lng, sort_order, updated_at',
        // クライアント様の表の番号順。よみが揃っていないため、かな順にはしない。
        'sort_order',
      ),
      fetchAll<EntryPoint>(
        'entry_points',
        'id, facility_id, code, kind, name, name_en, approach_text, approach_text_en, approach_from, approach_from_en, nav_lat, nav_lng, dropoff_lat, dropoff_lng, height_limit_cm, is_roofed, is_24h, sort_order',
        'sort_order',
      ),
      fetchAll<Caution>(
        'cautions',
        'id, entry_point_id, body, body_en, severity, time_from, time_to, weekdays, sort_order',
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
      problem: facilityCount > 0 ? 'stale' : 'failed',
    };
  }
}

/**
 * 「3分前」のような、更新時期の短い説明。
 *
 * 履歴の言い方（when.ts）と同じものを使う。別々に書いていたため、
 * 片方だけ直る形になっていた。
 */
export function describeSyncedAt(syncedAt: Date | null, t: Dictionary): string {
  if (!syncedAt) return t.sync.never;
  return describeSince(syncedAt.getTime(), t);
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
