/**
 * 管理画面の施設削除を見る。
 *
 *   node tools/test-facility-delete.mjs                       本番を検査
 *   node tools/test-facility-delete.mjs http://localhost:3000 手元を検査
 *
 * 見るのは6点。
 *   1. 管理者には削除の場所が出て、調査員には出ないこと
 *   2. 押すと画面の中の札で尋ねること（ブラウザの confirm ではない）
 *   3. 「キャンセル」で残ること
 *   4. 「削除」で施設が消えること
 *   5. 入口・注意事項・写真も一緒に消えること
 *   6. 写真の実体が保存領域からも消えること
 *
 * 6 が要点。行だけ消してファイルを残すと、参照されないものが
 * 際限なく積み上がる。150施設ぶんでは容量に直結する。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';

const BASE = (process.argv[2] ?? 'https://kurumayose-navi-admin.vercel.app').replace(/\/$/, '');

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv('admin/.env.local');
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'facility-photos';

const ADMIN_EMAIL = 'ui-facdel-admin@kurumayose.invalid';
const SURVEYOR_EMAIL = 'ui-facdel-surveyor@kurumayose.invalid';
const PASSWORD = 'Wq6tZn3xBv8kMr';

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

/** 保存領域へ小さなファイルを置く */
async function putFile(path) {
  const res = await fetch(`${SB}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/webp' },
    body: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]),
  });
  return res.ok;
}

/** そのファイルがまだ在るか */
async function fileExists(path) {
  const res = await fetch(`${SB}/storage/v1/object/${BUCKET}/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  return res.ok;
}

const FACILITY_NAME = '施設削除検証_下書き';
const touched = [];
let adminId = null;
let surveyorId = null;
let facilityId = null;
let browser = null;

/*
  一覧版は photos/ ではなく thumbs/ に置かれる（lib/photos.ts の
  thumbPathOf）。同じ階層に _thumb を付ける形だと思い込んで書いたら、
  「消えていない」と誤って報告した。
*/
const DETAIL = 'photos/DEL-9999/dropoff_verify.webp';
const THUMB = 'thumbs/DEL-9999/dropoff_verify.webp';

try {
  console.log(`施設削除の検査: ${BASE}\n`);

  const users = await sb('/auth/v1/admin/users?page=1&per_page=200');
  for (const email of [ADMIN_EMAIL, SURVEYOR_EMAIL]) {
    const stale = (users.body?.users ?? []).find((u) => u.email === email);
    if (stale) await sb(`/auth/v1/admin/users/${stale.id}`, { method: 'DELETE' });
  }

  const mkUser = async (email, role, name) => {
    const r = await sb('/auth/v1/admin/users', {
      method: 'POST',
      body: { email, password: PASSWORD, email_confirm: true },
    });
    const uid = r.body?.id;
    if (!uid) throw new Error(`アカウント作成に失敗: ${JSON.stringify(r.body)}`);
    await sb('/rest/v1/admin_profiles', {
      method: 'POST',
      body: { user_id: uid, display_name: name, role },
    });
    return uid;
  };

  adminId = await mkUser(ADMIN_EMAIL, 'admin', '施設削除検証_管理者');
  surveyorId = await mkUser(SURVEYOR_EMAIL, 'surveyor', '施設削除検証_調査員');

  const cat = await sb('/rest/v1/categories?select=id&code=eq.hotel');
  const fac = await sb('/rest/v1/facilities', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      code: 'HTL-9820',
      name: FACILITY_NAME,
      name_kana: 'しせつさくじょけんしょう',
      category_id: cat.body?.[0]?.id,
      prefecture: '東京都',
      address_line: '削除検証9-9',
      status: 'draft',
    },
  });
  facilityId = fac.body?.[0]?.id;
  touched.push(facilityId);
  if (!facilityId) throw new Error(`施設作成に失敗: ${JSON.stringify(fac.body)}`);

  const ep = await sb('/rest/v1/entry_points', {
    method: 'POST',
    prefer: 'return=representation',
    body: { facility_id: facilityId, code: 'A', kind: 'dropoff', name: '検証用車寄せ' },
  });
  const epId = ep.body?.[0]?.id;
  touched.push(epId);

  const ca = await sb('/rest/v1/cautions', {
    method: 'POST',
    prefer: 'return=representation',
    body: { entry_point_id: epId, body: '施設削除の検証用' },
  });
  touched.push(ca.body?.[0]?.id);

  check('保存領域へ写真を置ける', (await putFile(DETAIL)) && (await putFile(THUMB)));
  const ph = await sb('/rest/v1/photos', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      entry_point_id: epId,
      facility_id: facilityId,
      kind: 'dropoff',
      storage_path: DETAIL,
      caption: '施設削除の検証用',
    },
  });
  touched.push(ph.body?.[0]?.id);

  browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  let nativeDialogs = [];
  page.on('dialog', async (d) => {
    nativeDialogs.push(`${d.type()}: ${d.message()}`);
    await d.dismiss();
  });

  const login = async (email) => {
    await context.clearCookies();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });
  };

  // --- 調査員には出ない -----------------------------------------------------------
  console.log('\n--- 調査員 ---');
  await login(SURVEYOR_EMAIL);
  await page.goto(`${BASE}/facilities/${facilityId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check(
    '調査員には削除ボタンが出ない',
    (await page.getByRole('button', { name: '施設を削除する' }).count()) === 0,
  );

  // --- 管理者 ---------------------------------------------------------------------
  console.log('\n--- 管理者 ---');
  await login(ADMIN_EMAIL);
  await page.goto(`${BASE}/facilities/${facilityId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  nativeDialogs = [];

  const button = page.getByRole('button', { name: '施設を削除する' });
  check('管理者には削除ボタンが出る', (await button.count()) === 1, `${await button.count()}個`);
  if ((await button.count()) !== 1) throw new Error('削除ボタンが無いため中止');

  await button.click();
  await page.waitForTimeout(800);

  const card = page.getByTestId('confirm-card');
  check('ブラウザの confirm を使っていない', nativeDialogs.length === 0, nativeDialogs.join(' / '));
  check('画面の中に札が出る', (await card.count()) === 1);
  const text = (await card.count()) ? await card.innerText() : '';
  check('何が消えるか書かれている', text.includes(FACILITY_NAME), text);
  check('入口・注意事項・写真も消えると書かれている', text.includes('写真'), text);

  await page.getByTestId('confirm-cancel').click();
  await page.waitForTimeout(700);
  const stillThere = (await sb(`/rest/v1/facilities?select=id&id=eq.${facilityId}`)).body ?? [];
  check('「キャンセル」で施設は残る', stillThere.length === 1);

  await page.getByRole('button', { name: '施設を削除する' }).click();
  await page.waitForTimeout(600);
  await page.getByTestId('confirm-accept').click();
  await page.waitForTimeout(4000);

  const gone = (await sb(`/rest/v1/facilities?select=id&id=eq.${facilityId}`)).body ?? [];
  check('「削除」で施設が消える', gone.length === 0, `残り${gone.length}件`);

  const epLeft = (await sb(`/rest/v1/entry_points?select=id&facility_id=eq.${facilityId}`)).body ?? [];
  check('入口も一緒に消える', epLeft.length === 0, `残り${epLeft.length}件`);

  const caLeft = (await sb(`/rest/v1/cautions?select=id&entry_point_id=eq.${epId}`)).body ?? [];
  check('注意事項も一緒に消える', caLeft.length === 0, `残り${caLeft.length}件`);

  const phLeft = (await sb(`/rest/v1/photos?select=id&storage_path=eq.${encodeURIComponent(DETAIL)}`)).body ?? [];
  check('写真の行も一緒に消える', phLeft.length === 0, `残り${phLeft.length}件`);

  check('写真の実体も消える', !(await fileExists(DETAIL)), '本体が残っている');
  check('一覧版の実体も消える', !(await fileExists(THUMB)), '一覧版が残っている');

  check('一覧へ戻る', page.url().includes('/facilities'), page.url());
} finally {
  console.log('\n--- 後片付け ---');
  if (browser) await browser.close();

  if (facilityId) await sb(`/rest/v1/facilities?id=eq.${facilityId}`, { method: 'DELETE' });
  await fetch(`${SB}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [DETAIL, THUMB] }),
  }).catch(() => {});

  for (const [label, id] of [
    ['管理者', adminId],
    ['調査員', surveyorId],
  ]) {
    if (!id) continue;
    await sb(`/rest/v1/admin_profiles?user_id=eq.${id}`, { method: 'DELETE' });
    const r = await sb(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
    console.log(`  ${r.ok ? '削除' : '削除失敗'}  検証用の${label}`);
  }

  touched.push(adminId, surveyorId);
  const purged = await purgeAuditLogs(sb, touched);
  console.log(`  削除    検証で残した操作履歴 ${purged} 件`);

  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
