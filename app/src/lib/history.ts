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
 *   端末の中が主。画面が読むのはここで、電波が届かなくても一覧が出る。
 *
 *   **ログインしている方のぶんだけ、サーバーへ後追いで写す。**
 *   機種変更で失われないようにするため（運用版）。登録していない方は
 *   これまでどおり端末の中だけで、外へは何も出ない。
 *
 *   預かるぶんは、管理画面からは読めないようにしてある
 *   （supabase/migrations/20260908000002）。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchFacilitiesByIds } from './facilities';
import { snapshotOf, type NameSnapshot } from './gone';
import { clearRemoteVisits, dropVisits, pushVisits, type RemoteRow } from './remote-store';
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
interface Visit extends NameSnapshot {
  id: string;
  /** 最後に開いた時刻 */
  at: string;
}

export interface HistoryEntry {
  /** 施設の id。消えたあとも選択や削除に使うため、ここに持つ。 */
  id: string;
  /** 端末にある施設。管理者に消されたあとは null。 */
  facility: Facility | null;
  /** 消えたあとに出す名前の控え。施設があるうちは使わない。 */
  snapshot: NameSnapshot;
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
export async function recordVisit(id: string, facility?: Facility): Promise<void> {
  const list = await readVisits();
  const rest = list.filter((v) => v.id !== id);
  /*
    名前も一緒に控える。表示には使わない。
    管理者に消されたあと、何が消えたのかを出すためだけのもの。
  */
  const now = new Date().toISOString();
  await writeVisits([
    { id, at: now, ...(facility ? snapshotOf(facility) : {}) },
    ...rest,
  ]);
  void pushVisits([{ id, at: now }]);
}

/**
 * 履歴を、新しい順に返す。
 *
 * 端末から消えた施設も落とさずに返す（facility が null）。
 * 黙って消えると、調べたはずの施設が理由もなく無くなった形になる。
 * 画面側が「管理者が削除しました」と伝えて外す。
 */
export async function fetchHistory(): Promise<HistoryEntry[]> {
  const visits = await readVisits();
  if (visits.length === 0) return [];

  const byId = await fetchFacilitiesByIds(visits.map((v) => v.id));
  return visits.map((v) => ({
    id: v.id,
    facility: byId.get(v.id) ?? null,
    snapshot: { name: v.name, name_en: v.name_en },
    at: v.at,
  }));
}

/** 履歴に何件あるか。一覧を組み立てずに数だけ要るとき用。 */
export async function countHistory(): Promise<number> {
  return (await readVisits()).length;
}

/** 1件を消す */
export async function removeVisit(id: string): Promise<void> {
  const list = await readVisits();
  await writeVisits(list.filter((v) => v.id !== id));
  void dropVisits([id]);
}

/** すべて消す */
export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
  void clearRemoteVisits();
}

/**
 * 端末の控えだけを捨てる。サーバーには触れない。
 * 退会のときに使う（favorites.ts の同名の関数と同じ理由）。
 */
export async function forgetHistoryHere(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
}

/**
 * サーバーにあるものと突き合わせる。
 *
 * 寄せ方はお気に入りと同じ（favorites.ts の mergeFavorites を参照）。
 * 同じ施設は新しいほうの時刻を採る。上限（100件）を超えたぶんは
 * 古いほうから落とし、サーバーからも消す。
 */
export async function mergeVisits(
  remote: RemoteRow[],
): Promise<{ keep: RemoteRow[]; drop: string[] }> {
  const local = await readVisits();
  const byId = new Map<string, Visit>();

  for (const v of local) byId.set(v.id, v);
  for (const r of remote) {
    const had = byId.get(r.id);
    if (!had) byId.set(r.id, { id: r.id, at: r.at });
    else if (r.at > had.at) byId.set(r.id, { ...had, at: r.at });
  }

  const all = [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : -1));
  const keep = all.slice(0, HISTORY_LIMIT);
  const cut = all.slice(HISTORY_LIMIT).map((v) => v.id);

  await writeVisits(keep);
  return { keep: keep.map((v) => ({ id: v.id, at: v.at })), drop: cut };
}
