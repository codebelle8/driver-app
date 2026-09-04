/**
 * お気に入りの施設。
 *
 * **なぜ要るか**
 *   同じ施設へ繰り返し向かうのがこの仕事の常態で、そのうち何件かは
 *   「いつもの行き先」になる。履歴は見た順に流れていくため、
 *   よく行く施設ほど下へ埋もれる。手で留めておける場所が要る。
 *
 * **何を残すか**
 *   施設の id と、留めた時刻だけ。名前も住所も控えない。
 *   控えてしまうと、施設側が変わったときに古い内容が残り続ける。
 *   表示するときに、そのつど端末の中から引き直す（history.ts と同じ）。
 *
 * **どこに残すか**
 *   端末の中だけ。サーバーへは送らない。
 *   どのドライバーがどの施設を留めたかは、送る必要のない情報にあたる。
 *
 *   これは「この端末を使う人の持ち物」という意味でもある。
 *   端末を替えると引き継がれない。会員の仕組みを入れるまでは、
 *   持ち出せないほうが安全側に倒れる。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchFacilitiesByIds } from './facilities';
import type { Facility } from './types';

const KEY = 'kn_favorites';

/**
 * 留められる件数の上限。
 *
 * 履歴（100件）より少なくしている。あふれるほど留めるなら、
 * それは「よく行く場所」ではなく一覧そのものになる。
 */
export const FAVORITE_LIMIT = 50;

/** 保存している中身。表示に要るものは、そのつど引き直す。 */
interface Pinned {
  id: string;
  /** 留めた時刻 */
  at: string;
}

export interface FavoriteEntry {
  facility: Facility;
  at: string;
}

async function read(): Promise<Pinned[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (x): x is Pinned => typeof x?.id === 'string' && typeof x?.at === 'string',
    );
  } catch {
    // 壊れていたら捨てる。留め直せば戻る。
    return [];
  }
}

async function write(list: Pinned[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, FAVORITE_LIMIT)));
}

/** いま留めてある施設の id */
export async function getFavoriteIds(): Promise<Set<string>> {
  return new Set((await read()).map((x) => x.id));
}

/** その施設を留めてあるか */
export async function isFavorite(id: string): Promise<boolean> {
  return (await getFavoriteIds()).has(id);
}

/**
 * 留める／外すを切り替える。
 *
 * 切り替えた後の状態を返す。呼ぶ側が読み直さずに画面へ映せる。
 */
export async function toggleFavorite(id: string): Promise<boolean> {
  const list = await read();
  const at = list.findIndex((x) => x.id === id);

  if (at >= 0) {
    list.splice(at, 1);
    await write(list);
    return false;
  }

  // 新しく留めたものを先頭へ。最後に留めたものから順に出す。
  list.unshift({ id, at: new Date().toISOString() });
  await write(list);
  return true;
}

/** 1件だけ外す */
export async function removeFavorite(id: string): Promise<void> {
  await write((await read()).filter((x) => x.id !== id));
}

/** すべて外す */
export async function clearFavorites(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/**
 * 留めてある施設を、新しい順に返す。
 *
 * 端末に無い施設は落とす。取り込みで消えた施設を留めたままだと、
 * 押しても開けない行が残る。
 */
export async function fetchFavorites(): Promise<FavoriteEntry[]> {
  const list = await read();
  if (list.length === 0) return [];

  const byId = await fetchFacilitiesByIds(list.map((x) => x.id));
  return list
    .map((x) => {
      const facility = byId.get(x.id);
      return facility ? { facility, at: x.at } : null;
    })
    .filter((x): x is FavoriteEntry => x !== null);
}
