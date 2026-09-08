/**
 * お気に入りと閲覧履歴が、端末を替えても引き継げるかを見る。
 *
 *   node tools/test-carry-over.mjs                        手元の書き出し (4173)
 *   node tools/test-carry-over.mjs http://localhost:4180
 *
 * **なぜ要るか**
 *   マイページに「登録すると、機種変更しても引き継げます」と出している。
 *   これが本当かどうかは、実際に**別の入れ物**（localStorage を共有しない
 *   ブラウザ）で開いて確かめるしかない。同じ画面で読み直しても、
 *   端末の中に残っているものが出るだけで、何も確かめたことにならない。
 *
 * 見るのは6点。
 *   1. 端末Aで留めると、サーバーにも入ること
 *   2. 施設を開くと、履歴がサーバーにも入ること
 *   3. 端末B（空の入れ物）でログインすると、両方が出ること
 *   4. 端末Bで外すと、サーバーからも消えること
 *   5. ログインしていない人のぶんは、外へ出ないこと
 *   6. 後片付け（検査で作った会員を消す）
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');

const env = (p) => {
  const o = {};
  for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return o;
};
const appEnv = env('app/.env.local');
const adminEnv = env('admin/.env.local');
const URL_ = appEnv.EXPO_PUBLIC_SUPABASE_URL;
const ANON = appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = adminEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) throw new Error('接続先または鍵がありません');

const svc = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
};

const EMAIL = `kn-carry-${Date.now()}@example.com`;
const PASSWORD = 'kn-carry-password-2026';

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label} ${detail}`);
  }
};

const rowsOf = async (table, userId) => {
  const r = await fetch(`${URL_}/rest/v1/${table}?user_id=eq.${userId}&select=facility_id`, {
    headers: svc,
  });
  const j = await r.json();
  return Array.isArray(j) ? j.map((x) => x.facility_id) : [];
};

let browser = null;
let userId = null;

try {
  console.log(`引き継ぎの検査: ${BASE}\n`);

  const made = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svc,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  userId = (await made.json()).id ?? null;
  check('検査用の会員を作れた', !!userId);
  if (!userId) throw new Error('会員を作れないため中止');

  browser = await chromium.launch();

  /** 1台ぶんの入れ物を開き、ログインする */
  const openDevice = async (label) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    const skip = page.getByRole('button', { name: /導入を飛ばす/ });
    if (await skip.count()) await skip.first().click().catch(() => {});
    await page.waitForTimeout(800);

    await page.getByLabel('メールアドレス').fill(EMAIL);
    await page.getByLabel('パスワード', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'ログイン' }).last().click();
    await page.waitForTimeout(5000);
    console.log(`  （${label} でログイン）`);
    return page;
  };

  // --- 端末A -----------------------------------------------------------------
  console.log('--- 端末A ---');
  const a = await openDevice('端末A');

  const ids = await a.evaluate(() => {
    const cat = JSON.parse(localStorage.getItem('kn_catalog') ?? '{}');
    return (cat.facilities ?? []).slice(0, 2).map((f) => f.id);
  });
  check('施設の取り込みが済んでいる', ids.length === 2, `${ids.length} 件`);

  for (const id of ids) {
    await a.goto(`${BASE}/facility/${id}`, { waitUntil: 'networkidle' });
    await a.waitForTimeout(3000);
    const save = a.getByRole('button', { name: /^(保存|お気に入りに入れる)$/ });
    if (await save.count()) await save.first().click();
    await a.waitForTimeout(1500);
  }
  await a.waitForTimeout(2500);

  const favA = await rowsOf('driver_favorites', userId);
  const hisA = await rowsOf('driver_history', userId);
  check('留めたものがサーバーに入る', favA.length === 2, `${favA.length} 件`);
  check('開いた施設が履歴としてサーバーに入る', hisA.length === 2, `${hisA.length} 件`);

  // --- 端末B（空の入れ物）----------------------------------------------------
  console.log('\n--- 端末B（別の入れ物）---');
  const b = await openDevice('端末B');

  // 突き合わせが終わるのを待つ
  await b.waitForTimeout(4000);

  await b.goto(`${BASE}/favorites`, { waitUntil: 'networkidle' });
  await b.waitForTimeout(3500);
  const favText = await b.locator('body').innerText();
  check(
    '端末Bでもお気に入りが出る',
    !favText.includes('まだ登録がありません'),
    favText.slice(0, 90).replace(/\n/g, ' / '),
  );

  await b.goto(`${BASE}/history`, { waitUntil: 'networkidle' });
  await b.waitForTimeout(3500);
  const hisText = await b.locator('body').innerText();
  check(
    '端末Bでも履歴が出る',
    !hisText.includes('まだ履歴がありません'),
    hisText.slice(0, 90).replace(/\n/g, ' / '),
  );

  // --- 端末Bで外す -----------------------------------------------------------
  console.log('\n--- 端末Bで外す ---');
  await b.goto(`${BASE}/facility/${ids[0]}`, { waitUntil: 'networkidle' });
  await b.waitForTimeout(3000);
  const unpin = b.getByRole('button', { name: /^(保存済み|お気に入りから外す)$/ });
  if (await unpin.count()) {
    await unpin.first().click();
    await b.waitForTimeout(3000);
    const favAfter = await rowsOf('driver_favorites', userId);
    check('端末Bで外すとサーバーからも消える', favAfter.length === 1, `${favAfter.length} 件`);
  } else {
    check('外す釦がある', false, '見つからない');
  }

  // --- ログインしていない人 ---------------------------------------------------
  console.log('\n--- ログインしていない人 ---');
  const guest = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await guest.goto(`${BASE}/facility/${ids[1]}`, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(4000);
  const sk = guest.getByRole('button', { name: /導入を飛ばす/ });
  if (await sk.count()) await sk.first().click().catch(() => {});
  await guest.waitForTimeout(1500);
  const gSave = guest.getByRole('button', { name: /^(保存|お気に入りに入れる)$/ });
  if (await gSave.count()) await gSave.first().click();
  await guest.waitForTimeout(2500);

  const local = await guest.evaluate(() => (localStorage.getItem('kn_favorites') ?? '').length);
  check('登録していなくても端末の中には残る', local > 2, `${local} 文字`);

  const favGuest = await rowsOf('driver_favorites', userId);
  check(
    '登録していない人のぶんは外へ出ない',
    favGuest.length === 1,
    `${favGuest.length} 件（増えていたら漏れている）`,
  );
  await guest.close();
} finally {
  console.log('\n--- 後片付け ---');
  if (userId) {
    await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svc });
    const r = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: svc });
    const j = await r.json();
    check('検査で作った会員を消した', !(j.users ?? []).some((u) => u.email === EMAIL));
    check('預かった分も一緒に消えた', (await rowsOf('driver_favorites', userId)).length === 0);
  }

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
