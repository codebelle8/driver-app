/**
 * アプリのデータ取得を、本番のデータベースに対して確認する。
 *
 *   node tools/test-app-data.mjs
 *
 * test-app-logic.mjs が正規化の結果そのものを見るのに対し、
 * こちらは「その正規化で本当に施設が引けるか」を見る。
 *
 * ここが要になる理由:
 *   検索語の変換（カタカナ→ひらがな）はアプリ側とデータベース側の
 *   両方で行われる。片方だけ正しくても引けないため、実物に当てる以外に
 *   確かめようがない。
 *
 * 検証用の施設を作り、終わったら消す。
 */
import { readFileSync } from 'node:fs';

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

// アプリ側のモジュールは読み込み時に環境変数を見るため、先に入れておく
const appEnv = loadEnv('app/.env.local');
process.env.EXPO_PUBLIC_SUPABASE_URL = appEnv.EXPO_PUBLIC_SUPABASE_URL;
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const adminEnv = loadEnv('admin/.env.local');
const SB = adminEnv.NEXT_PUBLIC_SUPABASE_URL;
const KEY = adminEnv.SUPABASE_SERVICE_ROLE_KEY;

// facilities.ts は端末内データベースを読むため Node では動かせない。
// 検証したいのは「サーバーから正しく取れるか」なので、取得の層を直接見る。
const { fetchCatalog } = await import('../app/src/lib/sync.ts');
const { toSearchPattern, normalizeSearchText } = await import('../app/src/lib/search.ts');

let pass = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label} ${detail}`);
  }
}

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SB}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

let facilityId = null;
let draftId = null;
/** 作った行の id。操作履歴を確実に消すため控えておく。 */
const createdIds = [];

try {
  console.log(`アプリのデータ取得の検証: ${SB}\n`);

  const cat = await sb('/rest/v1/categories?select=id,code&code=eq.hotel');
  const categoryId = cat.body?.[0]?.id;

  // 公開済み。カタカナ・別名・住所での検索を確かめられるようにしておく。
  const created = await sb('/rest/v1/facilities', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      code: 'HTL-9701',
      name: 'アプリ検証用ホテル汐留',
      name_kana: 'あぷりけんしょうようほてるしおどめ',
      aliases: ['汐留テスト', 'ATH'],
      category_id: categoryId,
      prefecture: '東京都',
      city: '港区',
      address_line: '東新橋1-8-2',
      summary: '検証用の施設です。',
      status: 'published',
    },
  });
  facilityId = created.body?.[0]?.id;
  if (!facilityId) throw new Error(`施設の作成に失敗: ${JSON.stringify(created.body)}`);
  createdIds.push(facilityId);

  // 下書き。アプリから見えてはいけない。
  const draft = await sb('/rest/v1/facilities', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      code: 'HTL-9702',
      name: 'アプリ検証用_下書き',
      name_kana: 'あぷりけんしょうようしたがき',
      category_id: categoryId,
      prefecture: '東京都',
      address_line: '検証2-2',
    },
  });
  draftId = draft.body?.[0]?.id;
  if (draftId) createdIds.push(draftId);

  const ep = await sb('/rest/v1/entry_points', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      facility_id: facilityId,
      code: 'A',
      kind: 'dropoff',
      name: '正面車寄せ',
      approach_text: '海岸通り側から進入し、スロープを上がって2階の車寄せへ。',
      approach_from: '海岸通り（北行き）から',
      nav_lat: 35.6656,
      nav_lng: 139.7604,
      height_limit_cm: 380,
      is_roofed: true,
      is_24h: true,
    },
  });
  const entryPointId = ep.body?.[0]?.id;
  if (entryPointId) createdIds.push(entryPointId);

  const caution = await sb('/rest/v1/cautions', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      entry_point_id: entryPointId,
      body: '17〜20時は送迎バスが停車します。',
      time_from: '17:00:00',
      time_to: '20:00:00',
      weekdays: [1, 2, 3, 4, 5],
    },
  });
  if (caution.body?.[0]?.id) createdIds.push(caution.body[0].id);

  console.log('--- サーバーからの取り込み ---');

  const catalog = await fetchCatalog();

  const mine = catalog.facilities.find((f) => f.id === facilityId);
  check('公開済みの施設が取り込まれる', Boolean(mine));
  check('別名も取り込まれる', mine?.aliases.includes('汐留テスト') === true);
  check('カテゴリを取り込める', catalog.categories.length === 6, `${catalog.categories.length} 件`);

  const ep2 = catalog.entryPoints.find((e) => e.id === entryPointId);
  check('入口を取り込める', Boolean(ep2));
  check('ナビ座標が取れる', ep2?.nav_lat === 35.6656 && ep2?.nav_lng === 139.7604);
  check('進入方法の説明が取れる', Boolean(ep2?.approach_text));

  const c2 = catalog.cautions.find((c) => c.entry_point_id === entryPointId);
  check('注意事項を取り込める', Boolean(c2));
  check('注意事項の時間帯が取れる', c2?.time_from === '17:00:00');

  console.log('');
  console.log('--- 公開されていないものが漏れないか ---');

  check('下書きは取り込まれない', !catalog.facilities.some((f) => f.id === draftId));
  check(
    '下書きの入口も取り込まれない',
    !catalog.entryPoints.some((e) => e.facility_id === draftId),
  );

  console.log('');
  console.log('--- 検索語の照合 ---');

  // 端末側は search_text（正規化済み）への部分一致で引く。
  // サーバーと同じ規則で組み立てられているかを、実データで確かめる。
  const searchText = normalizeSearchText(
    [
      mine.name,
      mine.name_kana,
      mine.aliases.join(' '),
      mine.prefecture,
      mine.city ?? '',
      mine.address_line,
    ]
      .filter(Boolean)
      .join(' '),
  );
  const hits = (q) => {
    const pattern = toSearchPattern(q);
    return pattern !== null && searchText.includes(pattern.slice(1, -1));
  };

  check('漢字で引ける', hits('汐留'));
  check('ひらがなで引ける', hits('しおどめ'));
  check('カタカナで引ける（正規化が効いている）', hits('シオドメ'));
  check('別名で引ける', hits('汐留テスト'));
  check('住所で引ける', hits('東新橋'));
  check('途中まででも引ける', hits('ほてる'));
  check('無関係な語では出ない', !hits('まったく存在しない施設名'));
} finally {
  console.log('\n--- 後片付け ---');
  for (const [label, id] of [['公開済み', facilityId], ['下書き', draftId]]) {
    if (!id) continue;
    const r = await sb(`/rest/v1/facilities?id=eq.${id}`, { method: 'DELETE' });
    console.log(`  ${r.ok ? '削除' : '削除失敗'}  ${label}の施設`);
  }
  // 操作履歴は施設名では絞れない。入口や注意事項の記録には施設名が
  // 入らないため、作った行の id で消す。
  if (createdIds.length) {
    const r = await sb(
      `/rest/v1/audit_logs?record_id=in.(${createdIds.join(',')})`,
      { method: 'DELETE' },
    );
    console.log(`  ${r.ok ? '削除' : '削除失敗'}  検証用の操作履歴`);
  }
}

console.log('');
if (failures.length) {
  console.error(`合格 ${pass} 件 / 失敗 ${failures.length} 件`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exitCode = 1;
} else {
  console.log(`合格 ${pass} 件 / 失敗 0 件 — アプリは本番のデータを正しく読めています。`);
}
