/**
 * 管理画面の英語欄を見る。
 *
 *   node tools/test-english-fields.mjs                       本番を検査
 *   node tools/test-english-fields.mjs http://localhost:3000 手元を検査
 *
 * 見るのは4点。
 *   1. 施設・入口・注意事項・カテゴリに英語欄があること
 *   2. 入れたものが保存されること
 *   3. 保存したものが開き直しても入っていること
 *   4. 空欄にすると null に戻ること
 *
 * 4 が要点。空文字を入れてしまうと、アプリは「訳がある」と見て
 * 空の文字列を出す。日本語へ落ちなくなり、画面が空欄になる。
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

const EMAIL = 'ui-en-fields@kurumayose.invalid';
const PASSWORD = 'Yt4bRw9kJm2vNc';

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

const touched = [];
let userId = null;
let facilityId = null;
let epId = null;
let browser = null;

try {
  console.log(`管理画面の英語欄の検査: ${BASE}\n`);

  const users = await sb('/auth/v1/admin/users?page=1&per_page=200');
  const stale = (users.body?.users ?? []).find((u) => u.email === EMAIL);
  if (stale) await sb(`/auth/v1/admin/users/${stale.id}`, { method: 'DELETE' });

  const created = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD, email_confirm: true },
  });
  userId = created.body?.id;
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: userId, display_name: '英語欄検証', role: 'admin' },
  });

  const cat = await sb('/rest/v1/categories?select=id&code=eq.hotel');
  const fac = await sb('/rest/v1/facilities', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      code: 'HTL-9830',
      name: '英語欄検証_下書き',
      name_kana: 'えいごらんけんしょう',
      category_id: cat.body?.[0]?.id,
      prefecture: '東京都',
      address_line: '英語欄1-1',
      status: 'draft',
    },
  });
  facilityId = fac.body?.[0]?.id;
  touched.push(facilityId);

  const ep = await sb('/rest/v1/entry_points', {
    method: 'POST',
    prefer: 'return=representation',
    body: { facility_id: facilityId, code: 'A', kind: 'dropoff', name: '検証用車寄せ' },
  });
  epId = ep.body?.[0]?.id;
  touched.push(epId);

  browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });
  check('管理者としてログインできる', true);

  const open = async () => {
    await page.goto(`${BASE}/facilities/${facilityId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
  };

  /*
    枠で絞る。

    施設と入口の両方に name_en があり、画面の中に同じ名前の欄が
    2つ並ぶ。名前だけで当てると、どちらを触っているのか決まらない。
    それぞれの枠にしか無い欄（name_kana / approach_text）で
    form を選び分ける。
  */
  const facilityForm = () =>
    page.locator('form').filter({ has: page.locator('[name="name_kana"]') });
  const entryForm = () =>
    page.locator('form').filter({ has: page.locator('[name="approach_text"]') }).first();

  // --- 施設 -----------------------------------------------------------------------
  console.log('\n--- 施設 ---');
  await open();
  for (const name of ['name_en', 'prefecture_en', 'city_en', 'address_line_en', 'summary_en']) {
    check(`${name} の欄がある`, (await facilityForm().locator(`[name="${name}"]`).count()) === 1);
  }

  const fill = async (name, value) => facilityForm().locator(`[name="${name}"]`).fill(value);
  await fill('name_en', 'Verification Hotel Tokyo');
  await fill('prefecture_en', 'Tokyo');
  await fill('city_en', 'Chiyoda-ku');
  await fill('address_line_en', '1-chome, Verification');
  await fill('summary_en', 'A hotel used only for verification.');
  await facilityForm().getByRole('button', { name: '変更を保存' }).click();
  await page.waitForTimeout(3000);

  const saved = (await sb(`/rest/v1/facilities?select=name_en,prefecture_en,city_en,address_line_en,summary_en&id=eq.${facilityId}`)).body?.[0] ?? {};
  check('施設の英語名が保存される', saved.name_en === 'Verification Hotel Tokyo', JSON.stringify(saved));
  check('都道府県の英語が保存される', saved.prefecture_en === 'Tokyo');
  check('市区町村の英語が保存される', saved.city_en === 'Chiyoda-ku');
  check('住所の英語が保存される', saved.address_line_en === '1-chome, Verification');
  check('概要の英語が保存される', saved.summary_en === 'A hotel used only for verification.');

  await open();
  check(
    '開き直しても入っている',
    (await facilityForm().locator('[name="name_en"]').inputValue()) ===
      'Verification Hotel Tokyo',
  );

  // --- 空欄に戻す -------------------------------------------------------------------
  await facilityForm().locator('[name="name_en"]').fill('');
  await facilityForm().getByRole('button', { name: '変更を保存' }).click();
  await page.waitForTimeout(3000);
  const cleared = (await sb(`/rest/v1/facilities?select=name_en&id=eq.${facilityId}`)).body?.[0] ?? {};
  check('空欄にすると null に戻る', cleared.name_en === null, JSON.stringify(cleared));

  // --- 入口 -----------------------------------------------------------------------
  console.log('\n--- 入口 ---');
  await open();
  for (const name of ['name_en', 'approach_text_en', 'approach_from_en']) {
    check(`入口 ${name} の欄がある`, (await entryForm().locator(`[name="${name}"]`).count()) === 1);
  }
  await entryForm().locator('[name="approach_text_en"]').fill('Go up the ramp to the drop-off.');
  await entryForm().locator('[name="name_en"]').fill('Main drop-off');
  await entryForm().getByRole('button', { name: '変更を保存' }).click();
  await page.waitForTimeout(3000);

  const epSaved = (await sb(`/rest/v1/entry_points?select=name_en,approach_text_en&id=eq.${epId}`)).body?.[0] ?? {};
  check('入口の進入方法の英語が保存される', epSaved.approach_text_en === 'Go up the ramp to the drop-off.', JSON.stringify(epSaved));
  check('入口の名称の英語が保存される', epSaved.name_en === 'Main drop-off', JSON.stringify(epSaved));

  // --- 注意事項 -----------------------------------------------------------------------
  console.log('\n--- 注意事項 ---');
  await open();
  await page.getByRole('button', { name: /注意事項を追加/ }).first().click();
  await page.waitForTimeout(600);
  const cautionForm = page.locator('form').filter({ has: page.locator('[name="body"]') }).first();
  await cautionForm.locator('[name="body"]').fill('検証用の注意事項');
  check('注意事項に英語欄がある', (await cautionForm.locator('[name="body_en"]').count()) === 1);
  await cautionForm.locator('[name="body_en"]').fill('Caution used for verification.');
  await page.getByRole('button', { name: '追加', exact: true }).first().click();
  await page.waitForTimeout(3000);

  const caSaved = (await sb(`/rest/v1/cautions?select=body,body_en&entry_point_id=eq.${epId}`)).body ?? [];
  touched.push(caSaved[0]?.id);
  check(
    '注意事項の英語が保存される',
    caSaved[0]?.body_en === 'Caution used for verification.',
    JSON.stringify(caSaved),
  );

  // --- カテゴリ -----------------------------------------------------------------------
  console.log('\n--- カテゴリ ---');
  await page.goto(`${BASE}/categories`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('tr', { hasText: 'ホテル' }).getByRole('button', { name: '編集' }).first().click();
  await page.waitForTimeout(600);
  const catRow = page.locator('tr').filter({ has: page.locator('[name="code_prefix"]') }).first();
  check('カテゴリに英語欄がある', (await catRow.locator('[name="name_en"]').count()) === 1);
  const catEn = await catRow.locator('[name="name_en"]').inputValue();
  check('カテゴリの英語が入っている', catEn === 'Hotels', catEn);
} finally {
  console.log('\n--- 後片付け ---');
  if (browser) await browser.close();
  if (facilityId) await sb(`/rest/v1/facilities?id=eq.${facilityId}`, { method: 'DELETE' });
  if (userId) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${userId}`, { method: 'DELETE' });
    const r = await sb(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
    console.log(`  ${r.ok ? '削除' : '削除失敗'}  検証用のアカウント`);
  }
  touched.push(userId);
  const purged = await purgeAuditLogs(sb, touched);
  console.log(`  削除    検証で残した操作履歴 ${purged} 件`);

  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
