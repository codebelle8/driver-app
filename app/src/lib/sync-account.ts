/**
 * お気に入りと閲覧履歴を、端末とサーバーで突き合わせる。
 *
 * **いつ走らせるか**
 *   ログインしている人が分かった時点で一度だけ。開くたびに走らせても
 *   増える情報はなく、通信のぶんだけ起動が遅くなる。
 *
 * **寄せ方**
 *   足し合わせる。**消えるより重複するほうがまし**
 *   （docs/12-phase2-design.md 1-3）。片方に無いものを「外された」と
 *   見なすと、圏外の端末が持っていたぶんで相手側を消してしまう。
 *   増えたものは押して外せるが、消えたものは戻せない。
 *
 * **消された施設は送らない**
 *   サーバーの表は施設への外部キーを持っており、管理者が消した施設を
 *   送ると弾かれる。一度に送っているので、1件のために全部が入らない。
 *   端末に持っている施設だけに絞ってから送る。
 *
 * **取り込みが済んでいなければ、今回は送らない**
 *   施設を1件も持っていない状態（初回・圏外）で絞ると、全部が
 *   落ちてしまう。そのときは何も送らず、次に開いたときへ回す。
 *   端末側の突き合わせは済ませてあるので、取りこぼしにはならない。
 */
import { fetchFacilitiesByIds } from './facilities';
import { mergeFavorites } from './favorites';
import { mergeVisits } from './history';
import {
  currentUserId,
  dropFavorites,
  dropVisits,
  pullFavorites,
  pullVisits,
  pushFavorites,
  pushVisits,
  type RemoteRow,
} from './remote-store';

/** 直近に突き合わせた相手。同じ人で二度は走らせない。 */
let lastSynced: string | null = null;

/**
 * 突き合わせる。
 *
 * 走ったときは true。ログインしていない・読めなかったときは false。
 */
export async function syncAccountData(force = false): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) {
    lastSynced = null;
    return false;
  }
  if (!force && lastSynced === uid) return false;

  const [remoteFavorites, remoteVisits] = await Promise.all([pullFavorites(), pullVisits()]);

  // どちらも読めなければ、圏外とみて何もしない
  if (remoteFavorites === null && remoteVisits === null) return false;

  const favorites = await mergeFavorites(remoteFavorites ?? []);
  const visits = await mergeVisits(remoteVisits ?? []);

  await Promise.all([
    sendKept('favorites', favorites.keep),
    sendKept('visits', visits.keep),
    dropFavorites(favorites.drop),
    dropVisits(visits.drop),
  ]);

  lastSynced = uid;
  return true;
}

/** ログアウトしたら、次のログインでまた突き合わせる */
export function forgetSync(): void {
  lastSynced = null;
}

/** 端末に持っている施設だけに絞って送る */
async function sendKept(kind: 'favorites' | 'visits', rows: RemoteRow[]): Promise<void> {
  if (rows.length === 0) return;

  const known = await fetchFacilitiesByIds(rows.map((r) => r.id));
  // 1件も引けないのは、取り込みが済んでいないとき。今回は送らない。
  if (known.size === 0) return;

  const sendable = rows.filter((r) => known.has(r.id));
  if (sendable.length === 0) return;

  if (kind === 'favorites') await pushFavorites(sendable);
  else await pushVisits(sendable);
}
