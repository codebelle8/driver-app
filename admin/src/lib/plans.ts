/**
 * 料金の刻みが「何か月ぶんか」。
 *
 * **金額はここに置かない。** 金額を出すのはアプリ側だけで（app/src/lib/plans.ts）、
 * 管理画面が使うのは月数だけにあたる。両方に金額を置くと、値上げのときに
 * 片方だけが古くなる。
 *
 * ここを使うのは「入金を確認した」を押したとき。いつまでご利用いただけるかを
 * この月数から決める（actions/members.ts）。
 *
 * **アプリ側と数が合っていること。** 刻みを増やすときは app/src/lib/plans.ts と
 * ここの両方へ足す。食い違うと、お支払いいただいた期間と画面の表示がずれる。
 * 突き合わせは tools/test-plans.mjs が見ている。
 */
import type { PlanId } from '@/lib/supabase/database.types';

export const PLAN_MONTHS: Record<PlanId, number> = {
  monthly: 1,
  quarterly: 3,
  half: 6,
  yearly: 12,
};

/**
 * お支払いいただいた期間の終わりを決める。
 *
 * **まだ残っているなら、その先へ足す。** 期限前にお振込みいただいた方の
 * 残りを切り捨てては、早く払うほど損になる。
 *
 * **無料期間の残りも足す**（ご指摘 2026-09-15）。
 *   無料期間の途中でお振込みいただいた方は、そこまでの残りを
 *   切り捨てていた。1か月の無料期間のうち3日目に払った方は、
 *   **残っていた27日ぶんを失っていた。** 早く払った方ほど損をする。
 *
 *   いま使える終わり（無料期間の終わり／お支払いいただいた期間の
 *   終わり、のうち**先のほう**）から数える。
 *
 * @param current いま使える終わり。どちらも null なら、いまから数える。
 * @param plan    お選びの刻み。未選択なら1か月として扱う。
 */
export function nextPaidUntil(
  current: { paidUntil: string | null; trialEndsAt: string | null },
  plan: PlanId | null,
  now: Date = new Date(),
): string {
  const months = PLAN_MONTHS[plan ?? 'monthly'];

  /*
    いま使える終わり。**先のほうを採る。**
    無料期間の途中でお支払いいただいた方は trialEndsAt が先になり、
    期限前にご継続いただいた方は paidUntil が先になる。
  */
  const ends = [current.paidUntil, current.trialEndsAt]
    .map((v) => (v ? new Date(v).getTime() : Number.NaN))
    .filter((t) => !Number.isNaN(t) && t > now.getTime());

  const base = ends.length > 0 ? new Date(Math.max(...ends)) : now;

  return addMonths(base, months).toISOString();
}

/**
 * 月を足す。
 *
 * **setMonth をそのまま使わない。** 1月31日 に1か月足すと 3月3日 を
 * 返す（2月に31日が無いため繰り上がる）。**お支払いの期限が、月末締めの
 * 方だけ数日長くなる。** 足した先に同じ日が無ければ、その月の末日にする。
 */
function addMonths(from: Date, months: number): Date {
  const day = from.getDate();
  const to = new Date(from);
  to.setDate(1);
  to.setMonth(to.getMonth() + months);
  const lastDay = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
  to.setDate(Math.min(day, lastDay));
  return to;
}

/** 残りの長さ。月と、その端数の日。 */
export interface Span {
  months: number;
  days: number;
}

/**
 * いまから終わりまでの残りを、月と日に分ける。
 *
 * **月だけで丸めない**（ご指摘 2026-09-15）。「あと11か月」では、
 * ちょうど11か月なのか11か月と28日なのかが分からない。
 *
 * **暦で数える。** 30日を1か月と見なすと、1年が「12か月5日」になる。
 * 9月15日から翌年9月15日までは、12か月ちょうどと出したい。
 *
 * 端数の日は切り上げる。あと数時間でも「あと1日」と出す。
 * アプリ側の remaining()（app/src/lib/account.ts）と同じ数え方。
 * 突き合わせは tools/test-paid-period.mjs が見ている。
 */
export function remainingSpan(endIso: string | null, now: Date = new Date()): Span {
  if (!endIso) return { months: 0, days: 0 };
  const end = new Date(endIso).getTime();
  if (Number.isNaN(end) || end <= now.getTime()) return { months: 0, days: 0 };

  let months = 0;
  let cursor = now.getTime();
  for (;;) {
    const next = addMonths(new Date(cursor), 1).getTime();
    if (next > end) break;
    cursor = next;
    months++;
    /* 念のための歯止め。暦の計算が進まなくなっても回り続けない。 */
    if (months > 600) break;
  }

  return { months, days: Math.ceil((end - cursor) / 86_400_000) };
}
