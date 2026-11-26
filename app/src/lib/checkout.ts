/**
 * 申込みの最後の画面（特定商取引法 第12条の6）に出す中身を決める。
 *
 * 画面を伴わない。日付の計算と、どの決まりが当てはまるかだけを持つ。
 * 文言は辞書（i18n の checkout）、並べ方は画面（app/checkout.tsx）。
 *
 * **最後の画面に出すもの**（法律が求めるもの）
 *   分量          … 料金プランと、ご利用の期間（自動更新なら、そのこと）
 *   価格          … 税込の金額。自動更新なら、何か月ごとにいくらか
 *   支払の時期・方法 … いつ、何で払うか
 *   提供の時期     … いつから使えるか
 *   撤回・解除     … 自動更新の止め方、返金の決まり
 *   （申込みの期間は、設けていないので出さない）
 *
 * **日付は、データベースと同じ決め方で出す。**
 *   有料の期間の始まりは paid_period_start()（supabase/migrations/20261126000002）、
 *   期間の終わりは record_payment() と同じ「日本時間の暦で月を足す」。
 *   画面の日付と、実際に記録される日付が食い違うと、表示そのものが誤りになる。
 *   **片方を直したら、もう片方も直す。** 検査は tools/test-checkout.mjs。
 */
import type { Account } from './account';
import { offeredPlan, type Plan, type PlanId } from './plans';

/**
 * お支払いの方法。
 *
 *   card     … クレジットカード・デビットカード（Apple Pay・Google Pay を含む）。自動更新
 *   paypay   … PayPay。都度払い（Stripe の PayPay は自動更新に使えない）
 *   transfer … 銀行振込。都度払い。入金は人が確かめる
 */
export type PayMethod = 'card' | 'paypay' | 'transfer';

/** 画面に並べる順。自動更新できるカードを先に置く。 */
export const PAY_METHODS: readonly PayMethod[] = ['card', 'paypay', 'transfer'];

export function isPayMethod(v: unknown): v is PayMethod {
  return v === 'card' || v === 'paypay' || v === 'transfer';
}

/** 自動で更新するか。カードだけ（利用規約 第7条第4項）。 */
export const renews = (m: PayMethod): boolean => m === 'card';

/**
 * Stripe とつないだか（カード・PayPay）。
 *
 * **つなぐまでは false。** 受け口（サーバー）の段で、鍵が入ってから true にする。
 * false のあいだは、最後の画面まで見られるが、申し込む釦は押せない。
 */
export const STRIPE_CONNECTED = false;

/**
 * 銀行振込の申込みを受け付けるか。
 *
 * **まだ false。** 有料での提供を始めたあと、試験提供の期間中に控えた
 * 「ご希望」と、この画面を通った申込みを見分ける欄がまだ無い（見分けずに
 * 振込先を出すと、最後の画面を通らずに申し込めてしまう）。その欄を足す段で true にする。
 */
export const TRANSFER_CONNECTED = false;

/** その方法で、いま申し込めるか（つないであるか）。 */
export const connected = (m: PayMethod): boolean =>
  m === 'transfer' ? TRANSFER_CONNECTED : STRIPE_CONNECTED;

// --- 日付（日本時間） ---------------------------------------------------------

const JST_MS = 9 * 3_600_000;

/**
 * 日本時間の暦で、月を足す。
 *
 * データベースの record_payment() と同じ（`(時刻 at time zone 'Asia/Tokyo') + n months`）。
 * 足した先に同じ日が無ければ、その月の末日にする（1月31日 → 2月28日）。
 * 端末の時刻帯に頼らない。海外の設定の端末でも、日本の暦で数える。
 */
export function addMonthsJst(from: Date, months: number): Date {
  const w = new Date(from.getTime() + JST_MS);
  const y = w.getUTCFullYear();
  const m = w.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const t = Date.UTC(
    y,
    m,
    Math.min(w.getUTCDate(), lastDay),
    w.getUTCHours(),
    w.getUTCMinutes(),
    w.getUTCSeconds(),
    w.getUTCMilliseconds(),
  );
  return new Date(t - JST_MS);
}

/** 日本時間の年・月（1〜12）・日。 */
export function jstDate(d: Date): { y: number; m: number; d: number } {
  const w = new Date(d.getTime() + JST_MS);
  return { y: w.getUTCFullYear(), m: w.getUTCMonth() + 1, d: w.getUTCDate() };
}

const time = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * 有料の期間の始まり。データベースの paid_period_start() と同じ決め方。
 *
 *   次のうち、いちばん遅いもの
 *     いま
 *     お支払い済みの期間の終わり（paid_until）
 *     無料期間の終わり（trial_ends_at）
 *     上位の方の無料の月の終わり（まだ終わっていないもの）
 *
 * 上位の無料の月は、アプリには my_free_access() の「いま無料の上位」としてだけ届く。
 * データベースは、まだ終わっていない無料の月をすべて見るが、無料の月は締めた月の
 * 翌月にしか無く、締めは月が替わってから行うので、まだ始まっていない無料の月は無い。
 */
export function paidStart(account: Account, now: Date): Date {
  const candidates = [
    now.getTime(),
    time(account.paidUntil),
    time(account.trialEndsAt),
    account.freeReason === 'top' ? time(account.freeUntil) : null,
  ].filter((t): t is number => t !== null);
  return new Date(Math.max(...candidates));
}

// --- 申し込めるか -------------------------------------------------------------

/**
 * 申し込めない理由。申し込めるなら null。
 *
 *   trialOpen … 試験提供の期間中（請求しない。利用規約 第4条第2項）。画面は見本として出す
 *   blocked   … ご利用を止めている方
 *   free      … 調査員・所有者（期限なく無料）
 *   unlimited … 期限を持たない「ご利用中」の方（この欄を設ける前からの方）。
 *               払うと期限が付いてしまう
 */
export type Hold = 'trialOpen' | 'blocked' | 'free' | 'unlimited';

export function holdOf(account: Account, paidOpen: boolean): Hold | null {
  if (account.status === 'blocked') return 'blocked';
  if (account.freeReason === 'surveyor' || account.freeReason === 'owner') return 'free';
  if (account.status === 'active' && account.paidUntil === null) return 'unlimited';
  if (!paidOpen) return 'trialOpen';
  return null;
}

// --- 最後の画面の中身 ---------------------------------------------------------

export interface Checkout {
  plan: Plan;
  method: PayMethod;
  /** 自動で更新するか（カードだけ） */
  renews: boolean;
  /** 有料の期間の始まり */
  start: Date;
  /**
   * いまの期間が残っていて、有料の期間があとから始まるか。
   * 残っているのが無料期間（上位の無料の月を含む）なら 'free'、
   * お支払い済みの期間なら 'paid'。残っていなければ null。
   */
  waitFor: 'free' | 'paid' | null;
  /** 最初の期間の終わり（始まり + 月数）。カードは、そのあとも更新で続く */
  firstEnd: Date;
  /**
   * 最初のお支払いの時。
   *   カード   … 有料の期間の始まり（残りがあればその終わり、無ければ申し込んだ時）
   *   PayPay   … 申し込んだ時（この後の画面ですぐ）
   *   銀行振込 … 決まらない（お申し込みのあと、お振込みいただく）ので null
   */
  chargeAt: Date | null;
  /** 返金の決まり。1か月は返金しない。12か月は第11条の計算 */
  refund: 'none' | 'yearly';
}

/**
 * 最後の画面の中身を決める。料金プランが取り扱っていないものなら null。
 *
 * 申し込めるかどうか（holdOf・connected）は別に見る。見本として出すときも、
 * 中身は同じように決める。
 */
export function planCheckout(
  account: Account,
  planId: PlanId,
  method: PayMethod,
  now: Date = new Date(),
): Checkout | null {
  const plan = offeredPlan(planId);
  if (!plan) return null;

  const start = paidStart(account, now);
  const later = start.getTime() > now.getTime();
  let waitFor: Checkout['waitFor'] = null;
  if (later) {
    const paidEnd = time(account.paidUntil);
    waitFor = account.status === 'active' && paidEnd === start.getTime() ? 'paid' : 'free';
  }

  return {
    plan,
    method,
    renews: renews(method),
    start,
    waitFor,
    firstEnd: addMonthsJst(start, plan.months),
    chargeAt: method === 'transfer' ? null : method === 'paypay' ? now : start,
    refund: plan.months >= 12 ? 'yearly' : 'none',
  };
}
