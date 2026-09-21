/**
 * お支払いいただいた期間の計算を確かめる。画面を開かない。
 *
 *   node --import ./tools/ts-resolve-hooks.mjs tools/test-paid-period.mjs
 *
 * **なぜ画面を伴わない検査を別に持つか**
 *   日付の計算は、画面で見ても合っているように見えてしまう。
 *   「あと30日」と出ていても、月末締めの方だけ数日長い、といった
 *   ずれは目視では出てこない。数字そのものを突き合わせる。
 *
 * **何を見るか**
 *   1. 刻みごとの月数が、アプリと管理画面で一致している
 *      （食い違うと、お支払いいただいた期間と画面の表示がずれる）
 *   2. 「入金を確認した」で入る期限が、お選びの刻みぶん先になる
 *   3. 月末締めの方が、繰り上がりで数日得をしない
 *   4. 期限前にお振込みいただいた方の残りが、切り捨てられない
 *   5. 期限が過ぎた方の残りが、足し込まれない（過去へ足さない）
 *   6. 期限を持たない方は、いつまで経っても切れない
 *   7. 無料期間の途中で払った方の残りが、切り捨てられない
 *   8. 残りが「◯か月 ◯日」に分かれ、アプリと管理画面で一致する
 */
import { readFileSync } from 'node:fs';

/* sync.ts が読み込み時に接続設定を見るため、先に入れておく。接続はしない。 */
for (const line of readFileSync('app/.env.local', 'utf8').split(String.fromCharCode(10))) {
  const m = line.match(/^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const { PLANS } = await import('../app/src/lib/plans.ts');
const { daysLeft, endsAt, isExpired, remaining } = await import('../app/src/lib/account.ts');
const { PLAN_MONTHS, nextPaidUntil, remainingSpan } = await import('../admin/src/lib/plans.ts');

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}`);
    if (detail) console.error(`        ${detail}`);
  }
};

console.log(`お支払いいただいた期間の計算${String.fromCharCode(10)}`);

/* --- 1. 刻みの月数が、両側で一致している --------------------------------- */

/*
  ご指示の月数（2026-09-14）。**実装とは別に、ここへ書き写して持つ。**
  片方の実装をもう片方と比べるだけでは、両方同じように間違えていても通る。
*/
const WANT_MONTHS = { monthly: 1, quarterly: 3, half: 6, yearly: 12 };

for (const [id, months] of Object.entries(WANT_MONTHS)) {
  const app = PLANS.find((p) => p.id === id);
  check(
    `${id} は ${months} か月（アプリ）`,
    app?.months === months,
    `app=${app?.months}`,
  );
  check(
    `${id} は ${months} か月（管理画面）`,
    PLAN_MONTHS[id] === months,
    `admin=${PLAN_MONTHS[id]}`,
  );
}

check(
  '刻みの数が、両側で同じ',
  PLANS.length === Object.keys(PLAN_MONTHS).length &&
    PLANS.length === Object.keys(WANT_MONTHS).length,
  `app=${PLANS.length} admin=${Object.keys(PLAN_MONTHS).length}`,
);

/* --- 2. お選びの刻みぶん先になる ----------------------------------------- */

const at = (s) => new Date(s);

/** どちらの期限も持たない方。これが初めてのお支払いにあたる。 */
const NONE = { paidUntil: null, trialEndsAt: null };

for (const [id, months] of Object.entries(WANT_MONTHS)) {
  const now = at('2026-09-15T03:00:00.000Z');
  const want = new Date(now);
  want.setMonth(want.getMonth() + months);
  check(
    `${id} を選んだ方の期限は ${months} か月先`,
    nextPaidUntil(NONE, id, now) === want.toISOString(),
    `${nextPaidUntil(NONE, id, now)} / 期待 ${want.toISOString()}`,
  );
}

check(
  '刻みを選んでいない方は 1か月として扱う',
  nextPaidUntil(NONE, null, at('2026-09-15T03:00:00.000Z')) === '2026-10-15T03:00:00.000Z',
  nextPaidUntil(NONE, null, at('2026-09-15T03:00:00.000Z')),
);

/* --- 3. 月末締めの繰り上がり --------------------------------------------- */

/*
  setMonth は 1月31日 に1か月足すと 3月3日 を返す（2月に31日が無い）。
  **月末締めの方だけ、毎回数日ずつ長くなる。**
*/
check(
  '1月31日 + 1か月 は 2月28日（3月へ繰り上がらない）',
  nextPaidUntil(NONE, 'monthly', at('2026-01-31T00:00:00.000Z')).startsWith('2026-02-28'),
  nextPaidUntil(NONE, 'monthly', at('2026-01-31T00:00:00.000Z')),
);

check(
  '閏年の 1月31日 + 1か月 は 2月29日',
  nextPaidUntil(NONE, 'monthly', at('2028-01-31T00:00:00.000Z')).startsWith('2028-02-29'),
  nextPaidUntil(NONE, 'monthly', at('2028-01-31T00:00:00.000Z')),
);

check(
  '3月31日 + 3か月 は 6月30日',
  nextPaidUntil(NONE, 'quarterly', at('2026-03-31T00:00:00.000Z')).startsWith('2026-06-30'),
  nextPaidUntil(NONE, 'quarterly', at('2026-03-31T00:00:00.000Z')),
);

check(
  '末日でなければ、日付はそのまま',
  nextPaidUntil(NONE, 'yearly', at('2026-09-15T03:00:00.000Z')).startsWith('2027-09-15'),
  nextPaidUntil(NONE, 'yearly', at('2026-09-15T03:00:00.000Z')),
);

/* --- 4〜5. 残りの扱い ---------------------------------------------------- */

check(
  '期限前にお振込みいただいた方の残りは、その先へ足す',
  nextPaidUntil({ paidUntil: '2026-10-20T00:00:00.000Z', trialEndsAt: null }, 'monthly', at('2026-09-15T00:00:00.000Z')).startsWith(
    '2026-11-20',
  ),
  nextPaidUntil({ paidUntil: '2026-10-20T00:00:00.000Z', trialEndsAt: null }, 'monthly', at('2026-09-15T00:00:00.000Z')),
);

check(
  '期限が過ぎた方は、いまから数える（過去へ足さない）',
  nextPaidUntil({ paidUntil: '2026-08-01T00:00:00.000Z', trialEndsAt: null }, 'monthly', at('2026-09-15T00:00:00.000Z')).startsWith(
    '2026-10-15',
  ),
  nextPaidUntil({ paidUntil: '2026-08-01T00:00:00.000Z', trialEndsAt: null }, 'monthly', at('2026-09-15T00:00:00.000Z')),
);

check(
  '壊れた日付が入っていても、いまから数える',
  nextPaidUntil({ paidUntil: 'これは日付ではない', trialEndsAt: null }, 'monthly', at('2026-09-15T00:00:00.000Z')).startsWith(
    '2026-10-15',
  ),
  nextPaidUntil({ paidUntil: 'これは日付ではない', trialEndsAt: null }, 'monthly', at('2026-09-15T00:00:00.000Z')),
);

/* --- 6. アプリ側の判断 ---------------------------------------------------- */

const now = at('2026-09-15T00:00:00.000Z');
const acct = (o) => ({
  userId: 'x',
  email: null,
  displayName: null,
  status: 'trial',
  trialEndsAt: '2026-10-01T00:00:00.000Z',
  paidUntil: null,
  avatarPath: null,
  avatarUrl: null,
  plan: null,
  planChosenAt: null,
  memberNo: 1,
  ...o,
});

check(
  '無料期間の方は、無料期間の終わりを見る',
  endsAt(acct({})) === '2026-10-01T00:00:00.000Z',
  String(endsAt(acct({}))),
);

check(
  'お支払い済みの方は、お支払いいただいた期間の終わりを見る',
  endsAt(acct({ status: 'active', paidUntil: '2026-12-01T00:00:00.000Z' })) ===
    '2026-12-01T00:00:00.000Z',
  String(endsAt(acct({ status: 'active', paidUntil: '2026-12-01T00:00:00.000Z' }))),
);

check(
  '期限を持たないお支払い済みの方は、無料期間の終わりを見ない',
  endsAt(acct({ status: 'active', paidUntil: null })) === null,
  String(endsAt(acct({ status: 'active', paidUntil: null }))),
);

check(
  '期限を持たない方は、いつまで経っても切れない',
  isExpired(acct({ status: 'active', paidUntil: null }), at('2099-01-01T00:00:00.000Z')) === false,
);

check(
  'お支払いいただいた期間が過ぎたら、切れる',
  isExpired(acct({ status: 'active', paidUntil: '2026-09-14T00:00:00.000Z' }), now) === true,
);

check(
  'お支払いいただいた期間が残っていれば、切れない',
  isExpired(acct({ status: 'active', paidUntil: '2026-09-16T00:00:00.000Z' }), now) === false,
);

check(
  '無料期間が過ぎたら、切れる',
  isExpired(acct({ trialEndsAt: '2026-09-14T00:00:00.000Z' }), now) === true,
);

check(
  '残り日数は切り上げる（あと数時間でも「あと1日」）',
  daysLeft(acct({ status: 'active', paidUntil: '2026-09-15T05:00:00.000Z' }), now) === 1,
  String(daysLeft(acct({ status: 'active', paidUntil: '2026-09-15T05:00:00.000Z' }), now)),
);

check(
  '過ぎていれば残り 0 日',
  daysLeft(acct({ status: 'active', paidUntil: '2026-09-01T00:00:00.000Z' }), now) === 0,
);

check(
  '期限を持たない方の残り日数は 0（画面は日数を出さない）',
  daysLeft(acct({ status: 'active', paidUntil: null }), now) === 0,
);

/* --- 7. 無料期間の残りを足す（ご指摘 2026-09-15）------------------------- */

/*
  無料期間の途中でお振込みいただいた方の残りを、切り捨てていた。
  1か月の無料期間のうち3日目に払った方は、**残っていた27日ぶんを
  失っていた。** 早く払った方ほど損をする。
*/
check(
  '無料期間の途中で払った方は、その残りへ足す',
  nextPaidUntil(
    { paidUntil: null, trialEndsAt: '2026-10-12T00:00:00.000Z' },
    'monthly',
    at('2026-09-15T00:00:00.000Z'),
  ).startsWith('2026-11-12'),
  nextPaidUntil(
    { paidUntil: null, trialEndsAt: '2026-10-12T00:00:00.000Z' },
    'monthly',
    at('2026-09-15T00:00:00.000Z'),
  ),
);

check(
  '無料期間の残り27日ぶんが、そのまま残る',
  (() => {
    const now = at('2026-09-15T00:00:00.000Z');
    const trialEnd = at('2026-10-12T00:00:00.000Z');
    const got = at(nextPaidUntil({ paidUntil: null, trialEndsAt: trialEnd.toISOString() }, 'yearly', now));
    /* いまから1年ぶんだけなら 2027-09-15。残りが足されていれば 2027-10-12。 */
    return got.toISOString().startsWith('2027-10-12');
  })(),
  nextPaidUntil(
    { paidUntil: null, trialEndsAt: '2026-10-12T00:00:00.000Z' },
    'yearly',
    at('2026-09-15T00:00:00.000Z'),
  ),
);

check(
  '無料期間が終わっている方は、いまから数える',
  nextPaidUntil(
    { paidUntil: null, trialEndsAt: '2026-09-01T00:00:00.000Z' },
    'monthly',
    at('2026-09-15T00:00:00.000Z'),
  ).startsWith('2026-10-15'),
  nextPaidUntil(
    { paidUntil: null, trialEndsAt: '2026-09-01T00:00:00.000Z' },
    'monthly',
    at('2026-09-15T00:00:00.000Z'),
  ),
);

check(
  '両方ある方は、先のほうから数える',
  nextPaidUntil(
    { paidUntil: '2026-12-01T00:00:00.000Z', trialEndsAt: '2026-10-12T00:00:00.000Z' },
    'monthly',
    at('2026-09-15T00:00:00.000Z'),
  ).startsWith('2027-01-01'),
  nextPaidUntil(
    { paidUntil: '2026-12-01T00:00:00.000Z', trialEndsAt: '2026-10-12T00:00:00.000Z' },
    'monthly',
    at('2026-09-15T00:00:00.000Z'),
  ),
);

/* --- 8. 残りを月と日に分ける（ご指摘 2026-09-15）------------------------- */

/*
  **月だけで丸めない。** 「あと11か月」では、ちょうど11か月なのか
  11か月と28日なのかが分からない。
  アプリと管理画面、**両方の実装を同じ期待値と突き合わせる。**
*/
const SPANS = [
  ['2027-09-15T00:00:00.000Z', 12, 0, '1年ちょうどは 12か月 0日'],
  ['2027-10-13T00:00:00.000Z', 12, 28, '1年と28日は 12か月 28日'],
  ['2026-10-13T00:00:00.000Z', 0, 28, '1か月に満たなければ 0か月 28日'],
  ['2026-10-15T00:00:00.000Z', 1, 0, '1か月ちょうどは 1か月 0日'],
  ['2026-12-20T00:00:00.000Z', 3, 5, '3か月と5日'],
  ['2026-09-15T05:00:00.000Z', 0, 1, '数時間でも 0か月 1日（切り上げ）'],
  ['2026-09-01T00:00:00.000Z', 0, 0, '過ぎていれば 0か月 0日'],
];

for (const [end, months, days, label] of SPANS) {
  const app = remaining(acct({ status: 'active', paidUntil: end }), now);
  check(
    `${label}（アプリ）`,
    app.months === months && app.days === days,
    `${app.months}か月 ${app.days}日 / 期待 ${months}か月 ${days}日`,
  );
  const adm = remainingSpan(end, now);
  check(
    `${label}（管理画面）`,
    adm.months === months && adm.days === days,
    `${adm.months}か月 ${adm.days}日 / 期待 ${months}か月 ${days}日`,
  );
}

check(
  '期限を持たない方は 0か月 0日',
  remaining(acct({ status: 'active', paidUntil: null }), now).months === 0 &&
    remaining(acct({ status: 'active', paidUntil: null }), now).days === 0,
);

/*
  月末締めの方。1月31日から見た残りが、繰り上がりでずれないこと。
  3月3日まで残っていると「1か月 3日」ではなく「1か月 3日」…ではなく、
  2月28日で1か月と数え、そこから3日。
*/
check(
  '月末締めでも、月の数え方がずれない',
  (() => {
    const r = remainingSpan('2026-03-03T00:00:00.000Z', at('2026-01-31T00:00:00.000Z'));
    return r.months === 1 && r.days === 3;
  })(),
  JSON.stringify(remainingSpan('2026-03-03T00:00:00.000Z', at('2026-01-31T00:00:00.000Z'))),
);

console.log(
  `${String.fromCharCode(10)}  ${pass} 件が通り、${failures.length} 件が落ちました`,
);
if (failures.length > 0) {
  for (const f of failures) console.error(`    - ${f}`);
  process.exitCode = 1;
}
