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
  match?: Record<string, string>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select(columns);
    if (match) query = query.match(match);
    const { data, error } = await query.order(order).range(from, from + PAGE_SIZE - 1);

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
 * **公開済みのものだけを返す。絞り込みはここで行う**（2026-10-29）。
 *   以前はサーバー側の RLS に任せていた。RLS は管理画面の権限を持つ
 *   方には下書きも見せる（管理画面で直すため）。その方がアプリに入ると、
 *   座標の無い下書き79件まで取り込み、「302件」と出ていた。
 *   アプリに出すものは、誰が入っても運転手の方と同じにする。
 */
export async function fetchCatalog(): Promise<CatalogPayload> {
  const [categories, facilities, entryPoints, cautions, photos] = await Promise.all([
      /*
        is_active を取り込む。

        **これが無いと、管理画面で「無効」にしても隠れない。**
        管理画面には「アプリに表示する」と書いてあり、外せば隠れる
        つもりで操作される。実際には出続けていた（ご報告 2026-09-14）。
      */
      fetchAll<Category>(
        'categories',
        'id, code, name, name_en, sort_order, is_active',
        'sort_order',
      ),
      fetchAll<Facility>(
        'facilities',
        'id, code, name, name_en, name_kana, aliases, category_id, prefecture, prefecture_en, city, city_en, address_line, address_line_en, summary, summary_en, lat, lng, sort_order, updated_at',
        // クライアント様の表の番号順。よみが揃っていないため、かな順にはしない。
        'sort_order',
        { status: 'published' },
      ),
      fetchAll<EntryPoint>(
        'entry_points',
        /*
          is_active も取り込む。

          **これが無くても隠れる。** データベース側の決まり
          （entry_points_read_public）が、staff 以外には is_active の
          立っている行しか返さない。取り込んだ時点で閉鎖中の入口は
          含まれていない。

          それでも持つのは、**画面側で「出す・出さない」を判じている
          ことを、読む人に見えるようにするため。** 決まりが変わった
          ときに、こちら側も気づける。
        */
        'id, facility_id, code, kind, name, name_en, approach_text, approach_text_en, approach_from, approach_from_en, nav_lat, nav_lng, dropoff_lat, dropoff_lng, height_limit_cm, is_roofed, is_24h, is_active, sort_order',
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

  /*
    入口・注意事項・写真は、公開済みの施設に属するものだけを残す。

    これらには施設の公開状態が無く、問い合わせでは絞れない。管理画面の
    権限で入ると、下書きの施設のものも届く。親の無い入口が端末に残ると、
    施設の件数と入口の件数が食い違う。
  */
  const shownFacilities = new Set(facilities.map((f) => f.id));
  const shownEntryPoints = entryPoints.filter((e) => shownFacilities.has(e.facility_id));
  const shownEntryIds = new Set(shownEntryPoints.map((e) => e.id));

  return {
    categories,
    facilities,
    entryPoints: shownEntryPoints,
    cautions: cautions.filter((c) => shownEntryIds.has(c.entry_point_id)),
    photos: photos.filter(
      (p) =>
        (p.facility_id !== null && shownFacilities.has(p.facility_id)) ||
        (p.entry_point_id !== null && shownEntryIds.has(p.entry_point_id)),
    ),
  };
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
  const done = pending;
  void done.then((r) => {
    if (r.ok) announce();
  });
  return pending;
}

// --- 取り込み直したことを知らせる ---------------------------------------------

/**
 * 取り込みが終わったときに呼ぶ相手。
 *
 * **なぜ要るか**
 *   お知らせの数は、画面が開かれたときに数えている。取り込み直しても
 *   数え直す合図が無く、**画面を開き直すまで古い数のままだった**
 *   （ご報告 2026-09-15）。管理画面で直した内容がアプリに出るのに
 *   一手間かかっていた。
 *
 *   取り込みが終わったことを、見ている画面へ伝える。
 */
const listeners = new Set<() => void>();

function announce(): void {
  for (const f of [...listeners]) {
    try {
      f();
    } catch {
      // 1つが落ちても、他へは伝える
    }
  }
}

/** 取り込み直されたら呼ばれる。戻り値を呼ぶと外れる。 */
export function onCatalogChanged(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/**
 * しばらく取り込んでいなければ、取り込み直す。
 *
 * **画面へ戻ってきたときに呼ぶ。** 起動時の1回だけだと、開いたままの
 * 端末には新しい内容が届かない。かといって画面を開くたびに取りに行くと、
 * 走行中の電波で無駄な通信を繰り返す。
 *
 * 取り込みは35KB（圧縮後）。1分に1度までなら負担にならない。
 *
 * **1分にしてある理由**
 *   管理画面で直したことが、アプリを開いたままでも1分ほどで出る。
 *   これより長いと「直したのに出ない」と映る（ご報告 2026-09-15）。
 *   短くしても、画面へ戻ってくる回数より多くは走らない。
 */
const STALE_AFTER = 60 * 1000;

export async function refreshIfStale(now: number = Date.now()): Promise<void> {
  const at = await getSyncedAt();
  if (at && now - at.getTime() < STALE_AFTER) return;
  await resync().catch(() => undefined);
}
