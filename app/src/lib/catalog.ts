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
const CHANGED_KEY = 'kn_catalog_changed';
const CATEGORY_KEY = 'kn_catalog_categories_changed';

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

/**
 * 変わった点の種類。
 *
 * **文面はここに入れない。** 画面が辞書から組み立てる。
 * ここは表示の言語を知らない。
 */
export type ChangeKind =
  | 'approach' // 進入方法・進入元
  | 'coords' // ナビ投入座標・停車位置
  | 'height' // 高さ制限
  | 'roof' // 屋根
  | 'hours' // 24時間の可否
  | 'entry' // 入口が増えた・減った・止まった・名前が変わった
  | 'name' // 施設名
  | 'address'; // 住所

/**
 * カテゴリに起きたこと。
 *
 *   added    … 増えた
 *   renamed  … 名前が変わった
 *   removed  … 出なくなった（消された、または「無効」にされた）
 */
export type CategoryChange = 'added' | 'renamed' | 'removed';

/** カテゴリの変わり目。お知らせに使う。 */
export interface ChangedCategory {
  id: string;
  at: string;
  change: CategoryChange;
  /** 気づいた時点の名前。消えたあとも出せるように控えておく。 */
  name: string;
}

/** 案内の中身が変わった施設。お知らせに使う。 */
export interface ChangedFacility {
  id: string;
  /** 端末が気づいた時刻 */
  at: string;
  /** 何が変わったか。1件に複数入る。 */
  kinds: ChangeKind[];
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
/**
 * 2つの控えを突き合わせて、**何が変わったか**を返す。
 *
 * **日時（updated_at）では判じない。**
 *   以前はそれで「更新されました」を出していたが、データを一括で
 *   入れ直すと全件の更新日時が同じになり、**一度も見たことのない
 *   施設について30件が並んだ**（2026-09-04 に取り下げ）。
 *   表記の統一や住所の補完でも更新日時は動く。
 *
 *   **中身そのものを比べる。** 値が変わっていなければ、何度入れ直しても
 *   お知らせは出ない。
 *
 * **乗務員に関わるものだけを見る。**
 *   英語表記・並び順・記号は、向かう先の判断を変えない。ここで拾うと
 *   「変わりました」と言われて開いても、何も違わないことになる。
 */
function changesOf(
  before: Facility,
  after: Facility,
  beforeEntries: EntryPoint[],
  afterEntries: EntryPoint[],
): ChangeKind[] {
  const kinds = new Set<ChangeKind>();

  if (before.name !== after.name) kinds.add('name');
  if (
    before.prefecture !== after.prefecture ||
    before.city !== after.city ||
    before.address_line !== after.address_line
  ) {
    kinds.add('address');
  }

  const was = new Map(beforeEntries.map((e) => [e.id, e]));
  const now = new Map(afterEntries.map((e) => [e.id, e]));

  /* 入口そのものが増えた・減った */
  if (was.size !== now.size || [...now.keys()].some((id) => !was.has(id))) {
    kinds.add('entry');
  }

  for (const [id, after2] of now) {
    const before2 = was.get(id);
    if (!before2) continue;

    if (
      before2.approach_text !== after2.approach_text ||
      before2.approach_from !== after2.approach_from
    ) {
      kinds.add('approach');
    }
    if (
      before2.nav_lat !== after2.nav_lat ||
      before2.nav_lng !== after2.nav_lng ||
      before2.dropoff_lat !== after2.dropoff_lat ||
      before2.dropoff_lng !== after2.dropoff_lng
    ) {
      kinds.add('coords');
    }
    if (before2.height_limit_cm !== after2.height_limit_cm) kinds.add('height');
    if (before2.is_roofed !== after2.is_roofed) kinds.add('roof');
    if (before2.is_24h !== after2.is_24h) kinds.add('hours');
    /*
      入口の名前や区分が変わった。

      有効・無効（is_active）はここでは見ない。端末はその欄を
      取り込んでいないため（sync.ts の select に無い）。
    */
    if (before2.name !== after2.name || before2.kind !== after2.kind) {
      kinds.add('entry');
    }
  }

  return [...kinds];
}

/** 施設ごとに入口をまとめる */
function byFacility(list: EntryPoint[]): Map<string, EntryPoint[]> {
  const m = new Map<string, EntryPoint[]>();
  for (const e of list) {
    const got = m.get(e.facility_id);
    if (got) got.push(e);
    else m.set(e.facility_id, [e]);
  }
  return m;
}

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

  /*
    案内の中身が変わった施設を控える。ご指示 2026-09-14。

    **新しく増えたものはここに入れない。** そちらは「新着」として
    別に出る。両方に出すと、同じ施設が2件並ぶ。

    **同じ施設は1件にまとめる。** 前の控えが残っていれば置き換える。
    5回直された施設が5件並んでも、読む側には「いまどう違うのか」しか
    要らない。控えの時刻が変わるため、読み直しの対象にもなる。
  */
  const wasById = new Map(before.facilities.map((f) => [f.id, f]));
  const wasEntries = byFacility(before.entryPoints);
  const nowEntries = byFacility(payload.entryPoints);

  const modified: ChangedFacility[] =
    known.size === 0
      ? []
      : payload.facilities.flatMap((f) => {
          const was = wasById.get(f.id);
          if (!was) return [];
          const kinds = changesOf(
            was,
            f,
            wasEntries.get(f.id) ?? [],
            nowEntries.get(f.id) ?? [],
          );
          return kinds.length > 0 ? [{ id: f.id, at: syncedAt, kinds }] : [];
        });

  /*
    カテゴリの変わり目。ご指示 2026-09-14。

    「管理画面で直したのに、アプリにすぐ出ない」とのご報告による。
    取り込みは起動時に1回で、開いたままでは変わらない。**変わったことを
    お知らせで伝える。**

    **「無効」にされたものは「出なくなった」として扱う。** 消すのと
    区別しても、読む側にできることは変わらない。
  */
  const shown = (list: Category[]) => list.filter((x) => x.is_active !== false);
  const wasCats = new Map(shown(before.categories).map((x) => [x.id, x]));
  const nowCats = new Map(shown(payload.categories).map((x) => [x.id, x]));

  const catChanges: ChangedCategory[] =
    before.categories.length === 0
      ? []
      : [
          ...[...nowCats.values()]
            .filter((x) => !wasCats.has(x.id))
            .map((x) => ({ id: x.id, at: syncedAt, change: 'added' as const, name: x.name })),
          ...[...wasCats.values()]
            .filter((x) => !nowCats.has(x.id))
            .map((x) => ({ id: x.id, at: syncedAt, change: 'removed' as const, name: x.name })),
          ...[...nowCats.values()]
            .filter((x) => {
              const was = wasCats.get(x.id);
              return was && was.name !== x.name;
            })
            .map((x) => ({ id: x.id, at: syncedAt, change: 'renamed' as const, name: x.name })),
        ];

  const freshCatIds = new Set(catChanges.map((c) => c.id));
  const categories = [
    ...(await getChangedCategories()).filter((c) => !freshCatIds.has(c.id)),
    ...catChanges,
  ]
    .filter((c) => c.at >= since)
    .slice(-ADDED_LIMIT);

  const freshIds = new Set(modified.map((c) => c.id));
  const changed = [
    ...(await getChangedFacilities()).filter((c) => !freshIds.has(c.id)),
    ...modified,
  ]
    .filter((c) => c.at >= since)
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
    [CHANGED_KEY, JSON.stringify(changed)],
    [CATEGORY_KEY, JSON.stringify(categories)],
  ]);
}

/** カテゴリの変わり目。新しいものが後ろに来る。 */
export async function getChangedCategories(): Promise<ChangedCategory[]> {
  try {
    const raw = await AsyncStorage.getItem(CATEGORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (c): c is ChangedCategory =>
        typeof c?.id === 'string' && typeof c?.at === 'string' && typeof c?.name === 'string',
    );
  } catch {
    // 壊れていたら捨てる。お知らせが出なくなるだけで、害はない。
    return [];
  }
}

/** 案内の中身が変わった施設。新しいものが後ろに来る。 */
export async function getChangedFacilities(): Promise<ChangedFacility[]> {
  try {
    const raw = await AsyncStorage.getItem(CHANGED_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (c): c is ChangedFacility =>
        typeof c?.id === 'string' && typeof c?.at === 'string' && Array.isArray(c?.kinds),
    );
  } catch {
    // 壊れていたら捨てる。お知らせが出なくなるだけで、害はない。
    return [];
  }
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
