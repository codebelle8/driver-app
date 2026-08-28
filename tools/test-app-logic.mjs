/**
 * アプリ側の判断ロジックを検証する。
 *
 *   node tools/test-app-logic.mjs
 *
 * 対象は画面を伴わない2つ。どちらも間違えても画面上は自然に見えてしまい、
 * 目視では気づけない種類の誤りを含む。
 *
 *   検索の正規化 … データベース側の normalize_search_text() と一致しないと
 *                  「シオドメ」で「汐留」が引けなくなる。
 *   注意事項の時間帯 … 22:00〜05:00 のように日をまたぐ指定があり、
 *                  深夜側の曜日判定を誤ると、無関係な注意が出る／出ない。
 */
import { readFileSync } from 'node:fs';

import { normalizeSearchText, toSearchPattern } from '../app/src/lib/search.ts';
import { describeSchedule, isActiveNow, splitByActive } from '../app/src/lib/cautions.ts';

// sync.ts は接続設定を読み込み時に見るため、先に入れてから動的に読み込む。
// import 文は巻き上げられて先に実行されるため、静的な import では間に合わない。
// ここで検証するのは表示の文言だけで、接続そのものは行わない。
for (const line of readFileSync('app/.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const { describeSyncedAt } = await import('../app/src/lib/sync.ts');

let pass = 0;
const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}\n        期待 ${JSON.stringify(expected)} / 実際 ${JSON.stringify(actual)}`);
  }
}

/** 曜日と時刻を指定して日時を作る。2026-08-24 は月曜。 */
function at(isoWeekday, hh, mm) {
  const monday = new Date(2026, 7, 24, hh, mm, 0);
  monday.setDate(monday.getDate() + (isoWeekday - 1));
  return monday;
}

function caution(over) {
  return {
    id: 'x',
    entry_point_id: 'e',
    body: '本文',
    severity: 'warn',
    time_from: null,
    time_to: null,
    weekdays: [],
    sort_order: 0,
    ...over,
  };
}

console.log('検索の正規化:\n');

check('カタカナをひらがなへ', normalizeSearchText('シオドメ'), 'しおどめ');
check('濁点・半濁点を保つ', normalizeSearchText('グランドホテル'), 'ぐらんどほてる');
check('小書き文字', normalizeSearchText('ャュョッ'), 'ゃゅょっ');
check('長音はそのまま', normalizeSearchText('ホテール'), 'ほてーる');
check('英字は小文字へ', normalizeSearchText('Hotel'), 'hotel');
check('漢字はそのまま', normalizeSearchText('汐留'), '汐留');
check('ひらがなはそのまま', normalizeSearchText('しおどめ'), 'しおどめ');

// データベース側の変換表に無い文字は、両者とも変換しないことが正しい。
// 片方だけ変換すると一致しなくなる。
check('変換表に無いカタカナは据え置き（ヴ）', normalizeSearchText('ヴィラ'), 'ヴぃら');

check('前後を % で挟む', toSearchPattern('汐留'), '%汐留%');
check('カタカナ入力もひらがなの語で照合', toSearchPattern('シオドメ'), '%しおどめ%');
check('空文字は検索しない', toSearchPattern('   '), null);
check('ilike の記号は落とす', toSearchPattern('100%_ホテル'), '%100 ほてる%');

console.log('\n注意事項の時間帯:\n');

check('時刻未設定は常時該当', isActiveNow(caution({}), at(3, 14, 0)), true);

const evening = caution({ time_from: '17:00:00', time_to: '20:00:00' });
check('時間帯の中（18時）', isActiveNow(evening, at(3, 18, 0)), true);
check('時間帯の外（14時）', isActiveNow(evening, at(3, 14, 0)), false);
check('開始ちょうど（17:00）は該当', isActiveNow(evening, at(3, 17, 0)), true);
check('終了ちょうど（20:00）は非該当', isActiveNow(evening, at(3, 20, 0)), false);

const weekdaysOnly = caution({
  time_from: '07:00:00',
  time_to: '09:00:00',
  weekdays: [1, 2, 3, 4, 5],
});
check('平日の朝は該当', isActiveNow(weekdaysOnly, at(2, 8, 0)), true);
check('土曜の朝は非該当', isActiveNow(weekdaysOnly, at(6, 8, 0)), false);
check('平日でも時間外は非該当', isActiveNow(weekdaysOnly, at(2, 10, 0)), false);

// 日をまたぐ指定。金曜の 22:00 に始まり土曜の 05:00 に終わる。
const overnight = caution({
  time_from: '22:00:00',
  time_to: '05:00:00',
  weekdays: [5],
});
check('金曜 23時は該当', isActiveNow(overnight, at(5, 23, 0)), true);
check('土曜 03時は該当（金曜に始まった時間帯）', isActiveNow(overnight, at(6, 3, 0)), true);
check('金曜 03時は非該当（木曜に始まった扱い）', isActiveNow(overnight, at(5, 3, 0)), false);
check('土曜 23時は非該当', isActiveNow(overnight, at(6, 23, 0)), false);
check('金曜 12時は非該当', isActiveNow(overnight, at(5, 12, 0)), false);

const split = splitByActive([evening, weekdaysOnly], at(3, 18, 0));
check('該当するものだけが前に出る', split.active.length, 1);
check('該当しないものは後ろへ', split.inactive.length, 1);

console.log('\n適用条件の表示:\n');

check('平日とまとめる', describeSchedule(weekdaysOnly), '平日 07:00-09:00'.replace('-', '–'));
check('時刻のみ', describeSchedule(evening), '17:00–20:00');
check('条件なしは表示しない', describeSchedule(caution({})), null);
check(
  '土日とまとめる',
  describeSchedule(caution({ weekdays: [6, 7] })),
  '土日',
);

console.log('');
console.log('取得時期の表示:');
console.log('');

const now = Date.now();
const ago = (ms) => new Date(now - ms);
const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

check('未取得', describeSyncedAt(null), '未取得');
check('1分未満', describeSyncedAt(ago(30 * 1000)), 'たった今');
check('数分前', describeSyncedAt(ago(5 * MIN)), '5分前');
check('1時間以上', describeSyncedAt(ago(3 * HOUR)), '3時間前');
check('1日以上', describeSyncedAt(ago(2 * DAY)), '2日前');
// 「17日前」まで来ると、いつの情報か直感的に分からなくなる
check(
  '1週間を超えたら日付で示す',
  /月\d+日$/.test(describeSyncedAt(ago(20 * DAY))),
  true,
);

console.log('');
if (failures.length) {
  console.error(`合格 ${pass} 件 / 失敗 ${failures.length} 件`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exitCode = 1;
} else {
  console.log(`合格 ${pass} 件 / 失敗 0 件`);
}
