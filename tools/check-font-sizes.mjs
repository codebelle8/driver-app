/**
 * アプリの文字の大きさを数え上げる。
 *
 *   node tools/check-font-sizes.mjs
 *
 * **なぜ要るか**
 *   文字の大きさが画面ごとにばらばらに書かれており、どこが小さいのか
 *   一覧できない。「補足の文字を大きく」と言われても、対象が
 *   何か所あるのか分からないままでは直しようがない。
 *
 * 走行前の車内で読むため、小さい字は実際に読めない。
 * どの大きさが何か所あるかを出し、下から潰していく。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const found = new Map();
for (const f of walk(process.argv[2] ?? 'app/src')) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = line.match(/fontSize:\s*(\d+)/);
    if (!m) return;
    const size = Number(m[1]);
    if (!found.has(size)) found.set(size, []);
    found.get(size).push(`${f.split('\\').join('/')}:${i + 1}  ${line.trim()}`);
  });
}

const sizes = [...found.keys()].sort((a, b) => a - b);
let total = 0;
console.log('文字の大きさ（小さい順）\n');
for (const s of sizes) {
  const n = found.get(s).length;
  total += n;
  console.log(`  ${String(s).padStart(3)}px  ${String(n).padStart(3)} か所`);
}
console.log(`\n  合計 ${total} か所`);

const SMALL = Number(process.argv[3] ?? 13);
console.log(`\n${SMALL}px 以下の中身\n`);
for (const s of sizes.filter((x) => x <= SMALL)) {
  console.log(`--- ${s}px ---`);
  for (const l of found.get(s)) console.log('  ' + l);
}
