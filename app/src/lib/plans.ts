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

/*
  金額はご指示のとおり（2026-09-09）。

  年額は月額の10か月ぶん。12回払うより2か月ぶん安い、という刻みは
  前の金額（800 / 8,000）から変えていない。
*/
export const PLANS: readonly Plan[] = [
  { id: 'monthly', yen: 4000, months: 1 },
  { id: 'yearly', yen: 40000, months: 12 },
];

export const planOf = (id: PlanId): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0];

/**
 * 3桁ごとに区切る。
 *
 * toLocaleString に頼らない。端末の言語設定によっては区切りが変わり、
 * 40,000 が 40.000 になる。金額の見間違いは起こしたくない。
 */
export function yen(n: number): string {
  const s = String(Math.round(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/*
  「1か月あたり◯円」「◯か月ぶんお得」を添えていたが、ご指示により外した。
  金額そのものだけを出す。
*/
