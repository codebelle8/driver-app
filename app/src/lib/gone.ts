/**
 * 管理者に消された施設の扱い。
 *
 * **なぜ要るか**
 *   履歴とお気に入りは施設の id だけを控えている。管理画面で施設が
 *   消されると、次の取り込みでその id が見つからなくなる。
 *   これまでは黙って一覧から落としていたため、留めておいたはずの
 *   施設が理由もなく消えた形になっていた。利用者からは不具合と
 *   区別がつかない。
 *
 * **名前だけは控える**
 *   消えたあとに「何が消えたのか」を出すには、名前が要る。
 *   ただし控えた名前は、施設が端末にある間は使わない。表示は
 *   そのつど取り込んだ内容から引く。控えを優先すると、施設側の
 *   改名が反映されなくなる。
 *
 *   日本語と英語の両方を控える。片方だけだと、英語で使っている方に
 *   日本語の名前が出る。
 *
 * **押されたときに伝えて、そこで外す**
 *   出しっぱなしにすると、開けない行が並び続ける。押した時点で
 *   理由を伝えて外せば、一覧はひとりでに整う。
 */
import type { Facility } from './types';
import type { Locale } from './i18n/dictionaries';

/** 控えておく名前。表示は施設が見つからないときだけに使う。 */
export interface NameSnapshot {
  name?: string;
  name_en?: string | null;
}

/** 施設から控えを作る */
export function snapshotOf(f: Facility): NameSnapshot {
  return { name: f.name, name_en: f.name_en };
}

/**
 * 消えた施設に出す名前。
 *
 * 控えが無い（この仕組みより前に留めたもの）ときは null。
 * 呼ぶ側が「削除された施設」といった代わりの言い方を当てる。
 */
export function snapshotName(s: NameSnapshot, locale: Locale): string | null {
  if (locale === 'en' && s.name_en && s.name_en.trim() !== '') return s.name_en;
  return s.name && s.name.trim() !== '' ? s.name : null;
}
