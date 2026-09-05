/**
 * いただいた一覧と、登録されている施設を番号ごとに突き合わせる。
 *
 *   node tools/check-sheet-count.mjs [表のパス]
 *
 * **なぜ要るか**
 *   「表には194件あるのに193件しか出ない」という食い違いは、
 *   取り込みの失敗と、表そのものの欠番とで意味がまったく違う。
 *   前者は直すべき不具合、後者は元の一覧の姿。
 *   数だけを見比べても区別がつかないため、番号ごとに突き合わせる。
 *
 * **表は2列組み**
 *   1枚のシートに、左（A〜E）と右（G〜K）の2組が並んでいる。
 *   左だけを読むと96件しか見えず、「98件が消えた」と誤って読む。
 *
 * **番号の無い行も数える**
 *   番号が抜けた施設行があれば、取り込みが取りこぼしている恐れがある。
 *   欠番との区別がつくよう、別に数えて出す。
 */
import { readFileSync } from 'node:fs';

import { readSheet } from './lib/xlsx.mjs';

const FILE = process.argv[2] ?? 'data/import/ホテル１_1.xlsx';

/** 左の組と右の組。[番号の列, 施設名の列] */
const BLOCKS = [
  ['A', 'B'],
  ['G', 'H'],
];

/** 施設の行は名前が「・」で始まる。地区の見出しと区別する。 */
const IS_FACILITY = /^・/;

const env = {};
for (const l of readFileSync('admin/.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// --- 表を読む -------------------------------------------------------------------
const rows = readSheet(FILE);
const listed = [];
const nameless = [];

for (const cells of rows) {
  for (const [numCol, nameCol] of BLOCKS) {
    const name = cells[nameCol]?.text ?? '';
    const n = Number(cells[numCol]?.text);
    if (Number.isInteger(n)) listed.push({ n, name });
    else if (IS_FACILITY.test(name)) nameless.push(name);
  }
}
listed.sort((a, b) => a.n - b.n);

const min = listed[0].n;
const max = listed[listed.length - 1].n;
const present = new Set(listed.map((x) => x.n));
const gaps = [];
for (let n = min; n <= max; n++) if (!present.has(n)) gaps.push(n);

const seen = new Set();
const dups = [];
for (const x of listed) {
  if (seen.has(x.n)) dups.push(x.n);
  seen.add(x.n);
}

console.log(`表: ${FILE}`);
console.log(`  番号つきの施設行   ${listed.length} 件`);
console.log(`  番号の範囲         ${min} 〜 ${max}`);
console.log(`  欠番               ${gaps.length ? gaps.join(', ') : 'なし'}`);
console.log(`  重複した番号       ${dups.length ? dups.join(', ') : 'なし'}`);
console.log(`  番号の無い施設行   ${nameless.length ? nameless.join(' / ') : 'なし'}`);

// --- 登録されているもの ---------------------------------------------------------
const res = await fetch(`${SB}/rest/v1/facilities?select=code,name&order=code&limit=1000`, {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
});
const facs = JSON.parse((await res.text()) || '[]');
const byNum = new Map(facs.map((f) => [Number(f.code.split('-')[1]), f]));

console.log(`\n登録: ${facs.length} 件`);

const missing = listed.filter((x) => !byNum.has(x.n));
const extra = [...byNum.keys()].filter((n) => !present.has(n)).sort((a, b) => a - b);

console.log(`  表にあって登録が無い   ${missing.length ? missing.map((x) => `${x.n} ${x.name}`).join(' / ') : 'なし'}`);
console.log(`  登録があって表に無い   ${extra.length ? extra.join(', ') : 'なし'}`);

/*
  名前まで突き合わせる。件数が合っていても、番号と名前がずれていれば
  「69番の座標が違う」という問い合わせが別の施設を指すことになる。
*/
const shifted = [];
for (const x of listed) {
  const f = byNum.get(x.n);
  if (!f) continue;
  const sheetName = x.name.replace(IS_FACILITY, '').trim();
  if (f.name !== sheetName) shifted.push(`${x.n}: 表「${sheetName}」／ 登録「${f.name}」`);
}
console.log(`  番号と名前の食い違い   ${shifted.length ? '\n    ' + shifted.join('\n    ') : 'なし'}`);

// --- 欠番の前後 -------------------------------------------------------------------
if (gaps.length) {
  console.log('\n欠番の前後（表のとおり）');
  for (const g of gaps) {
    for (const n of [g - 1, g, g + 1]) {
      const x = listed.find((y) => y.n === n);
      console.log(`  ${String(n).padStart(3)}: ${x ? x.name : '★ 表にこの番号の行が無い'}`);
    }
  }
}

const ok = missing.length === 0 && extra.length === 0 && shifted.length === 0 && nameless.length === 0;
console.log(
  ok
    ? `\n表の施設 ${listed.length} 件は、すべて登録されています（欠番 ${gaps.join(', ') || 'なし'} は表そのものの姿）。`
    : '\n食い違いがあります。上の一覧をご確認ください。',
);
process.exitCode = ok ? 0 : 1;
