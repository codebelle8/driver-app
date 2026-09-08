/**
 * お気に入りと閲覧履歴を、サーバーへ預ける口。
 *
 * **端末の中が主で、サーバーは控え**
 *   画面が読むのは、これまでどおり端末の中（AsyncStorage）。
 *   電波の届かない駐車場でも一覧が出る、という性質を落とさない。
 *   サーバーへは後追いで写す。写せなければ、次に開いたときに写す。
 *
 * **失敗しても黙って戻る**
 *   留める・外すという操作そのものは端末の中で完結している。
 *   通信できないからといって、留められなかったことにはしない。
 *   ここから例外は投げない。呼ぶ側に後始末を書かせない。
 *
 * **読めなかったのか、空だったのかを分ける**
 *   pull は、読めなければ null を返す。空の並びと同じ扱いにすると、
 *   圏外で開いただけで「サーバー側は空」と判断し、突き合わせで
 *   端末の中身をサーバーへ押し込んでしまう……のはまだよいが、
 *   逆向き（サーバーの中身で端末を上書き）だと消える。分けておく。
 */
import { supabase } from './supabase';

/** 端末側と同じ形。施設の id と時刻だけ。 */
export interface RemoteRow {
  id: string;
  at: string;
}

/** いまログインしている人。していなければ null。 */
export async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

const FAVORITES = 'driver_favorites';
const HISTORY = 'driver_history';

/** 表ごとの、時刻の列名 */
const AT = { [FAVORITES]: 'pinned_at', [HISTORY]: 'seen_at' } as const;

type Table = typeof FAVORITES | typeof HISTORY;

async function pull(table: Table): Promise<RemoteRow[] | null> {
  const uid = await currentUserId();
  if (!uid) return null;

  const at = AT[table];
  const { data, error } = await supabase
    .from(table)
    .select(`facility_id, ${at}`)
    .eq('user_id', uid);

  if (error || !data) return null;
  return data.map((r) => ({
    id: (r as Record<string, string>).facility_id,
    at: (r as Record<string, string>)[at],
  }));
}

async function push(table: Table, rows: RemoteRow[]): Promise<void> {
  if (rows.length === 0) return;
  const uid = await currentUserId();
  if (!uid) return;

  const at = AT[table];
  await supabase
    .from(table)
    .upsert(
      rows.map((r) => ({ user_id: uid, facility_id: r.id, [at]: r.at })),
      { onConflict: 'user_id,facility_id' },
    )
    /*
      ここで握りつぶす。

      施設が消されていれば外部キーで弾かれるが、それは正しい動き。
      押し込めなかった1件のために、留める操作そのものを失敗に
      見せる理由がない。
    */
    .then(
      () => undefined,
      () => undefined,
    );
}

async function drop(table: Table, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const uid = await currentUserId();
  if (!uid) return;

  await supabase
    .from(table)
    .delete()
    .eq('user_id', uid)
    .in('facility_id', ids)
    .then(
      () => undefined,
      () => undefined,
    );
}

async function clearAll(table: Table): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  await supabase
    .from(table)
    .delete()
    .eq('user_id', uid)
    .then(
      () => undefined,
      () => undefined,
    );
}

// --- お気に入り ---------------------------------------------------------------

export const pullFavorites = () => pull(FAVORITES);
export const pushFavorites = (rows: RemoteRow[]) => push(FAVORITES, rows);
export const dropFavorites = (ids: string[]) => drop(FAVORITES, ids);
export const clearRemoteFavorites = () => clearAll(FAVORITES);

// --- 閲覧履歴 -----------------------------------------------------------------

export const pullVisits = () => pull(HISTORY);
export const pushVisits = (rows: RemoteRow[]) => push(HISTORY, rows);
export const dropVisits = (ids: string[]) => drop(HISTORY, ids);
export const clearRemoteVisits = () => clearAll(HISTORY);
