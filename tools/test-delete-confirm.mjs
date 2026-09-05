/**
 * 管理画面の削除に、確かめが入っているかを見る。
 *
 *   node tools/test-delete-confirm.mjs                       本番を検査
 *   node tools/test-delete-confirm.mjs http://localhost:3000 手元を検査
 *
 * 見るのは2点。
 *   1. 押したとき確かめが出るか（出ないなら、取り消せない操作が素通りする）
 *   2. 「いいえ」で本当に残るか
 *
 * 「はい」で消えることも続けて確かめる。確かめを挟んだ結果、
 * 本来の削除まで止まってしまっては元も子もない。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

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

const EMAIL = 'ui-delete-check@kurumayose.invalid';
const PASSWORD = 'Rk7pWn2xCe5vQa';

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

const EP_NAME = '検証用_正面車寄せ';
const CAUTION_BODY = '検証用の注意事項。20文字を超える長さにして、末尾が省略されることも見る。';
const PHOTO_CAPTION = '検証用の写真の説明';

let userId = null;
let facilityId = null;
let browser = null;

try {
  console.log(`削除の確かめの検査: ${BASE}\n`);

  // --- 検証用の管理者と施設を作る ---------------------------------------------
  const users = await sb('/auth/v1/admin/users?page=1&per_page=200');
  const stale = (users.body?.users ?? []).find((u) => u.email === EMAIL);
  if (stale) await sb(`/auth/v1/admin/users/${stale.id}`, { method: 'DELETE' });

  const created = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD, email_confirm: true },
  });
  userId = created.body?.id;
  if (!userId) throw new Error(`アカウント作成に失敗: ${JSON.stringify(created.body)}`);

  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: userId, display_name: '削除検証用', role: 'admin' },
  });

  const cat = await sb('/rest/v1/categories?select=id&code=eq.hotel');
  const categoryId = cat.body?.[0]?.id;

  const fac = await sb('/rest/v1/facilities', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      code: 'HTL-9803',
      name: '削除検証用_下書き',
      name_kana: 'さくじょけんしょうようしたがき',
      category_id: categoryId,
      prefecture: '東京都',
      address_line: '削除検証1-1',
      status: 'draft',
    },
  });
  facilityId = fac.body?.[0]?.id;
  if (!facilityId) throw new Error(`施設作成に失敗: ${JSON.stringify(fac.body)}`);

  const ep = await sb('/rest/v1/entry_points', {
    method: 'POST',
    prefer: 'return=representation',
    body: { facility_id: facilityId, code: 'A', kind: 'dropoff', name: EP_NAME },
  });
  const epId = ep.body?.[0]?.id;
  if (!epId) throw new Error(`入口作成に失敗: ${JSON.stringify(ep.body)}`);

  const ca = await sb('/rest/v1/cautions', {
    method: 'POST',
    prefer: 'return=representation',
    body: { entry_point_id: epId, body: CAUTION_BODY },
  });
  if (!ca.body?.[0]?.id) throw new Error(`注意事項の作成に失敗: ${JSON.stringify(ca.body)}`);

  const ph = await sb('/rest/v1/photos', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      entry_point_id: epId,
      facility_id: facilityId,
      kind: 'dropoff',
      storage_path: 'verify/delete-confirm.jpg',
      caption: PHOTO_CAPTION,
    },
  });
  if (!ph.body?.[0]?.id) throw new Error(`写真の作成に失敗: ${JSON.stringify(ph.body)}`);

  // --- ログイン ---------------------------------------------------------------
  browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'ja-JP' });
  const page = await context.newPage();

  // 出た確かめを覚えておく。既定では playwright が黙って打ち消すため、
  // 受け止めないと「いいえ」を押したのと同じ扱いになる。
  let dialogs = [];
  let answer = 'dismiss';
  page.on('dialog', async (d) => {
    dialogs.push(d.message());
    if (answer === 'accept') await d.accept();
    else await d.dismiss();
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });
  check('管理者としてログインできる', true);

  const open = async () => {
    await page.goto(`${BASE}/facilities/${facilityId}`, { waitUntil: 'networkidle' });
  };

  const rows = async (table, query) =>
    (await sb(`/rest/v1/${table}?select=id&${query}`)).body ?? [];

  // --- 注意事項 ---------------------------------------------------------------
  console.log('\n--- 注意事項 ---');
  await open();
  dialogs = [];
  answer = 'dismiss';
  const cautionButton = page
    .locator('li', { hasText: CAUTION_BODY.slice(0, 12) })
    .locator('button', { hasText: /^削除$/ });
  check('注意事項の削除ボタンが出ている', (await cautionButton.count()) > 0);
  if (await cautionButton.count()) await cautionButton.first().click();
  await page.waitForTimeout(1200);

  check('注意事項の削除で確かめが出る', dialogs.length > 0, `出た確かめ: ${dialogs.length}件`);
  check(
    '確かめに本文の頭が入っている',
    dialogs.some((m) => m.includes(CAUTION_BODY.slice(0, 20))),
    dialogs.join(' / '),
  );
  check(
    '長い本文は省略されている',
    dialogs.some((m) => m.includes('…')),
    dialogs.join(' / '),
  );

  const afterNo = await rows('cautions', `body=eq.${encodeURIComponent(CAUTION_BODY)}`);
  check('「いいえ」で注意事項は残る', afterNo.length === 1, `残り${afterNo.length}件`);

  answer = 'accept';
  dialogs = [];
  await open();
  const cautionAgain = page.locator('li', { hasText: CAUTION_BODY.slice(0, 12) }).locator('button', {
    hasText: /^削除$/,
  });
  if (await cautionAgain.count()) await cautionAgain.first().click();
  await page.waitForTimeout(2500);
  const afterYes = await rows('cautions', `body=eq.${encodeURIComponent(CAUTION_BODY)}`);
  check('「はい」で注意事項は消える', afterYes.length === 0, `残り${afterYes.length}件`);

  // --- 写真 -------------------------------------------------------------------
  //
  // 画像の中身はいらない。storage に置かなくても、一覧には並び、
  // 削除ボタンは出る。ここで見たいのは押したときの動きだけ。
  console.log('\n--- 写真 ---');
  await open();
  dialogs = [];
  answer = 'dismiss';
  const photoButton = page
    .locator('li', { hasText: PHOTO_CAPTION })
    .locator('button', { hasText: /^削除$/ });
  check('写真の削除ボタンが出ている', (await photoButton.count()) > 0);
  if (await photoButton.count()) await photoButton.first().click();
  await page.waitForTimeout(1200);

  check('写真の削除で確かめが出る', dialogs.length > 0, `出た確かめ: ${dialogs.length}件`);
  check(
    '確かめに写真の説明が入っている',
    dialogs.some((m) => m.includes(PHOTO_CAPTION)),
    dialogs.join(' / '),
  );

  const photoNo = await rows('photos', `entry_point_id=eq.${epId}`);
  check('「いいえ」で写真は残る', photoNo.length === 1, `残り${photoNo.length}件`);

  answer = 'accept';
  dialogs = [];
  await open();
  const photoAgain = page
    .locator('li', { hasText: PHOTO_CAPTION })
    .locator('button', { hasText: /^削除$/ });
  if (await photoAgain.count()) await photoAgain.first().click();
  await page.waitForTimeout(2500);
  const photoYes = await rows('photos', `entry_point_id=eq.${epId}`);
  check('「はい」で写真は消える', photoYes.length === 0, `残り${photoYes.length}件`);

  // --- 入口 -------------------------------------------------------------------
  console.log('\n--- 入口・車寄せ ---');
  await open();
  dialogs = [];
  answer = 'dismiss';
  const epButton = page.getByRole('button', { name: 'この入口を削除' });
  check('入口の削除ボタンが出ている', (await epButton.count()) > 0);
  if (await epButton.count()) await epButton.first().click();
  await page.waitForTimeout(1200);

  check('入口の削除で確かめが出る', dialogs.length > 0, `出た確かめ: ${dialogs.length}件`);
  check(
    '確かめに入口の名前が入っている',
    dialogs.some((m) => m.includes(EP_NAME)),
    dialogs.join(' / '),
  );

  const epNo = await rows('entry_points', `facility_id=eq.${facilityId}`);
  check('「いいえ」で入口は残る', epNo.length === 1, `残り${epNo.length}件`);

  answer = 'accept';
  dialogs = [];
  await open();
  const epAgain = page.getByRole('button', { name: 'この入口を削除' });
  if (await epAgain.count()) await epAgain.first().click();
  await page.waitForTimeout(2500);
  const epYes = await rows('entry_points', `facility_id=eq.${facilityId}`);
  check('「はい」で入口は消える', epYes.length === 0, `残り${epYes.length}件`);
} finally {
  console.log('\n--- 後片付け ---');
  if (browser) await browser.close();

  if (facilityId) {
    const r = await sb(`/rest/v1/facilities?id=eq.${facilityId}`, { method: 'DELETE' });
    console.log(`  ${r.ok ? '削除' : '削除失敗'}  検証用の施設`);
  }
  if (userId) {
    await sb(`/rest/v1/audit_logs?actor_id=eq.${userId}`, { method: 'DELETE' });
    await sb(`/rest/v1/admin_profiles?user_id=eq.${userId}`, { method: 'DELETE' });
    const r = await sb(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
    console.log(`  ${r.ok ? '削除' : '削除失敗'}  検証用のアカウント`);
  }

  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
