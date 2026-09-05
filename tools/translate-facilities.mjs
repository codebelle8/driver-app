/**
 * 施設データへ英訳を入れる。
 *
 *   node tools/translate-facilities.mjs          当たり具合を見るだけ
 *   node tools/translate-facilities.mjs --apply  書き込む
 *
 * **なぜ表から当てるか**
 *   機械翻訳へ都度投げる作りにすると、鍵と課金が要るうえ、
 *   同じ入力でも時期によって訳が変わる。訳は tools/data/ に置き、
 *   ここは当てはめるだけにする。何をどう訳したかが後から読め、
 *   直したい箇所だけ直せる。
 *
 * **住所は組み立てる**
 *   「六本木一丁目」を1件ずつ持つと、同じ町名の読みが場所によって
 *   食い違う。町名の読みだけを持ち、丁目は数に直して並べる。
 *
 * **当たらなかったものは黙って飛ばさない**
 *   数えて出す。訳の抜けは画面では日本語のまま出るだけで、
 *   気づかないまま残る。
 */
import { readFileSync } from 'node:fs';

import { FACILITY_NAMES } from './data/facility-names-ja-en.mjs';
import {
  AREAS,
  APPROACH_TEXTS,
  CATEGORIES,
  CITIES,
  ENTRY_NAMES,
  PREFECTURES,
} from './data/translations-ja-en.mjs';

const APPLY = process.argv.includes('--apply');

const env = {};
for (const l of readFileSync('admin/.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path, { method = 'GET', body } = {}) {
  const r = await fetch(SB + path, {
    method,
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text ? JSON.parse(text) : null };
}

/** 漢数字の丁目を算用数字へ */
const CHOME = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  十: 10, 十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15,
};

/**
 * 「六本木一丁目」→「1-chome, Roppongi」
 *
 * 丁目の無い町（一番町・千鳥など）はそのまま読みを返す。
 * 英語では小さい単位を先に置くため、丁目が前に来る。
 */
export function translateAddress(ja) {
  const m = ja.match(/^(.+?)([一二三四五六七八九十]+)丁目$/);
  if (m) {
    const area = AREAS[m[1]];
    const n = CHOME[m[2]];
    if (area && n) return `${n}-chome, ${area}`;
    return null;
  }
  return AREAS[ja] ?? null;
}

const missing = { facility: [], address: [], city: [], prefecture: [], entry: [], approach: [], category: [] };
let counts = { facility: 0, address: 0, city: 0, prefecture: 0, entry: 0, approach: 0, category: 0 };

// --- 施設 ---------------------------------------------------------------------
const facs = (await sb('/rest/v1/facilities?select=id,code,name,prefecture,city,address_line&order=code')).body ?? [];
const facUpdates = [];
for (const f of facs) {
  const name_en = FACILITY_NAMES[f.name] ?? null;
  const prefecture_en = PREFECTURES[f.prefecture] ?? null;
  const city_en = f.city ? (CITIES[f.city] ?? null) : null;
  const address_line_en = f.address_line ? translateAddress(f.address_line) : null;

  if (name_en) counts.facility++;
  else missing.facility.push(f.name);
  if (prefecture_en) counts.prefecture++;
  else missing.prefecture.push(f.prefecture);
  if (!f.city || city_en) counts.city++;
  else missing.city.push(f.city);
  if (!f.address_line || address_line_en) counts.address++;
  else missing.address.push(f.address_line);

  facUpdates.push({ id: f.id, name_en, prefecture_en, city_en, address_line_en });
}

// --- 入口 ---------------------------------------------------------------------
const eps = (await sb('/rest/v1/entry_points?select=id,name,approach_text')).body ?? [];
const epUpdates = [];
for (const e of eps) {
  const name_en = ENTRY_NAMES[e.name] ?? null;
  const approach_text_en = e.approach_text ? (APPROACH_TEXTS[e.approach_text] ?? null) : null;
  if (name_en) counts.entry++;
  else missing.entry.push(e.name);
  if (!e.approach_text || approach_text_en) counts.approach++;
  else missing.approach.push(e.approach_text);
  epUpdates.push({ id: e.id, name_en, approach_text_en });
}

// --- カテゴリ -------------------------------------------------------------------
const cats = (await sb('/rest/v1/categories?select=id,code,name')).body ?? [];
const catUpdates = [];
for (const c of cats) {
  const name_en = CATEGORIES[c.code] ?? null;
  if (name_en) counts.category++;
  else missing.category.push(c.code + ' / ' + c.name);
  catUpdates.push({ id: c.id, name_en });
}

// --- 当たり具合 -----------------------------------------------------------------
const line = (label, n, total, miss) =>
  `  ${label.padEnd(12)} ${String(n).padStart(4)} / ${total}` +
  (miss.length ? `   未訳 ${[...new Set(miss)].length} 種` : '');

console.log('英訳の当たり具合\n');
console.log(line('施設名', counts.facility, facs.length, missing.facility));
console.log(line('都道府県', counts.prefecture, facs.length, missing.prefecture));
console.log(line('市区町村', counts.city, facs.length, missing.city));
console.log(line('町丁目', counts.address, facs.length, missing.address));
console.log(line('入口名', counts.entry, eps.length, missing.entry));
console.log(line('進入方法', counts.approach, eps.length, missing.approach));
console.log(line('カテゴリ', counts.category, cats.length, missing.category));

for (const [k, list] of Object.entries(missing)) {
  const uniq = [...new Set(list)];
  if (uniq.length === 0) continue;
  console.log(`\n未訳（${k}）:`);
  for (const x of uniq.slice(0, 30)) console.log('  ' + x);
  if (uniq.length > 30) console.log(`  … ほか ${uniq.length - 30} 種`);
}

if (!APPLY) {
  console.log('\n書き込むには --apply を付けてください');
  process.exit(0);
}

// --- 書き込む -------------------------------------------------------------------
console.log('\n書き込んでいます…');
let wrote = 0;
const write = async (table, rows) => {
  for (const row of rows) {
    const { id, ...fields } = row;
    // 訳の無いものは触らない。既に入っている訳を null で潰さない。
    const payload = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null));
    if (Object.keys(payload).length === 0) continue;
    const r = await sb(`/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', body: payload });
    if (r.ok) wrote++;
    else console.error(`  失敗 ${table} ${id}: ${JSON.stringify(r.body)}`);
  }
};

await write('facilities', facUpdates);
await write('entry_points', epUpdates);
await write('categories', catUpdates);
console.log(`${wrote} 行へ書き込みました`);
