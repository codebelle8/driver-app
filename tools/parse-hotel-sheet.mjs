/**
 * クライアント様の一覧（.xlsx）を、機械が扱える形へ起こす。
 *
 * **なぜ専用の道具が要るか**
 *   この表は「左右2列に分かれ、エリアの見出しが途中に挟まる」形で、
 *   人が見る前提で作られている。素直に読むと列がずれる。
 *
 *   表の形:
 *     A列  番号        B列  施設名      C列  車寄せ(有/無)
 *     D列  座標1       E列  座標2 または注記
 *     G〜K列  同じ並びの右側
 *
 *   E列は「2つ目の座標」か「注記」のどちらかで、中身を見て判断する。
 *   クライアント様のご回答（2026-08-30）により、2つ目の座標は
 *   別の進入路のナビ地点にあたる。
 *
 *   使い方:
 *     node tools/parse-hotel-sheet.mjs data/import/ホテル１_1.xlsx
 *     node tools/parse-hotel-sheet.mjs <path> --json > out.json
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const file = process.argv[2];
const AS_JSON = process.argv.includes('--json');

if (!file || !existsSync(file)) {
  console.error('  ファイルを指定してください');
  process.exit(1);
}

function entry(name) {
  return execFileSync('unzip', ['-p', file, name], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function unescape(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

function texts(xml) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1]));
}

/** ふりがな (<rPh>) を落として読む。含めると索引がずれる。 */
const strings = [...entry('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
  texts(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '')).join(''),
);

/**
 * 行ごとに、列名 → 値 の対応を作る。
 *
 * **空のセルは `<c r="A2" s="1"/>` と自己完結の形で書かれる。**
 *   これを見落とすと `<c ...>…</c>` の対で拾おうとして解釈が崩れ、
 *   見出しの行が「数値」として読まれた（共有文字列の索引がそのまま出る）。
 *   実際、2行目の「東京駅・銀座」が数字の 2 に化けていた。
 */
const rows = [];
for (const row of entry('xl/worksheets/sheet1.xml').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
  const cells = {};
  // 中身のあるセルと、空のセル（自己完結）の両方を拾う
  for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const col = (c[1].match(/r="([A-Z]+)\d+"/) ?? [])[1];
    if (!col) continue;
    const inner = c[2] ?? '';
    const v = (inner.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1];
    let value = '';
    if (/t="s"/.test(c[1]) && v !== undefined) value = strings[Number(v)] ?? '';
    else if (/t="inlineStr"/.test(c[1])) value = texts(inner).join('');
    else if (v !== undefined) value = unescape(v);
    if (value !== '') cells[col] = value.trim();
  }
  if (Object.keys(cells).length) rows.push(cells);
}

const COORD = /^\d+°\d+'[\d.]+"[NS] \d+°\d+'[\d.]+"[EW]/;

/** 左右それぞれの列の割り当て */
const SIDES = [
  { name: 'B', dropoff: 'C', coord1: 'D', extra: 'E', noCols: ['A'] },
  { name: 'H', dropoff: 'I', coord1: 'J', extra: 'K', noCols: ['G'] },
];

const facilities = [];
/** エリアの見出し。次の見出しまでの施設がその区分に属する。 */
const areaOf = { B: null, H: null };

for (const r of rows) {
  for (const s of SIDES) {
    const name = r[s.name];

    /*
      見出しの行。名前の欄に「・」で始まらない文字だけがある。
      施設名はすべて「・」で始まっている。
    */
    if (name && !name.startsWith('・') && !COORD.test(name)) {
      areaOf[s.name] = name;
      continue;
    }

    if (!name?.startsWith('・')) continue;

    /*
      番号を拾う。列が一定でない。

      左側に施設がある行  … A列が左の番号、G列が右の番号
      右側だけの行        … G列に右の番号
    */
    const no = s.noCols.map((col) => r[col]).find((v) => /^\d+$/.test(v ?? ''));
    if (!no) continue;

    const extra = r[s.extra] ?? '';
    const isCoord = COORD.test(extra);

    facilities.push({
      no: Number(no),
      area: areaOf[s.name],
      name: name.replace(/^・/, '').trim(),
      dropoff: r[s.dropoff] ?? '',
      coord1: r[s.coord1] ?? '',
      // 2つ目の座標は別の進入路。注記と同じ欄に入っているため中身で分ける。
      coord2: isCoord ? extra : '',
      note: isCoord ? '' : extra,
    });
  }
}

facilities.sort((a, b) => a.no - b.no);

if (AS_JSON) {
  console.log(JSON.stringify(facilities, null, 2));
  process.exit(0);
}

console.log(`  施設 ${facilities.length} 件`);

const nums = new Set(facilities.map((f) => f.no));
const missing = [];
for (let n = 1; n <= Math.max(...nums); n++) if (!nums.has(n)) missing.push(n);
console.log(`  番号 1〜${Math.max(...nums)}  欠番 ${missing.length ? missing.join(', ') : 'なし'}`);
console.log(`  座標が2つ: ${facilities.filter((f) => f.coord2).length} 件`);
console.log(`  注記あり  : ${facilities.filter((f) => f.note).length} 件`);
console.log(`  車寄せ 有 : ${facilities.filter((f) => f.dropoff === '有').length} 件 / 無 ${facilities.filter((f) => f.dropoff === '無').length} 件`);
console.log('');

const areas = new Map();
for (const f of facilities) areas.set(f.area, (areas.get(f.area) ?? 0) + 1);
console.log(`  エリア ${areas.size} 区分:`);
for (const [a, n] of areas) console.log(`      ${String(a ?? '(見出しなし)').padEnd(22)} ${n} 件`);
