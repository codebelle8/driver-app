/**
 * 時刻の言い方。
 *
 * 「2026-08-30T03:12:00Z」と出しても、走行前の一瞥では判断できない。
 * 「3日前」のほうが、その情報が古いかどうかを即座に決められる。
 *
 * 文言は辞書から受け取る。組み立て方（数と単位の並び）が言語で
 * 違うため、ここで文字列をつなぐと英語側で不自然になる。
 */
import { fill, formatDate, type Dictionary } from './i18n/dictionaries';

/** 「3日前」のような短い言い方 */
export function describeWhen(at: string, t: Dictionary): string {
  const ms = new Date(at).getTime();
  if (Number.isNaN(ms)) return '';
  return describeSince(ms, t);
}

/**
 * ある時刻からの隔たりを短く言う。
 *
 * 履歴・お気に入り・取り込みの3か所で同じ言い方を使う。
 * 別々に書いていたところ、片方だけ直る形になっていた。
 */
export function describeSince(ms: number, t: Dictionary): string {
  const minutes = Math.floor((Date.now() - ms) / 60000);
  if (minutes < 1) return t.when.justNow;
  if (minutes < 60) return fill(t.when.minutesAgo, { n: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return fill(t.when.hoursAgo, { n: hours });

  const days = Math.floor(hours / 24);
  if (days === 1) return t.when.yesterday;
  // 「40日前」まで来ると、いつのことか分からなくなる。日付で示す。
  if (days > 7) return formatDate(t, new Date(ms));
  return fill(t.when.daysAgo, { n: days });
}
