/**
 * 申込みの最後の画面に出す日付と決まりを確かめる。画面を開かない。
 *
 *   node --import ./tools/ts-resolve-hooks.mjs tools/test-checkout.mjs
 *
 * **なぜ画面を伴わない検査を別に持つか**
 *   最後の画面の日付は、法律で表示が求められるもの（支払の時期・提供の時期）。
 *   画面で見ても、月末の方だけ1日ずれる、といった誤りは目に入らない。
 *   数字そのものを突き合わせる。
 *
 * **何を見るか**
 *   1. 月の足し方が、日本時間の暦で、月末を越えない
 *   2. 同じ足し方を、データベース（record_payment と同じ式）にもさせて一致する
 *      （手元の PostgreSQL が動いていれば。C:\pgtest。無ければ飛ばす）
 *   3. 有料の期間の始まりが、データベースの paid_period_start() と同じ決め方
 *      （無料期間・お支払い済みの期間・上位の無料の月のあとから）
 *   4. 支払方法ごとの、最初のお支払いの時・自動更新・返金
 *   5. 申し込めない方（止めた方・調査員・期限なし・試験提供の期間中）
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const { addMonthsJst, holdOf, jstDate, paidStart, planCheckout, PAY_METHODS, renews } = await import(
  '../app/src/lib/checkout.ts'
);

let pass = 0;
const failures = [];
function check(label, actual, expected) {
  const a = actual instanceof Date ? actual.toISOString() : actual;
  const e = expected instanceof Date ? expected.toISOString() : expected;
  if (JSON.stringify(a) === JSON.stringify(e)) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}\n        期待 ${JSON.stringify(e)} / 実際 ${JSON.stringify(a)}`);
  }
}

/** 日本時間で書いた時刻。 */
const jst = (s) => new Date(`${s}+09:00`);

// =============================================================================
// 1. 月の足し方（日本時間の暦）
// =============================================================================
console.log('1. 月の足し方');
check('1月31日 朝8時 + 1か月 = 2月28日 朝8時', addMonthsJst(jst('2027-01-31T08:00:00'), 1), jst('2027-02-28T08:00:00'));
check(
  '1月31日 0時30分 + 1か月 = 2月28日（UTC ではまだ1月30日でも、日本の暦で数える）',
  addMonthsJst(jst('2027-01-31T00:30:00'), 1),
  jst('2027-02-28T00:30:00'),
);
check('12月31日 23時 + 1か月 = 1月31日（年をまたぐ）', addMonthsJst(jst('2026-12-31T23:00:00'), 1), jst('2027-01-31T23:00:00'));
check('3月15日 + 12か月 = 翌年3月15日', addMonthsJst(jst('2027-03-15T10:00:00'), 12), jst('2028-03-15T10:00:00'));
check('うるう日 + 12か月 = 翌年2月28日', addMonthsJst(jst('2028-02-29T09:00:00'), 12), jst('2029-02-28T09:00:00'));
check('3月31日 + 1か月 = 4月30日', addMonthsJst(jst('2027-03-31T12:00:00'), 1), jst('2027-04-30T12:00:00'));
check('日本時間の日付', jstDate(jst('2027-02-01T00:10:00')), { y: 2027, m: 2, d: 1 });

// =============================================================================
// 2. データベースと同じ足し方か
// =============================================================================
console.log('2. データベースとの突き合わせ');
const psql = 'C:\\pgtest\\pgsql\\bin\\psql.exe';
let dbChecked = false;
if (existsSync(psql)) {
  /* 2026〜2029年の、月末・月初・日付の変わり目の前後を中心に並べる */
  const samples = [];
  for (let y = 2026; y <= 2029; y++) {
    for (let mo = 1; mo <= 12; mo++) {
      for (const d of [1, 28, 29, 30, 31]) {
        for (const hm of ['00:05', '08:59', '09:00', '23:55']) {
          const s = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${hm}:00`;
          const t = jst(s);
          /* 無い日（2月30日など）は飛ばす */
          if (jstDate(t).d === d) samples.push(t);
        }
      }
    }
  }
  const values = samples.map((t, i) => `(${i}, '${t.toISOString()}'::timestamptz)`).join(',');
  const sql =
    `select i, to_char(((t at time zone 'Asia/Tokyo') + make_interval(months => 1)) at time zone 'Asia/Tokyo' at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),` +
    ` to_char(((t at time zone 'Asia/Tokyo') + make_interval(months => 12)) at time zone 'Asia/Tokyo' at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')` +
    ` from (values ${values}) v(i, t) order by i`;
  try {
    /* 件数が多く、コマンドの行には収まらない。標準入力から渡す */
    const out = execFileSync(psql, ['-h', '127.0.0.1', '-p', '55432', '-U', 'postgres', '-d', 'postgres', '-At', '-F', '|', '-f', '-'], {
      encoding: 'utf8',
      input: `${sql};\n`,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const rows = out.trim().split(/\r?\n/);
    let bad = 0;
    for (const row of rows) {
      const [i, one, twelve] = row.split('|');
      const t = samples[Number(i)];
      const a1 = addMonthsJst(t, 1).toISOString().slice(0, 19);
      const a12 = addMonthsJst(t, 12).toISOString().slice(0, 19);
      if (a1 !== one || a12 !== twelve) {
        bad++;
        if (bad <= 5) console.error(`        ずれ ${t.toISOString()}: アプリ ${a1} / ${a12}、DB ${one} / ${twelve}`);
      }
    }
    check(`${rows.length} 通りの時刻で、1か月・12か月とも DB と一致`, bad, 0);
    check('突き合わせた件数', rows.length, samples.length);
    dbChecked = true;
  } catch (e) {
    console.log(`  SKIP  手元の PostgreSQL につながらない（${String(e.message).split('\n')[0]}）`);
  }
} else {
  console.log('  SKIP  手元の PostgreSQL が無い');
}

// =============================================================================
// 3. 有料の期間の始まり
// =============================================================================
console.log('3. 有料の期間の始まり');
const now = jst('2027-02-05T12:00:00');
const day = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();

function member(over = {}) {
  return {
    userId: 'u',
    email: null,
    displayName: null,
    status: 'trial',
    trialEndsAt: iso(now.getTime() + 10 * day),
    paidUntil: null,
    avatarPath: null,
    avatarUrl: null,
    plan: null,
    planChosenAt: null,
    memberNo: 1,
    offline: false,
    freeReason: null,
    freeUntil: null,
    ...over,
  };
}

check('無料期間が残っている：無料期間の終わりから', paidStart(member(), now), new Date(now.getTime() + 10 * day));
check('無料期間を過ぎた：いまから', paidStart(member({ trialEndsAt: iso(now.getTime() - 5 * day) }), now), now);
check(
  'お支払い済みの期間が残っている：その終わりから',
  paidStart(member({ status: 'active', trialEndsAt: iso(now.getTime() - 60 * day), paidUntil: iso(now.getTime() + 20 * day) }), now),
  new Date(now.getTime() + 20 * day),
);
check(
  '上位の無料の月にいる（無料期間は過ぎた）：無料の月の終わりから',
  paidStart(
    member({ trialEndsAt: iso(now.getTime() - 5 * day), freeReason: 'top', freeUntil: iso(now.getTime() + 23 * day) }),
    now,
  ),
  new Date(now.getTime() + 23 * day),
);
check(
  '上位の無料の月より無料期間が長い：無料期間の終わりから',
  paidStart(member({ trialEndsAt: iso(now.getTime() + 30 * day), freeReason: 'top', freeUntil: iso(now.getTime() + 23 * day) }), now),
  new Date(now.getTime() + 30 * day),
);
check(
  '上位でない方の freeUntil は見ない',
  paidStart(member({ trialEndsAt: iso(now.getTime() - 5 * day), freeReason: 'trial', freeUntil: iso(now.getTime() + 23 * day) }), now),
  now,
);

// =============================================================================
// 4. 支払方法ごとの中身
// =============================================================================
console.log('4. 支払方法ごと');
const trialEnd = new Date(now.getTime() + 10 * day);

const cardTrial = planCheckout(member(), 'monthly', 'card', now);
check('カード・無料期間中：最初のお支払いは無料期間の終わる日', cardTrial.chargeAt, trialEnd);
check('カード・無料期間中：有料の期間は無料期間の終わりから', cardTrial.start, trialEnd);
check('カード・無料期間中：残っているのは無料期間', cardTrial.waitFor, 'free');
check('カード：自動更新する', cardTrial.renews, true);
check('カード・1か月：最初の期間は1か月', cardTrial.firstEnd, addMonthsJst(trialEnd, 1));
check('1か月：返金しない', cardTrial.refund, 'none');

const cardLate = planCheckout(member({ trialEndsAt: iso(now.getTime() - 5 * day) }), 'yearly', 'card', now);
check('カード・無料期間のあと：申し込んだ時にお支払い', cardLate.chargeAt, now);
check('カード・無料期間のあと：残りは無い', cardLate.waitFor, null);
check('12か月：最初の期間は12か月', cardLate.firstEnd, addMonthsJst(now, 12));
check('12か月：第11条の計算で返金', cardLate.refund, 'yearly');

const paypayTrial = planCheckout(member(), 'yearly', 'paypay', now);
check('PayPay：お支払いは申し込んだ時（この後の画面ですぐ）', paypayTrial.chargeAt, now);
check('PayPay・無料期間中：有料の期間は無料期間の終わりから', paypayTrial.start, trialEnd);
check('PayPay：自動更新しない', paypayTrial.renews, false);

const transfer = planCheckout(member(), 'monthly', 'transfer', now);
check('銀行振込：お支払いの時は決まらない（お申し込みのあとお振込み）', transfer.chargeAt, null);
check('銀行振込：自動更新しない', transfer.renews, false);

const paidCard = planCheckout(
  member({ status: 'active', trialEndsAt: iso(now.getTime() - 60 * day), paidUntil: iso(now.getTime() + 20 * day) }),
  'monthly',
  'card',
  now,
);
check('お支払い済みの方がカードに：残っているのはお支払い済みの期間', paidCard.waitFor, 'paid');
check('お支払い済みの方がカードに：最初のお支払いはその終わる日', paidCard.chargeAt, new Date(now.getTime() + 20 * day));

check('取り扱いを終えた刻み（6か月）は出さない', planCheckout(member(), 'half', 'card', now), null);
check('自動更新はカードだけ', PAY_METHODS.filter(renews), ['card']);

// =============================================================================
// 5. 申し込めない方
// =============================================================================
console.log('5. 申し込めない方');
check('止めた方', holdOf(member({ status: 'blocked' }), true), 'blocked');
check('調査員', holdOf(member({ freeReason: 'surveyor' }), true), 'free');
check('所有者', holdOf(member({ freeReason: 'owner' }), true), 'free');
check('期限なしのご利用中', holdOf(member({ status: 'active', paidUntil: null }), true), 'unlimited');
check('試験提供の期間中', holdOf(member(), false), 'trialOpen');
check(
  '試験提供の期間中は、上位の方も申し込めない（無料の理由が「上位」でも）',
  holdOf(member({ freeReason: 'top', freeUntil: iso(now.getTime() + 23 * day) }), false),
  'trialOpen',
);
check('有料での提供を始めたあとの、ふつうの会員', holdOf(member(), true), null);

console.log('');
if (!dbChecked) console.log('（データベースとの突き合わせは飛ばした）');
if (failures.length) {
  console.error(`${failures.length} 件が不合格（合格 ${pass} 件）`);
  process.exit(1);
}
console.log(`全 ${pass} 件に合格しました。`);
