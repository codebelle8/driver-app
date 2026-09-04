import AsyncStorage from '@react-native-async-storage/async-storage';

import { buildSearchText } from './search';
import type { Caution, Category, EntryPoint, Facility, Photo } from './types';

/**
 * 施設データの置き場。
 *
 * **なぜ SQLite をやめたか**
 *   web 版の expo-sqlite は OPFS（navigator.storage）を必要とし、
 *   **Safari では使えない**。実測で確認している。
 *   保存先を開けず、取り込みが永久に終わらない状態になっていた。
 *   iPhone で動かないなら、PWA にした意味がない。
 *
 * **全件をメモリに載せる**
 *   照会は「名前・かな・別名・住所での絞り込み」と「カテゴリでの絞り込み」
 *   だけで、対象は150件程度。SQL を持ち出すほどのものではない。
 *   全部を配列で持ち、その場で絞るほうが速く、確実で、
 *   どのブラウザでも同じ結果になる。
 *
 * **控えは AsyncStorage（web では IndexedDB）**
 *   IndexedDB は Safari を含むすべてのブラウザで使える。
 *   端末を閉じても残り、次に開いたとき通信を待たずに画面が出る。
 */

/** 控えの鍵 */
const CATALOG_KEY = 'kn_catalog';
const SYNCED_AT_KEY = 'kn_catalog_synced_at';
const ADDED_KEY = 'kn_catalog_added';

/**
 * 新着として控えておく上限。
 *
 * これを超えたら古いものから落とす。一度に大量に増えたときは、
 * どのみち一覧として読めないため、直近だけ残せば足りる。
 */
const ADDED_LIMIT = 50;

/** 新着として扱う期間。これより古い追加は落とす。 */
const ADDED_DAYS = 14;

/** 後から増えた施設。お知らせに使う。 */
export interface AddedFacility {
  id: string;
  /** 端末が気づいた時刻 */
  at: string;
}

export interface CatalogPayload {
  categories: Category[];
  facilities: Facility[];
  entryPoints: EntryPoint[];
  cautions: Caution[];
  photos: Photo[];
}

/**
 * 探すために正規化した文字列を添えた施設。
 *
 * 毎回の照会で組み立て直すと、150件×打鍵ごとに正規化が走る。
 * 取り込みのときに一度だけ作って持たせる。
 */
export interface IndexedFacility extends Facility {
  /** 名前・かな・別名・住所をまとめて正規化したもの */
  searchText: string;
}

interface Catalog {
  categories: Category[];
  facilities: IndexedFacility[];
  entryPoints: EntryPoint[];
  cautions: Caution[];
  photos: Photo[];
  syncedAt: string | null;
}

const EMPTY: Catalog = {
  categories: [],
  facilities: [],
  entryPoints: [],
  cautions: [],
  photos: [],
  syncedAt: null,
};

let memory: Catalog | null = null;
let loading: Promise<Catalog> | null = null;

/*
  探すための文字列を添える。

  組み立ては search.ts に任せる。項目ごとに正規化してから繋ぐ。
  先に繋いでから正規化すると、「丸ノ内ホテル」が
  「ホテルメトロポリタン丸の内」に当たるような、項目をまたいだ
  誤検出が起きる。

  **カテゴリ名も入れる。**
    「ホ」の1文字でホテルが出てほしい、というご要望による。
    施設名に「ホテル」を含まないもの（「星のや東京」など）も、
    これで区分から辿れる。

  **漢字はそのまま残る。**
    正規化はカタカナをひらがなへ寄せるだけなので、漢字で打てば
    漢字のまま当たり、よみがなで打てばよみがなに当たる。
*/
function index(facilities: Facility[], categories: Category[]): IndexedFacility[] {
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  return facilities.map((f) => ({
    ...f,
    searchText: buildSearchText([
      f.name,
      f.name_kana,
      ...(f.aliases ?? []),
      f.prefecture,
      f.city,
      f.address_line,
      categoryName.get(f.category_id),
    ]),
  }));
}

/** 控えから読み出す。無ければ空。 */
async function readStored(): Promise<Catalog> {
  try {
    const [raw, at] = await Promise.all([
      AsyncStorage.getItem(CATALOG_KEY),
      AsyncStorage.getItem(SYNCED_AT_KEY),
    ]);
    if (!raw) return { ...EMPTY };

    const p = JSON.parse(raw) as CatalogPayload;
    return {
      categories: p.categories ?? [],
      facilities: index(p.facilities ?? [], p.categories ?? []),
      entryPoints: p.entryPoints ?? [],
      cautions: p.cautions ?? [],
      photos: p.photos ?? [],
      syncedAt: at,
    };
  } catch {
    // 壊れていたら捨てる。取り込み直せば戻る。
    return { ...EMPTY };
  }
}

/**
 * いまの内容。
 *
 * 一度読んだらメモリに残す。画面が切り替わるたびに
 * 保存領域を読み直すと、その分だけ待たせることになる。
 */
export function getCatalog(): Promise<Catalog> {
  if (memory) return Promise.resolve(memory);
  loading ??= readStored().then((c) => {
    memory = c;
    loading = null;
    return c;
  });
  return loading;
}

/**
 * 取り込んだ内容で置き換える。
 *
 * 一部だけを更新する仕組みは持たない。150件を丸ごと書いても
 * 一瞬で終わり、half-updated な状態が生まれないほうが安全。
 */
export async function replaceCatalog(payload: CatalogPayload): Promise<void> {
  const syncedAt = new Date().toISOString();
  const before = await getCatalog();

  /*
    「後から増えた施設」を、この時点でしか分からないため控える。

    サーバーの created_at では判別できない。データを一括で入れ直すと
    全件の作成日時が同じ日になり、193件すべてが新着になってしまう。
    実際、初回の取り込みで作成日時は2日に固まっている。

    **端末が前回持っていた一覧と比べる。** 前回に無く今回にあるものが、
    その端末にとっての新着。初回（前回が空）は全件を既知として扱う。
    初めて開いた方に「193件が新着です」と出しても意味がないため。
  */
  const known = new Set(before.facilities.map((f) => f.id));
  const appeared: AddedFacility[] =
    known.size === 0
      ? []
      : payload.facilities
          .filter((f) => !known.has(f.id))
          .map((f) => ({ id: f.id, at: syncedAt }));

  const since = new Date(Date.now() - ADDED_DAYS * 86400_000).toISOString();
  const added = [...(await getAddedFacilities()), ...appeared]
    .filter((a) => a.at >= since)
    .slice(-ADDED_LIMIT);

  memory = {
    categories: payload.categories,
    facilities: index(payload.facilities, payload.categories),
    entryPoints: payload.entryPoints,
    cautions: payload.cautions,
    photos: payload.photos,
    syncedAt,
  };

  await AsyncStorage.multiSet([
    [CATALOG_KEY, JSON.stringify(payload)],
    [SYNCED_AT_KEY, syncedAt],
    [ADDED_KEY, JSON.stringify(added)],
  ]);
}

/** 後から増えた施設。新しいものが後ろに来る。 */
export async function getAddedFacilities(): Promise<AddedFacility[]> {
  try {
    const raw = await AsyncStorage.getItem(ADDED_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (a): a is AddedFacility =>
        typeof a?.id === 'string' && typeof a?.at === 'string',
    );
  } catch {
    // 壊れていたら捨てる。お知らせが出なくなるだけで、害はない。
    return [];
  }
}

/** 端末の内容がいつのものか */
export async function getSyncedAt(): Promise<Date | null> {
  const c = await getCatalog();
  if (!c.syncedAt) return null;
  const at = new Date(c.syncedAt);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** 端末に入っている施設の件数 */
export async function getCachedFacilityCount(): Promise<number> {
  return (await getCatalog()).facilities.length;
}
