/**
 * 施設データの取得。
 *
 * **サーバーではなく端末の中から読む。**
 *   このアプリが使われるのは地下駐車場や高架下で、目的地に近づくほど
 *   電波が悪くなる。到着直前に「読み込み中」で止まっては意味がない。
 *   サーバーへの問い合わせは起動時の取り込み (sync.ts) に限り、
 *   画面の表示は常に端末の中だけで完結させる。
 *
 * **全件をメモリで絞る。**
 *   以前は SQLite に入れて SQL で照会していたが、web 版が必要とする
 *   OPFS は Safari で使えず、iPhone で動かなかった。
 *   対象は150件程度で、配列を絞るほうが速く、どのブラウザでも同じ結果になる。
 *
 * 公開されていないものは、そもそも取り込み時にサーバー側の RLS が弾く。
 * 端末に届いた時点で、すべて公開済みのもの。
 */
import { getCatalog } from './catalog';
import { normalizeSearchText } from './search';
import type {
  Caution,
  Category,
  EntryPoint,
  Facility,
  FacilityDetail,
  Photo,
} from './types';

/**
 * 一度に読み込む件数。
 *
 * 走行前の限られた時間で見るため、まず15件だけ出す。
 * 続きは下端まで送ったときに読み込む。
 * 150件を一度に描くと、古い端末では最初の表示までに間が空く。
 */
export const PAGE_SIZE = 15;

export async function fetchCategories(): Promise<Category[]> {
  const c = await getCatalog();
  return [...c.categories].sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * 案内できる範囲。
 *
 * 端末に入っている施設の所在地から求める。決め打ちの地名を出すと、
 * 対応していない場所にいても案内できるように見えてしまう。
 */
export async function fetchCoverage(): Promise<{
  prefectures: string[];
  cities: number;
  /** 端末に入っている総数。通信を待たずに件数を出すために使う。 */
  total: number;
}> {
  const { facilities } = await getCatalog();

  // 件数の多い都道府県から並べる
  const byPref = new Map<string, Set<string>>();
  for (const f of facilities) {
    if (!f.prefecture) continue;
    const cities = byPref.get(f.prefecture) ?? new Set<string>();
    if (f.city) cities.add(f.city);
    byPref.set(f.prefecture, cities);
  }

  const counts = new Map<string, number>();
  for (const f of facilities) {
    if (!f.prefecture) continue;
    counts.set(f.prefecture, (counts.get(f.prefecture) ?? 0) + 1);
  }

  const prefectures = [...byPref.keys()].sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
  );

  return {
    prefectures,
    cities: [...byPref.values()].reduce((n, s) => n + s.size, 0),
    total: facilities.length,
  };
}

export interface SearchPage {
  rows: Facility[];
  /**
   * 絞り込みに当てはまる総数。
   *
   * rows は一度に15件しか返らないため、これが無いと画面には
   * 「15件」としか出せず、全部で何件あるのかが伝わらない。
   */
  total: number;
  /** さらに読み込める分があるか */
  hasMore: boolean;
}

/**
 * 施設を検索する。
 *
 * 施設名・よみがな・別名・住所をまとめた文字列に対して部分一致で当てる。
 * この文字列は取り込み時にサーバーと同じ規則で正規化しているため、
 * 「ていこく」でも「うちさいわい」でも「帝国」でも同じ施設に届く。
 */
export async function searchFacilities(options: {
  query?: string;
  categoryId?: string | null;
  /** 0 から始まる読み込み位置 */
  offset?: number;
  /**
   * 一度に読む件数。既定は PAGE_SIZE。
   *
   * 広い画面では一覧と地図を左右に並べる。地図に15件だけピンが立ち、
   * 送るたびに増えるのでは、どこに何があるのか掴めない。
   * その場合だけ多めに読む。
   */
  pageSize?: number;
}): Promise<SearchPage> {
  const { facilities } = await getCatalog();
  const offset = options.offset ?? 0;
  const pageSize = options.pageSize ?? PAGE_SIZE;

  const needle = options.query ? normalizeSearchText(options.query) : '';

  let hit = facilities;
  if (needle) hit = hit.filter((f) => f.searchText.includes(needle));
  if (options.categoryId) hit = hit.filter((f) => f.category_id === options.categoryId);

  /*
    クライアント様の表の番号順。

    よみがな順にしないのは、漢字を含む名前のよみが揃っておらず
    （193件中150件が未入力）、推測で埋めると誤った位置に並ぶため。
    表の番号はエリアごとにまとまっており、これを保てば
    お手元の一覧と画面が1対1で対応し、照合しやすい。
  */
  const sorted = [...hit].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ja'),
  );
  const rows = sorted.slice(offset, offset + pageSize);

  return {
    rows,
    total: sorted.length,
    hasMore: offset + rows.length < sorted.length,
  };
}

/** 詳細画面に必要なものを集める */
export async function fetchFacilityDetail(id: string): Promise<FacilityDetail | null> {
  const c = await getCatalog();

  const facility = c.facilities.find((f) => f.id === id);
  if (!facility) return null;

  const entryPoints = c.entryPoints
    .filter((e) => e.facility_id === id)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));

  const ids = new Set(entryPoints.map((e) => e.id));

  const cautionsByEntryPoint: Record<string, Caution[]> = {};
  for (const x of c.cautions) {
    if (!ids.has(x.entry_point_id)) continue;
    (cautionsByEntryPoint[x.entry_point_id] ??= []).push(x);
  }
  for (const list of Object.values(cautionsByEntryPoint)) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  const photosByEntryPoint: Record<string, Photo[]> = {};
  for (const p of c.photos) {
    if (!p.entry_point_id || !ids.has(p.entry_point_id)) continue;
    (photosByEntryPoint[p.entry_point_id] ??= []).push(p);
  }
  for (const list of Object.values(photosByEntryPoint)) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  return { facility, entryPoints, cautionsByEntryPoint, photosByEntryPoint };
}

/** 地図に立てるピン */
export interface Pin {
  facilityId: string;
  name: string;
  lat: number;
  lng: number;
}

/**
 * 施設のピンを返す。指定が無ければ端末にある全件。
 *
 * **座標は進入口から取る。**
 *   facilities.lat/lng はほとんどが空で、実際の座標は
 *   entry_points.nav_lat/nav_lng にしか入っていない。
 *   以前これを取り違え、座標での突き合わせが働かなかったことがある。
 *
 * 進入口が2つある施設は先頭だけを使う。一覧の地図では
 * 「その施設がどこにあるか」が分かれば足り、どちらの進入路かは
 * 詳細画面で示す。
 */
export async function fetchPins(facilities?: Facility[]): Promise<Pin[]> {
  const c = await getCatalog();
  const targets = facilities ?? c.facilities;

  const first = new Map<string, { lat: number; lng: number }>();
  for (const e of [...c.entryPoints].sort((a, b) => a.sort_order - b.sort_order)) {
    if (e.nav_lat === null || e.nav_lng === null) continue;
    if (first.has(e.facility_id)) continue;
    first.set(e.facility_id, { lat: e.nav_lat, lng: e.nav_lng });
  }

  const pins: Pin[] = [];
  for (const f of targets) {
    const at = first.get(f.id) ?? (f.lat !== null && f.lng !== null ? { lat: f.lat, lng: f.lng } : null);
    if (at) pins.push({ facilityId: f.id, name: f.name, ...at });
  }
  return pins;
}

/** 履歴の並べ替えに使う。id から施設を引く。 */
export async function fetchFacilitiesByIds(ids: string[]): Promise<Map<string, Facility>> {
  const { facilities } = await getCatalog();
  const want = new Set(ids);
  return new Map(facilities.filter((f) => want.has(f.id)).map((f) => [f.id, f]));
}

/** お知らせに使う。進入口と施設を結んだ形で返す。 */
export async function fetchCautionsWithFacility(): Promise<
  { caution: Caution; facility: Facility }[]
> {
  const c = await getCatalog();
  const epToFacility = new Map(c.entryPoints.map((e) => [e.id, e.facility_id]));
  const byId = new Map(c.facilities.map((f) => [f.id, f]));

  const out: { caution: Caution; facility: Facility }[] = [];
  for (const x of [...c.cautions].sort((a, b) => a.sort_order - b.sort_order)) {
    const fid = epToFacility.get(x.entry_point_id);
    const facility = fid ? byId.get(fid) : undefined;
    if (facility) out.push({ caution: x, facility });
  }
  return out;
}

/*
  「最近変わった施設」を返す関数は外した（2026-09-04）。

  facilities.updated_at は「案内の中身が変わった」ことを示さない。
  表記の統一でも住所の補完でも動くうえ、データを一括で入れ直すと
  全件が同時に変わる。実際、193件の取り込みで全件が「更新されました」
  として並び、一度も見ていない施設の通知が30件出る状態になった。

  お知らせは「新しく増えた施設」に替えた（app/src/lib/notices.ts）。
  端末が前回持っていた一覧との差分なので、誤って出ることがない。
*/

/** 型の再輸出。呼ぶ側が catalog を意識しなくて済むように。 */
export type { EntryPoint };
