/**
 * 受領した一覧と、いま登録されている内容を突き合わせる。
 *
 * **変更はしない。差分を出すだけ。**
 *   以前、目で読み取った内容で登録して26件を誤った。
 *   何がどう変わるかをお見せしてからでなければ投入しない。
 *
 * 照合の順序:
 *   1. 名前が完全に一致するもの
 *   2. 記号や空白を無視して一致するもの（表記ゆれ）
 *   3. 座標が近いもの（30m以内）
 *
 *   使い方:
 *     node tools/diff-sheet-vs-db.mjs data/import/ホテル１_1.xlsx
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('  .xlsx を指定してください');
  process.exit(1);
}

const sheet = JSON.parse(
  execFileSync('node', ['tools/build-catalog-from-sheet.mjs', file, '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
);

// --- いま登録されている内容 ---------------------------------------------------
const env = Object.fromEntries(
  execFileSync('node', ['-e', "const fs=require('fs');process.stdout.write(fs.readFileSync('admin/.env.local','utf8'))"], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);

const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(path) {
  const res = await fetch(`${BASE}/rest/v1${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const current = await rest(
  '/facilities?select=id,code,name,name_kana,lat,lng,entry_points(id,code,name,kind,nav_lat,nav_lng)&limit=1000',
);

// --- 照合 ---------------------------------------------------------------------
/** 記号と空白を落とす。表記ゆれを吸収する。 */
const loose = (s) =>
  (s ?? '')
    // 全角の英数字・記号を半角へ。（）と () を同一視するため。
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    // 空白・中黒・ダッシュ・括弧を落とす
    .replace(/[\s　・･\-‐－—()[\]【】<>＜＞]/g, '')
    // カタカナをひらがなへ
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase();

/** 2点間のおおよその距離（m） */
function metres(a, b) {
  if (!a?.lat || !b?.lat) return Infinity;
  const dLat = (a.lat - b.lat) * 111320;
  const dLng = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

const byName = new Map(current.map((f) => [f.name, f]));
const byLoose = new Map(current.map((f) => [loose(f.name), f]));

const matched = new Map(); // 受領の no → 既存
const renamed = [];
const added = [];

for (const s of sheet) {
  let hit = byName.get(s.name);
  let how = '名前が一致';

  if (!hit) {
    hit = byLoose.get(loose(s.name));
    how = '表記ゆれ';
  }
  /*
    座標での照合は、施設ではなく進入口を見る。

    facilities.lat/lng は35件中34件が null で、実際の座標は
    entry_points.nav_lat/nav_lng にしか入っていない。
    施設側を見ていたため、綴りの違う「ハイアット/ハイヤット」を
    消えたものと誤って報告した。
  */
  if (!hit && s.nav1) {
    hit = current.find((c) =>
      (c.entry_points ?? []).some(
        (e) => metres({ lat: e.nav_lat, lng: e.nav_lng }, s.nav1) < 30,
      ),
    );
    how = '座標が近い';
  }

  if (hit) {
    matched.set(s.no, hit);
    if (hit.name !== s.name) renamed.push({ s, hit, how });
  } else {
    added.push(s);
  }
}

const usedIds = new Set([...matched.values()].map((f) => f.id));
const orphans = current.filter((f) => !usedIds.has(f.id));

// --- 報告 ---------------------------------------------------------------------
console.log(`  受領 ${sheet.length} 件 / 登録済み ${current.length} 件`);
console.log('');
console.log(`  そのまま一致        ${matched.size - renamed.length} 件`);
console.log(`  表記が変わるもの     ${renamed.length} 件`);
console.log(`  新しく増えるもの     ${added.length} 件`);
console.log(`  一覧から消えたもの   ${orphans.length} 件`);
console.log('');

if (renamed.length) {
  console.log('  --- 表記が変わるもの ---');
  for (const { s, hit, how } of renamed) {
    console.log(`      [${how}] ${hit.name}`);
    console.log(`               → ${s.name}`);
  }
  console.log('');
}

if (orphans.length) {
  console.log('  --- 一覧から消えたもの（ご確認ください）---');
  for (const f of orphans) console.log(`      ${f.code}  ${f.name}`);
  console.log('');
}

console.log(`  新しく増える ${added.length} 件のうち、よみがなが埋まらないもの: ${added.filter((a) => !a.kanaReady).length} 件`);
