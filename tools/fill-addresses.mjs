/**
 * 座標から住所を割り出し、当方で推定していた住所を置き換える。
 *
 *   node tools/fill-addresses.mjs            確認のみ
 *   node tools/fill-addresses.mjs --apply    書き込む
 *
 * なぜこれで直せるか:
 *   いただいた一覧には住所が無く、町名まで当方の推定で埋めていた。
 *   しかし座標はいただいている。座標から住所を引けば、推定ではなく
 *   実際の町丁目が得られる。
 *
 * 国土地理院の逆ジオコーディングを使う理由:
 *   鍵もアカウントも不要で、国が整備した住所データを返す。
 *   Google の同種の機能は API キーが要り、そのキーはまだ取得できていない。
 *
 * 限界:
 *   返るのは町丁目まで（例: 内幸町一丁目）。番地までは分からない。
 *   建物の入口の座標なので、隣接する町丁目が返る場合がある。
 *   最終的な確認はクライアント様にお願いする前提。
 */
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv('admin/.env.local');
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/rest/v1${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, body: text ? JSON.parse(text) : null };
}

/**
 * 市区町村コードから区名へ。
 * 東京23区のうち、今回の対象になり得るものだけを持つ。
 * 返ってきたコードが表に無ければ、その旨を記録して人の判断に回す。
 */
const WARD = {
  '13101': '千代田区',
  '13102': '中央区',
  '13103': '港区',
  '13104': '新宿区',
  '13105': '文京区',
  '13109': '品川区',
  '13110': '目黒区',
  '13113': '渋谷区',
  '13116': '豊島区',
};

/** 国土地理院へ問い合わせる。混雑を避けるため間隔を空ける。 */
async function lookup(lat, lng) {
  const url =
    'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress' +
    `?lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'kurumayose-navi/1.0' } });
  if (!res.ok) return null;
  const json = await res.json();
  const r = json?.results;
  if (!r?.muniCd || !r?.lv01Nm) return null;
  return { muniCd: String(r.muniCd), town: r.lv01Nm };
}

const facilities = (
  await rest('/facilities?select=id,code,name,city,address_line,note_internal&order=code')
).body ?? [];
const entryPoints = (
  await rest('/entry_points?select=facility_id,code,nav_lat,nav_lng&order=code')
).body ?? [];

/** 施設ごとの代表座標。最初の進入口を使う。 */
const coordOf = new Map();
for (const ep of entryPoints) {
  if (ep.nav_lat === null || coordOf.has(ep.facility_id)) continue;
  coordOf.set(ep.facility_id, { lat: ep.nav_lat, lng: ep.nav_lng });
}

console.log(`施設 ${facilities.length} 件を照会します\n`);

const changes = [];
const problems = [];

for (const f of facilities) {
  const coord = coordOf.get(f.id);
  if (!coord) {
    problems.push(`${f.code} ${f.name}: 座標がありません`);
    continue;
  }

  const found = await lookup(coord.lat, coord.lng);
  // 立て続けに投げない。公共の無料サービスを使わせていただいている。
  await new Promise((r) => setTimeout(r, 350));

  if (!found) {
    problems.push(`${f.code} ${f.name}: 住所を引けませんでした`);
    continue;
  }

  const ward = WARD[found.muniCd];
  if (!ward) {
    problems.push(`${f.code} ${f.name}: 未知の市区町村コード ${found.muniCd}（${found.town}）`);
    continue;
  }

  const wasEstimated = /住所は当方推定/.test(f.note_internal ?? '');
  const changed = f.city !== ward || f.address_line !== found.town;

  const mark = f.city !== ward ? ' ★区が変わります' : '';
  console.log(
    `  ${f.code}  ${f.name}\n` +
      `        現在: ${f.city} ${f.address_line}\n` +
      `        座標から: ${ward} ${found.town}${mark}`,
  );

  if (changed) {
    changes.push({ f, ward, town: found.town, wasEstimated });
  }
}

console.log(`\n変更がある施設: ${changes.length} 件`);
if (problems.length) {
  console.log(`\n引けなかったもの: ${problems.length} 件`);
  problems.forEach((p) => console.log(`  ${p}`));
}

if (!APPLY) {
  console.log('\n確認のみで終了しました。書き込むには --apply を付けてください。');
} else {
  console.log('\n書き込みます...\n');
  let done = 0;
  for (const { f, ward, town } of changes) {
    // 「当方推定」の断りを、根拠のある記述へ置き換える
    const note = (f.note_internal ?? '')
      .replace('住所は当方推定（丁目・番地は未確認）', '住所は座標から特定（番地は未確認）')
      .trim();

    const res = await rest(`/facilities?id=eq.${f.id}`, {
      method: 'PATCH',
      body: { city: ward, address_line: town, note_internal: note },
    });
    if (res.ok) {
      done++;
      console.log(`  更新  ${f.code}  ${ward} ${town}`);
    } else {
      console.error(`  失敗  ${f.code}`);
    }
  }
  console.log(`\n${done} 件を更新しました。`);
  console.log('番地までは分からないため、最終確認はクライアント様にお願いしてください。');
}
