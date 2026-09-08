/**
 * 料金の案内。
 *
 * **金額をここ1か所に置く**
 *   データベースにも表を作れるが、金額が変わるときは画面の但し書きも
 *   一緒に変わる（「2か月ぶんお得」など）。別々に持つと片方だけが古くなる。
 *   2つしかないので、ここに置いて画面から引く。
 *
 * **まだ支払いは受け取れない**
 *   決済の仕組みは未定で、支払者がドライバー個人か事業者かも未回答
 *   （docs/12-phase2-design.md 2-1）。いまできるのは「どちらをご希望か」を
 *   伺って控えることまで。**使えるかどうかは status が決める。**
 *   選んだだけでは有料の扱いにならない。
 */

export type PlanId = 'monthly' | 'yearly';

export interface Plan {
  id: PlanId;
  /** 税込の金額（円） */
  yen: number;
  /** 何か月ぶんか */
  months: number;
}

export const PLANS: readonly Plan[] = [
  { id: 'monthly', yen: 800, months: 1 },
  { id: 'yearly', yen: 8000, months: 12 },
];

export const planOf = (id: PlanId): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0];

/**
 * 3桁ごとに区切る。
 *
 * toLocaleString に頼らない。端末の言語設定によっては区切りが変わり、
 * 8,000 が 8.000 になる。金額の見間違いは起こしたくない。
 */
export function yen(n: number): string {
  const s = String(Math.round(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 年額にすると1か月あたりいくらになるか。
 *
 * 切り捨てる。実際より安く見せない。
 */
export function perMonth(plan: Plan): number {
  return Math.floor(plan.yen / plan.months);
}

/**
 * 年額が、月額を12回払うのに比べて何か月ぶん安いか。
 *
 * 800 × 12 = 9,600 に対して 8,000 なので 1,600 円、月額の2か月ぶん。
 * 「20%off」より「2か月ぶん」のほうが、月額と並べたときに伝わる。
 */
export function monthsSaved(): number {
  const m = planOf('monthly');
  const y = planOf('yearly');
  return Math.floor((m.yen * y.months - y.yen) / m.yen);
}
