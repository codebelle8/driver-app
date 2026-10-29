/**
 * レジデンスの一覧（.xlsx）を本番へ取り込む。
 *
 * **既定では何も書き換えない。** 予定を出すだけ。
 * 実行するには --apply を付ける。
 *
 *   node tools/import-residences.mjs data/import/レジデンス原本.xlsx
 *   node tools/import-residences.mjs data/import/レジデンス原本.xlsx --apply
 *
 * **表の形**（2026-10-29 受領）
 *   左右2列。エリアの見出しが途中に挟まる（ホテルの一覧と同じ並び）。
 *     A列 番号  B列 名前  C列 車寄せ（有/無）  D列 座標  E列 注記
 *     G〜K列 同じ並びの右側
 *   ホテルと違い、名前は「・」で始まらない。見出しは地名だけの行
 *   （漢字・ひらがな・「・」のみ、番号なし）で見分ける。
 *   表の下に、先頭3行の写しが残っている。2度目の見出し行で読むのをやめる。
 *
 * **公開するもの・下書きにするもの**
 *   座標があるものだけを公開する。座標の無いもの（「確認中」・名前だけ）は
 *   下書きで登録し、管理画面にだけ出す。座標を入れて公開を押せばアプリに載る。
 *   「正確な位置を確認中」と注記のあるものは、座標があっても下書きにする。
 *   違う場所へ案内するほうが、載っていないより害が大きい。
 *
 * **施設コードは表の番号に合わせる**（ホテルと同じ。46番 → RSD-0046）
 *   ただし表の番号には重なりと抜けがある（54番が5行、右側の57番が9行、
 *   番号の無い行が2つ）。最初の1行に表の番号を使い、残りは表の最大の
 *   番号の次（98番）から読む順に振る。何番を振ったかは管理メモに残す。
 *
 * **一覧をそのまま写す**（ホテルでのご指示 2026-09-04）
 *   同じ建物らしい行が2つあっても、寄せずに2件として登録する。
 *   気づいたものは管理メモに書いておく。
 *
 * **並び順**
 *   表を読む順（左の列を上から、続いて右の列）。ホテル（1〜194）の後ろに
 *   並ぶよう 1000 を足す。「すべて」の一覧でホテルと交互にならない。
 *
 * **住所**
 *   一覧に住所は無い。座標から国土地理院の逆ジオコーダで町丁目まで引く。
 *   座標の無いものは空のまま（公開の前に埋まる）。
 */
import { existsSync, readFileSync } from 'node:fs';

import { AREAS, CITIES, PREFECTURES } from './data/translations-ja-en.mjs';
import { loadMuni } from './lib/muni.mjs';
import { readSheet } from './lib/xlsx.mjs';

const file = process.argv[2];
const APPLY = process.argv.includes('--apply');

if (!file || !existsSync(file)) {
  console.error('  .xlsx を指定してください');
  process.exit(1);
}

// --- 接続 ---------------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync('admin/.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(path, init = {}) {
  const res = await fetch(`${BASE}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
}

// --- 表を読む -----------------------------------------------------------------
const COORD = /(\d+)°(\d+)'([\d.]+)"([NS])\s+(\d+)°(\d+)'([\d.]+)"([EW])/;
const KANJI = /[一-鿿々]/;
// 地名に混じるカタカナ（虎ノ門・千鳥ヶ淵）は見出しの側に入れる
const HEADING = /^[一-鿿々ぁ-ゖノヶケ・]+$/;
const UNSURE = /正確な位置を確認中/;

const FALLBACK_TEXT =
  '現地調査前です。座標のみ登録されています。到着後の進入方法は追ってお知らせします。';
const FALLBACK_TEXT_EN =
  'Not yet surveyed. Only the coordinates are registered. Approach details will follow.';

/** 度分秒を10進へ */
function toDecimal(text) {
  const m = (text ?? '').match(COORD);
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

/** 記号と空白を落とす。同じ建物らしい行を見つけるため。 */
const loose = (s) =>
  (s ?? '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s　・･\-‐－—()[\]【】<>＜＞]/g, '')
    .toLowerCase();

const SIDES = [
  { no: 'A', name: 'B', dropoff: 'C', coord: 'D', note: 'E' },
  { no: 'G', name: 'H', dropoff: 'I', coord: 'J', note: 'K' },
];

const rows = readSheet(file);

// 表の下に残っている写しを読まない
let headers = 0;
const body = [];
for (const r of rows) {
  if (r.C?.text === '車寄せ' && ++headers > 1) break;
  body.push(r);
}

const listed = [];
for (const side of SIDES) {
  let area = null;
  for (const r of body) {
    const name = (r[side.name]?.text ?? '').trim();
    if (!name || r[side.dropoff]?.text === '車寄せ') continue;

    const noText = r[side.no]?.text ?? '';
    const no = /^\d+$/.test(noText) ? Number(noText) : null;

    if (no === null && HEADING.test(name)) {
      area = name;
      continue;
    }

    const kana = (r[side.name]?.kana ?? '').trim();
    const coordText = r[side.coord]?.text ?? '';
    const note = (r[side.note]?.text ?? '').trim();

    listed.push({
      no,
      area,
      name,
      kana: kana && !KANJI.test(kana) ? kana : name,
      kanaFromSheet: Boolean(kana) && !KANJI.test(kana),
      hasDropoff: (r[side.dropoff]?.text ?? '') === '有',
      nav: toDecimal(coordText),
      coordText,
      unsure: UNSURE.test(note),
      note: UNSURE.test(note) ? '' : note,
    });
  }
}

// --- 番号を振る ---------------------------------------------------------------
const maxNo = Math.max(...listed.map((x) => x.no ?? 0));
let next = maxNo + 1;
const used = new Set();
for (const x of listed) {
  if (x.no !== null && !used.has(x.no)) {
    x.codeNo = x.no;
  } else {
    x.codeNo = next++;
  }
  used.add(x.codeNo);
}

const code = (n) => `RSD-${String(n).padStart(4, '0')}`;

listed.forEach((x, i) => {
  x.code = code(x.codeNo);
  x.sort = 1000 + i + 1;
  x.publish = Boolean(x.nav) && !x.unsure;

  const twin = listed.slice(0, i).find((y) => loose(y.name) === loose(x.name));
  x.twin = twin ?? null;

  const memo = [];
  if (x.area) memo.push(`エリア: ${x.area}`);
  if (x.no === null) memo.push(`一覧に番号なし → ${x.codeNo} を付番`);
  else if (x.no !== x.codeNo) memo.push(`一覧の番号 ${x.no}（重複）→ ${x.codeNo} を付番`);
  if (twin) memo.push(`${twin.code} と同じ施設の可能性（一覧のまま2件で登録）`);
  if (!x.nav) memo.push(`ナビ座標なし（一覧: ${x.coordText || '空欄'}）`);
  if (x.unsure) memo.push('座標は「正確な位置を確認中」（一覧の注記）。確認後に公開');
  if (x.nav) memo.push('住所は座標から特定（番地は未確認）');
  if (!x.kanaFromSheet) memo.push('よみがなは名前で代用');
  x.memo = memo.join(' / ');
});

// --- 予定 ---------------------------------------------------------------------
const pub = listed.filter((x) => x.publish);
const draft = listed.filter((x) => !x.publish);

console.log(`  一覧 ${listed.length} 件`);
console.log(`    公開する（座標あり）       ${pub.length} 件`);
console.log(`    下書き（座標なし・確認中） ${draft.length} 件`);
console.log('');
console.log('  コード     表  状態    区分  名前');
for (const x of listed) {
  console.log(
    `  ${x.code}  ${String(x.no ?? '-').padStart(3)}  ${x.publish ? '公開  ' : '下書き'}  ${x.hasDropoff ? '車寄せ' : '入口  '}  ${x.name}` +
      (x.twin ? `   ※ ${x.twin.code} と同名` : '') +
      (x.no !== x.codeNo ? `   ※ 表 ${x.no ?? '番号なし'}` : ''),
  );
}

if (!APPLY) {
  console.log('');
  console.log('  予定を出しただけです。実行するには --apply を付けてください。');
  process.exit(0);
}

// --- 実行 ---------------------------------------------------------------------
const categories = (await rest('/categories?select=id,code')).body ?? [];
const residence = categories.find((c) => c.code === 'residence');
if (!residence) {
  console.error('  カテゴリ「レジデンス」が見つかりません');
  process.exit(1);
}

const current =
  (
    await rest(
      '/facilities?select=id,code,prefecture,city,address_line,entry_points(id,code)' +
        `&category_id=eq.${residence.id}&limit=1000`,
    )
  ).body ?? [];
const byCode = new Map(current.map((f) => [f.code, f]));

const MUNI = loadMuni();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 国土地理院へ問い合わせ、町丁目まで引く */
async function address(lat, lng) {
  const url =
    'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress' +
    `?lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'kurumayose-navi/1.0' } });
    if (!res.ok) return null;
    const r = (await res.json())?.results;
    if (!r?.muniCd) return null;
    const m = MUNI[String(r.muniCd).padStart(5, '0')];
    if (!m) return null;
    return { prefecture: m.pref, city: m.city, address_line: r.lv01Nm ?? '' };
  } catch {
    return null;
  }
}

const CHOME = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** 「六本木一丁目」→「1-chome, Roppongi」（tools/translate-facilities.mjs と同じ規則） */
function addressEn(ja) {
  const m = ja.match(/^(.+?)([一二三四五六七八九十]+)丁目$/);
  if (m) {
    const area = AREAS[m[1]];
    const n = CHOME[m[2]];
    return area && n ? `${n}-chome, ${area}` : null;
  }
  return AREAS[ja] ?? null;
}

console.log('');
console.log('  取り込みます…');

const problems = [];
const noEnglishAddress = [];
let done = 0;

for (const x of listed) {
  const existing = byCode.get(x.code);

  let addr = null;
  if (x.nav && !existing?.address_line) {
    addr = await address(x.nav.lat, x.nav.lng);
    // 相手方に負荷をかけないよう間隔を空ける
    await sleep(120);
    if (!addr) problems.push(`${x.code} ${x.name}: 住所を引けませんでした`);
  }

  // 2度目からは引いてある住所を使う。英語の町名は表が増えていれば埋まる。
  const place =
    addr ??
    (existing?.address_line
      ? { prefecture: existing.prefecture, city: existing.city, address_line: existing.address_line }
      : { prefecture: '東京都', city: null, address_line: '' });
  const address_line_en = place.address_line ? addressEn(place.address_line) : null;
  if (place.address_line && !address_line_en) noEnglishAddress.push(place.address_line);

  // 入口が揃うまでは下書きにしておく。途中でアプリが読みに来ても、空の施設を見せない。
  const facility = {
    code: x.code,
    name: x.name,
    name_kana: x.kana,
    category_id: residence.id,
    sort_order: x.sort,
    status: existing ? undefined : 'draft',
    note_internal: x.memo,
    prefecture: place.prefecture,
    city: place.city,
    address_line: place.address_line,
    prefecture_en: PREFECTURES[place.prefecture] ?? null,
    city_en: place.city ? (CITIES[place.city] ?? null) : null,
    address_line_en,
  };

  const r = existing
    ? await rest(`/facilities?id=eq.${existing.id}`, { method: 'PATCH', body: facility })
    : await rest('/facilities', { method: 'POST', body: facility });
  if (!r.ok) {
    problems.push(`${x.code} ${x.name}: 施設を書けません ${JSON.stringify(r.body)}`);
    continue;
  }
  const facilityId = existing?.id ?? r.body[0].id;

  const usesFallback = !x.note;
  const entry = {
    facility_id: facilityId,
    code: 'A',
    kind: x.hasDropoff ? 'dropoff' : 'entrance',
    name: x.hasDropoff ? '車寄せ' : 'エントランス',
    name_en: x.hasDropoff ? 'Drop-off' : 'Entrance',
    nav_lat: x.nav?.lat ?? null,
    nav_lng: x.nav?.lng ?? null,
    approach_text: x.note || FALLBACK_TEXT,
    // 注記の英訳は持っていない。空なら英語表示でも日本語のまま出る。
    approach_text_en: usesFallback ? FALLBACK_TEXT_EN : null,
    sort_order: 1,
  };
  const found = (existing?.entry_points ?? []).find((e) => e.code === 'A');
  const e = found
    ? await rest(`/entry_points?id=eq.${found.id}`, { method: 'PATCH', body: entry })
    : await rest('/entry_points', { method: 'POST', body: entry });
  if (!e.ok) {
    problems.push(`${x.code} 入口A: ${JSON.stringify(e.body)}`);
    continue;
  }

  const s = await rest(`/facilities?id=eq.${facilityId}`, {
    method: 'PATCH',
    body: { status: x.publish ? 'published' : 'draft' },
  });
  if (!s.ok) problems.push(`${x.code} 公開状態: ${JSON.stringify(s.body)}`);

  done++;
  if (done % 20 === 0) console.log(`      ${done} / ${listed.length}`);
}

console.log('');
console.log(`  ${done} 件を取り込みました（公開 ${pub.length} / 下書き ${draft.length}）`);
if (noEnglishAddress.length) {
  console.log(`  英語の町名が表に無い住所 ${noEnglishAddress.length} 件（英語表示では日本語のまま）:`);
  console.log('      ' + [...new Set(noEnglishAddress)].join('、'));
}
if (problems.length) {
  console.log('');
  console.log(`  問題 ${problems.length} 件:`);
  problems.forEach((p) => console.log('      ' + p.slice(0, 200)));
}
