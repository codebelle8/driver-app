/**
 * この端末を見分ける符号。
 *
 * **1つのアカウントは1台まで**（ご指示）。どの端末で入っているかを
 * 名簿へ控え、控えと違う端末は自分から出ていく。
 *
 * **端末を特定できる値は使わない**
 *   広告ID や機種名のような、その端末そのものを指す値は取らない。
 *   ここで作るのは、このアプリを初めて開いたときに一度だけ作る、
 *   ただのでたらめな文字列。消せば別の端末として扱われるが、
 *   そのときは入り直していただくだけで済む。
 *
 * **ログインとは別に持つ**
 *   ログアウトしても消さない。同じ端末で入り直したときに、
 *   別の端末とみなされて自分を締め出すことになる。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'kn_device_id';

let cached: string | null = null;

/** でたらめな文字列。当てられる必要は無いが、ぶつからないようにする。 */
function make(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** この端末の符号。無ければ作って残す。 */
export async function deviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) {
      cached = saved;
      return saved;
    }
    const made = make();
    await AsyncStorage.setItem(KEY, made);
    cached = made;
    return made;
  } catch {
    /*
      端末へ残せない場合（保存を拒む設定など）。

      その場で作った符号を使う。開くたびに別の端末とみなされ、
      入り直しが要るが、使えなくなるよりはよい。
    */
    cached ??= make();
    return cached;
  }
}
