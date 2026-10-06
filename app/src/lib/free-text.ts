/**
 * 「無料でお使いいただいている」ことの文言を、理由ごとに組み立てる。
 *
 * 上位の方（2026-10-06）は「○月○日まで」と終わりの日を添える。無料の終わり
 * （free_until）は翌月の初日0時なので、見せるのはその前日（月の最後の日）。
 * 調査員・所有者は期限なしで、日付の差し込み口を持たない文言をそのまま返す。
 */
import { freeShown, type Account, type FreeReason } from './account';
import { fill, formatDate, type Dictionary } from './i18n/dictionaries';

export function freeText(
  templates: Record<FreeReason, string>,
  account: Account,
  t: Dictionary,
): string | null {
  const r = freeShown(account);
  if (!r) return null;
  const last = account.freeUntil ? new Date(new Date(account.freeUntil).getTime() - 1) : null;
  return fill(templates[r], { date: last ? formatDate(t, last) : '' });
}
