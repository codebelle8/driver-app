/**
 * 見た施設の履歴。
 *
 * **なぜ要るか**
 *   同じ施設へ何度も向かうのが、この仕事の常態にあたる。
 *   前回調べた車寄せを、名前を打ち直さずに呼び戻せるようにする。
 *
 * **何を残すか**
 *   施設の id と、開いた時刻だけ。名前も住所も控えない。
 *   控えてしまうと、施設側が変わったときに古い内容が残り続ける。
 *   表示するときに、そのつど端末のデータベースから引き直す。
 *
 * **どこに残すか**
 *   端末の中だけ。サーバーへは送らない。
 *   どのドライバーがどの施設を見たかは、送る必要のない情報にあたる。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ALIAS_SEPARATOR, getDatabase } from './db';
import type { Facility } from './types';

const KEY = 'kn_history';

/**
 * 残す件数の上限。
 *
 * これを超えたぶんは古いほうから落とす。
 * 際限なく貯めても、半年前に見た施設を一覧から探すことはない。
 */
export const HISTORY_LIMIT = 100;

/** 保存している中身。表示に要るものは、そのつど引き直す。 */
interface Visit {
  id: string;
  /** 最後に開いた時刻 */
  at: string;
}

export interface HistoryEntry {
  facility: Facility;
  at: string;
}

async function readVisits(): Promise<Visit[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (v): v is Visit =>
        v && typeof v.id === 'string' && typeof v.at === 'string',
    );
  } catch {
    // 壊れていたら捨てる。履歴が消えるだけで、施設は探せる。
    return [];
  }
}

async function writeVisits(list: Visit[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
}

/**
 * 施設を見たことを控える。
 *
 * 同じ施設は重ねずに、先頭へ動かして時刻を更新する。
 * 1つの施設を3回開いたら履歴が3行になる作りだと、
 * よく使う施設ほど一覧を埋めてしまう。
 */
export async function recordVisit(id: string): Promise<void> {
  const list = await readVisits();
  const rest = list.filter((v) => v.id !== id);
  await writeVisits([{ id, at: new Date().toISOString() }, ...rest]);
}

/**
 * 履歴を、新しい順に返す。
 *
 * 端末から消えた施設は落とす。管理側で非公開にされたものが
 * 履歴からだけ開ける、という状態を残さないため。
 */
export async function fetchHistory(): Promise<HistoryEntry[]> {
  const visits = await readVisits();
  if (visits.length === 0) return [];

  const db = await getDatabase();
  const placeholders = visits.map(() => '?').join(', ');
  const rows = await db.getAllAsync<Facility & { aliases: string }>(
    `select id, code, name, name_kana, aliases, category_id, prefecture, city,
            address_line, summary, lat, lng, updated_at
       from facilities
      where id in (${placeholders})`,
    visits.map((v) => v.id),
  );

  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: HistoryEntry[] = [];
  for (const v of visits) {
    const row = byId.get(v.id);
    if (!row) continue;
    out.push({
      facility: {
        ...row,
        aliases: row.aliases ? row.aliases.split(ALIAS_SEPARATOR).filter(Boolean) : [],
      },
      at: v.at,
    });
  }
  return out;
}

/** 履歴に何件あるか。一覧を組み立てずに数だけ要るとき用。 */
export async function countHistory(): Promise<number> {
  return (await readVisits()).length;
}

/** 1件を消す */
export async function removeVisit(id: string): Promise<void> {
  const list = await readVisits();
  await writeVisits(list.filter((v) => v.id !== id));
}

/** すべて消す */
export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
