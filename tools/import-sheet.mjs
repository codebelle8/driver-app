/**
 * 受領した一覧（.xlsx）を本番へ取り込む。
 *
 * **既定では何も書き換えない。** 予定を出すだけ。
 * 実行するには --apply を付ける。
 *
 *   node tools/import-sheet.mjs data/import/ホテル１_1.xlsx
 *   node tools/import-sheet.mjs data/import/ホテル１_1.xlsx --apply
 *
 * **一覧をそのまま写す**（ご指示 2026-09-04）
 *   61番と130番のように、同じ施設が別表記で2行ある場合も、
 *   一覧のとおり2件として登録する。こちらの判断で寄せない。
 *
 * **施設コードは表の番号に合わせる**
 *   69番 → HTL-0069。お手元の一覧と画面が番号で対応する。
 *   既存のコードも振り直し、写真の保存先もあわせて移す。
 *   写真は75枚すべてが仮画像なので、実画像が入る前に済ませる。
 *
 * **並び順**
 *   sort_order に表の番号をそのまま入れる。よみがなが揃っておらず
 *   （193件中150件が未入力）、かな順にすると推測で誤った位置に並ぶ。
 *
 * **進入路が2種類ある施設**
 *   座標が2つあるものは進入口を2つ作る（クライアント様のご回答
 *   2026-08-30「進入路が２種類ある施設はナビポイント２か所座標があります」）。
 *
 * **住所**
 *   一覧に住所は無い。座標から国土地理院の逆ジオコーダで町丁目まで引く。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { loadMuni } from './lib/muni.mjs';

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

const sheet = JSON.parse(
  execFileSync('node', ['tools/build-catalog-from-sheet.mjs', file, '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
);

const code = (no) => `HTL-${String(no).padStart(4, '0')}`;

// --- 現状 ---------------------------------------------------------------------
const current =
  (
    await rest(
      '/facilities?select=id,code,name,address_line,sort_order,' +
        'entry_points(id,code,name,kind,nav_lat,nav_lng,sort_order)&limit=1000',
    )
  ).body ?? [];

const categories = (await rest('/categories?select=id,code,name')).body ?? [];
const hotel = categories.find((c) => c.code === 'hotel');
if (!hotel) {
  console.error('  カテゴリ「ホテル」が見つかりません');
  process.exit(1);
}

/** 記号と空白を落とす。表記ゆれを吸収する。 */
const loose = (s) =>
  (s ?? '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s　・･\-‐－—()[\]【】<>＜＞]/g, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase();

/** 2点間のおおよその距離（m） */
function metres(a, b) {
  if (a?.lat == null || b?.lat == null) return Infinity;
  const dLat = (a.lat - b.lat) * 111320;
  const dLng = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/*
  対応づけは1対1に限る。

  受領データには同じ施設が別表記で2行ある（61番と130番）。
  片方ずつ照合すると同じ既存施設を2件が掴み、1件を2か所へ
  更新してデータが壊れる。掴んだものは以降の候補から外す。

  座標での照合は施設ではなく進入口を見る。facilities.lat/lng は
  ほとんどが null で、実際の座標は entry_points 側にしか入っていない。
*/
const claimed = new Set();

function findExisting(s) {
  const free = current.filter((f) => !claimed.has(f.id));

  /*
    コードでは照合しない。

    振り直しの途中では、目的のコードを別の施設がまだ持っている。
    実際に HTL-0003 はマンダリンオリエンタルが握ったままで、
    コードを先に見ると表の3番（ブルガリ）が別の施設を掴み、
    別名や写真がその施設に残ったまま中身だけ入れ替わる。
    名前で照合すれば、コードがずれていても正しい相手に届く。
  */
  const hit =
    free.find((f) => f.name === s.name) ??
    free.find((f) => loose(f.name) === loose(s.name)) ??
    (s.nav1
      ? free.find((f) =>
          (f.entry_points ?? []).some(
            (e) => metres({ lat: e.nav_lat, lng: e.nav_lng }, s.nav1) < 30,
          ),
        )
      : null) ??
    null;

  if (hit) claimed.add(hit.id);
  return hit;
}

// --- 予定 ---------------------------------------------------------------------
const plan = sheet.map((s) => {
  const hit = findExisting(s);
  return { s, hit, action: hit ? 'update' : 'insert' };
});
const orphans = current.filter((f) => !claimed.has(f.id));
const needsRecode = plan.filter((x) => x.hit && x.hit.code !== code(x.s.no));

console.log(`  受領 ${sheet.length} 件 / 登録済み ${current.length} 件`);
console.log('');
console.log(`  内容を更新   ${plan.filter((p) => p.action === 'update').length} 件`);
console.log(`  新しく追加   ${plan.filter((p) => p.action === 'insert').length} 件`);
console.log(`  コードを変更 ${needsRecode.length} 件`);
console.log(`  一覧に無い   ${orphans.length} 件`);

if (orphans.length) {
  console.log('');
  console.log('  --- 一覧に無いもの（触りません）---');
  for (const f of orphans) console.log(`      ${f.code}  ${f.name}`);
}

if (!APPLY) {
  console.log('');
  console.log('  予定を出しただけです。実行するには --apply を付けてください。');
  process.exit(0);
}

// --- 実行 ---------------------------------------------------------------------
const MUNI = loadMuni();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let done = 0;
const problems = [];

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

/*
  コードを振り直す前に、いったん空き番号へ退避する。

  施設コードは一意で、振り直しは値の入れ替えになる。順に書き換えると
  「移したい先を、まだ移していない施設が持っている」状態にぶつかって
  弾かれる（実際に32件が失敗した）。

  コードには ^[A-Z]{3}-[0-9]{4}$ の形式制約があるため、TMP- のような
  文字列は使えない。同じ形式の空き番号を使う。表の番号は最大194なので
  9000番台とは衝突しない。
*/
if (needsRecode.length) {
  console.log('');
  console.log(`  コードを退避します（${needsRecode.length} 件）…`);
  let park = 9000;
  for (const { hit } of needsRecode) {
    const r = await rest(`/facilities?id=eq.${hit.id}`, {
      method: 'PATCH',
      body: { code: code(park++) },
    });
    if (!r.ok) problems.push(`退避 ${hit.code}: ${JSON.stringify(r.body)}`);
  }
}

console.log('');
console.log('  取り込みます…');

for (const { s, hit } of plan) {
  const want = code(s.no);

  // 住所は座標から引く。既に入っていればそのまま使う。
  let addr = null;
  if (!hit?.address_line) {
    addr = await address(s.nav1.lat, s.nav1.lng);
    // 相手方に負荷をかけないよう間隔を空ける
    await sleep(120);
    if (!addr) problems.push(`${want} ${s.name}: 住所を引けませんでした`);
  }

  const body = {
    code: want,
    name: s.name,
    // よみがなが埋まらないものは名前で代用する。空にすると検索から漏れる。
    name_kana: s.kanaReady ? s.kana : s.name,
    category_id: hotel.id,
    sort_order: s.no,
    status: 'published',
    ...(addr ?? {}),
  };

  let facilityId;
  if (hit) {
    const r = await rest(`/facilities?id=eq.${hit.id}`, { method: 'PATCH', body });
    if (!r.ok) {
      problems.push(`${want} ${s.name}: 更新できません ${JSON.stringify(r.body)}`);
      continue;
    }
    facilityId = hit.id;
  } else {
    const r = await rest('/facilities', {
      method: 'POST',
      body: {
        ...body,
        prefecture: body.prefecture ?? '東京都',
        address_line: body.address_line ?? '',
      },
    });
    if (!r.ok) {
      problems.push(`${want} ${s.name}: 追加できません ${JSON.stringify(r.body)}`);
      continue;
    }
    facilityId = r.body[0].id;
  }

  // --- 進入口 -----------------------------------------------------------------
  const kind = s.hasDropoff ? 'dropoff' : 'entrance';
  const base = s.hasDropoff ? '車寄せ' : 'エントランス';
  const points = [{ suffix: 'A', nav: s.nav1, note: s.note }];
  if (s.nav2) points.push({ suffix: 'B', nav: s.nav2, note: s.coord2Note });

  const existing = (hit?.entry_points ?? []).sort(
    (a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code),
  );

  for (const [i, p] of points.entries()) {
    const epBody = {
      facility_id: facilityId,
      code: p.suffix,
      kind,
      // 進入路が2種類あるときだけ番号を付け、対等に並べる
      name: points.length > 1 ? `${base}（進入路 ${i + 1}）` : base,
      nav_lat: p.nav.lat,
      nav_lng: p.nav.lng,
      approach_text:
        p.note ||
        '現地調査前です。座標のみ登録されています。到着後の進入方法は追ってお知らせします。',
      sort_order: i + 1,
    };
    const found = existing[i];
    const r = found
      ? await rest(`/entry_points?id=eq.${found.id}`, { method: 'PATCH', body: epBody })
      : await rest('/entry_points', { method: 'POST', body: epBody });
    if (!r.ok) problems.push(`${want} 進入口${p.suffix}: ${JSON.stringify(r.body)}`);
  }

  // 一覧より多い進入口は消す
  for (const extra of existing.slice(points.length)) {
    await rest(`/entry_points?id=eq.${extra.id}`, { method: 'DELETE' });
  }

  done++;
  if (done % 40 === 0) console.log(`      ${done} / ${plan.length}`);
}

/*
  写真の保存先を、新しいコードへ合わせる。

  保存先は HTL-0026/A/approach-placeholder.jpg の形でコードを含む。
  コードを振り直したのに保存先を放置すると、どの施設の写真か辿れなくなる。
  実体（Storage 上のファイル）は動かさない。いまは全部が仮画像で、
  差し替えの際に新しい保存先へ上書きされる。
*/
if (needsRecode.length) {
  console.log('');
  console.log('  写真の保存先を合わせます…');
  let moved = 0;
  for (const { s, hit } of needsRecode) {
    const ids = (hit.entry_points ?? []).map((e) => e.id);
    if (!ids.length) continue;
    const photos =
      (await rest(`/photos?select=id,storage_path&entry_point_id=in.(${ids.join(',')})`)).body ??
      [];
    for (const ph of photos) {
      const path = ph.storage_path ?? '';
      const m = path.match(/^([A-Z]{3}-\d{4})\//);
      if (!m || m[1] === code(s.no)) continue;
      const r = await rest(`/photos?id=eq.${ph.id}`, {
        method: 'PATCH',
        body: { storage_path: code(s.no) + path.slice(m[1].length) },
      });
      if (r.ok) moved++;
      else problems.push(`写真 ${path}: ${JSON.stringify(r.body)}`);
    }
  }
  console.log(`  写真 ${moved} 枚の保存先を合わせました`);
}

console.log('');
console.log(`  ${done} 件を取り込みました`);
if (problems.length) {
  console.log('');
  console.log(`  問題 ${problems.length} 件:`);
  problems.slice(0, 15).forEach((p) => console.log('      ' + p.slice(0, 160)));
}
