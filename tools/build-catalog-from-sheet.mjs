/**
 * クライアント様の一覧（.xlsx）を、取り込める形へ起こす。
 *
 * **やること**
 *   施設名・車寄せの有無・座標・注記・エリアを読み、
 *   よみがなは Excel のふりがなから合成する。
 *
 * **やらないこと**
 *   ふりがなの無い漢字を推測で読まない。読みを誤ると検索が届かず、
 *   しかも誤りに気づけない。埋まらないものは一覧で示し、
 *   ご確認いただく。
 *
 *   使い方:
 *     node tools/build-catalog-from-sheet.mjs <xlsx>            様子を見る
 *     node tools/build-catalog-from-sheet.mjs <xlsx> --json      機械向けに出す
 *     node tools/build-catalog-from-sheet.mjs <xlsx> --missing   よみ未確定の一覧
 */
import { existsSync, writeFileSync } from 'node:fs';

import { readSheet } from './lib/xlsx.mjs';

const file = process.argv[2];
const MODE = process.argv.includes('--json')
  ? 'json'
  : process.argv.includes('--missing')
    ? 'missing'
    : 'summary';

if (!file || !existsSync(file)) {
  console.error('  .xlsx を指定してください');
  process.exit(1);
}

const COORD = /^\d+°\d+'[\d.]+"[NS] \d+°\d+'[\d.]+"[EW]/;
const KANJI = /[一-鿿々]/;

/** 度分秒を10進へ。取り込みの照合に使う。 */
function toDecimal(dms) {
  const m = dms.match(/(\d+)°(\d+)'([\d.]+)"([NSEW])\s+(\d+)°(\d+)'([\d.]+)"([NSEW])/);
  if (!m) return null;
  const conv = (d, mm, s, hemi) => {
    const v = Number(d) + Number(mm) / 60 + Number(s) / 3600;
    return hemi === 'S' || hemi === 'W' ? -v : v;
  };
  return {
    lat: Number(conv(m[1], m[2], m[3], m[4]).toFixed(6)),
    lng: Number(conv(m[5], m[6], m[7], m[8]).toFixed(6)),
  };
}

/*
  左右2列。エリアの見出しが途中に挟まる形で、人が見る前提で作られている。
    A列 番号  B列 施設名  C列 車寄せ  D列 座標1  E列 座標2または注記
    G〜K列 同じ並びの右側
*/
const SIDES = [
  { name: 'B', dropoff: 'C', coord1: 'D', extra: 'E', no: 'A' },
  { name: 'H', dropoff: 'I', coord1: 'J', extra: 'K', no: 'G' },
];

const rows = readSheet(file);
const facilities = [];
const areaOf = { B: null, H: null };

for (const r of rows) {
  for (const s of SIDES) {
    const cell = r[s.name];
    if (!cell) continue;
    const name = cell.text;

    // 見出しの行。施設名はすべて「・」で始まる。
    if (!name.startsWith('・') && !COORD.test(name)) {
      areaOf[s.name] = name;
      continue;
    }
    if (!name.startsWith('・')) continue;

    const no = r[s.no]?.text;
    if (!/^\d+$/.test(no ?? '')) continue;

    const extra = r[s.extra]?.text ?? '';
    const isCoord = COORD.test(extra);

    // 2つ目の座標は別の進入路（クライアント様のご回答 2026-08-30）
    const coord2 = isCoord ? extra.match(COORD)[0] : '';

    facilities.push({
      no: Number(no),
      area: areaOf[s.name],
      name: name.replace(/^・/, '').trim(),
      kana: cell.kana.replace(/^・/, '').trim(),
      hasDropoff: (r[s.dropoff]?.text ?? '') === '有',
      coord1: r[s.coord1]?.text ?? '',
      coord2,
      // 座標の欄に添えられた但し書きも拾う（例: 「（ロータリーに入り直ぐ左）」）
      coord2Note: isCoord ? extra.replace(COORD, '').replace(/^[（(]|[）)]$/g, '').trim() : '',
      note: isCoord ? '' : extra,
    });
  }
}

facilities.sort((a, b) => a.no - b.no);

// 座標を10進へ
for (const f of facilities) {
  f.nav1 = toDecimal(f.coord1);
  f.nav2 = f.coord2 ? toDecimal(f.coord2) : null;
  f.kanaReady = !KANJI.test(f.kana);
}

if (MODE === 'json') {
  const out = process.argv[process.argv.indexOf('--json') + 1];
  const text = JSON.stringify(facilities, null, 2);
  if (out && !out.startsWith('--')) writeFileSync(out, text);
  else console.log(text);
  process.exit(0);
}

if (MODE === 'missing') {
  const missing = facilities.filter((f) => !f.kanaReady);
  console.log(`  よみがなが埋まらない施設 ${missing.length} 件`);
  console.log('');
  console.log('  番号\t施設名\tよみがな（ご記入ください）');
  for (const f of missing) console.log(`  ${f.no}\t${f.name}\t`);
  process.exit(0);
}

console.log(`  施設 ${facilities.length} 件`);
console.log(`  よみがな確定 ${facilities.filter((f) => f.kanaReady).length} 件 / 未確定 ${facilities.filter((f) => !f.kanaReady).length} 件`);
console.log(`  座標が読めた ${facilities.filter((f) => f.nav1).length} 件 / 読めず ${facilities.filter((f) => !f.nav1).length} 件`);
console.log(`  進入路が2種類 ${facilities.filter((f) => f.nav2).length} 件`);
console.log(`  車寄せ 有 ${facilities.filter((f) => f.hasDropoff).length} 件 / 無 ${facilities.filter((f) => !f.hasDropoff).length} 件`);
console.log(`  注記あり ${facilities.filter((f) => f.note).length} 件`);
console.log('');

const areas = new Map();
for (const f of facilities) areas.set(f.area, (areas.get(f.area) ?? 0) + 1);
console.log(`  エリア ${areas.size} 区分（分類には使わず、記録として残す）`);
for (const [a, n] of [...areas].sort((x, y) => y[1] - x[1])) {
  console.log(`      ${String(a ?? '(見出しなし)').padEnd(24)} ${n} 件`);
}
