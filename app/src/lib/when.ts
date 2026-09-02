/**
 * 時刻の言い方。
 *
 * 「2026-08-30T03:12:00Z」と出しても、走行前の一瞥では判断できない。
 * 「3日前」のほうが、その情報が古いかどうかを即座に決められる。
 */

/** 「3日前」のような短い言い方 */
export function describeWhen(at: string): string {
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return '';

  const minutes = Math.floor((Date.now() - t) / 60000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;

  const days = Math.floor(hours / 24);
  if (days === 1) return '昨日';
  // 「40日前」まで来ると、いつのことか分からなくなる。日付で示す。
  if (days > 7) {
    const d = new Date(t);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${days}日前`;
}
