/**
 * 退会したあと、きれいに消えているかを見る。
 *
 *   node tools/test-leave.mjs                        手元の書き出し
 *   node tools/test-leave.mjs http://localhost:4190
 *
 * **なぜ要るか**
 *   退会そのもの（アカウントと顔写真が消えること）は
 *   `test-login.mjs` で見ている。こちらは**後始末**を見る。
 *
 *     * お気に入り・閲覧履歴が残ると、個人の行き先が残り続ける
 *     * 名簿の行が残ると、**同じアドレスで登録し直せなくなる**
 *       （名簿は利用者ごとに1行と決めてある）
 *     * 端末の控えが残ると、圏外で開き直したときに入れてしまう
 *
 *   どれも「消えたように見えて消えていない」形で起きる。
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:4190').replace(/\/$/, '');
const conn = connect();

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

const rows = async (table, userId) => {
  const r = await fetch(`${conn.url}/rest/v1/${table}?user_id=eq.${userId}&select=user_id`, {
    headers: conn.svc,
  });
  const j = await r.json();
  return Array.isArray(j) ? j.length : -1;
};

const userExists = async (email) => {
  const r = await fetch(`${conn.url}/auth/v1/admin/users?per_page=200`, { headers: conn.svc });
  const j = await r.json();
  return (j.users ?? []).some((u) => u.email === email);
};

let browser = null;
let member = null;
let again = null;

try {
  console.log(`退会の後始末の検査: ${BASE}\n`);
  member = await createMember(conn, 'leave');

  // --- 消えるべきものを置いておく ----------------------------------------------
  console.log('--- 置いておく ---');
  const fac = await (
    await fetch(`${conn.url}/rest/v1/facilities?select=id&limit=2`, { headers: conn.svc })
  ).json();

  await fetch(`${conn.url}/rest/v1/driver_profiles`, {
    method: 'POST',
    headers: conn.svc,
    body: JSON.stringify({ user_id: member.userId, trial_ends_at: new Date(Date.now() + 86400000 * 30).toISOString() }),
  });
  await fetch(`${conn.url}/rest/v1/driver_favorites`, {
    method: 'POST',
    headers: conn.svc,
    body: JSON.stringify({ user_id: member.userId, facility_id: fac[0].id }),
  });
  await fetch(`${conn.url}/rest/v1/driver_history`, {
    method: 'POST',
    headers: conn.svc,
    body: JSON.stringify({ user_id: member.userId, facility_id: fac[1].id }),
  });

  check('名簿の行がある', (await rows('driver_profiles', member.userId)) === 1);
  check('お気に入りがある', (await rows('driver_favorites', member.userId)) === 1);
  check('閲覧履歴がある', (await rows('driver_history', member.userId)) === 1);

  // --- 退会する -----------------------------------------------------------------
  console.log('\n--- 退会する ---');
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  const page = await ctx.newPage();
  await signInOn(page, BASE, member, { goto: '/account' });
  await page.waitForTimeout(3000);
  await skipIntro(page);

  const leave = page.getByRole('button', { name: '退会する' }).first();
  check('退会の入口がある', (await leave.count()) === 1);
  await leave.click();
  await page.waitForTimeout(900);
  await page.getByTestId('confirm-accept').click();
  await page.waitForTimeout(8000);

  const text = await page.locator('body').innerText();
  check(
    '入口へ戻る',
    text.includes('ようこそ') || text.includes('ご登録のメールアドレスでログイン'),
    text.slice(0, 120),
  );

  // --- 消えているか -------------------------------------------------------------
  console.log('\n--- 消えているか ---');
  check('アカウントが消えた', !(await userExists(member.email)));
  check('名簿の行が消えた', (await rows('driver_profiles', member.userId)) === 0);
  check('お気に入りが消えた', (await rows('driver_favorites', member.userId)) === 0, '行き先が残る');
  check('閲覧履歴が消えた', (await rows('driver_history', member.userId)) === 0, '行き先が残る');

  // --- 圏外で開き直しても入れないこと -------------------------------------------
  console.log('\n--- 圏外で開き直しても ---');
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(6000);
  const off = await page.locator('body').innerText().catch(() => '');
  check(
    '圏外でも入れない（控えも捨てている）',
    !off.includes('カテゴリから探す') && !off.includes('行きたい場所を見つけよう'),
    off.slice(0, 120),
  );
  await ctx.setOffline(false);

  // --- 同じアドレスで登録し直せること -------------------------------------------
  console.log('\n--- 同じアドレスで入り直す ---');
  const made = await fetch(`${conn.url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: conn.svc,
    body: JSON.stringify({ email: member.email, password: member.password, email_confirm: true }),
  });
  const body = await made.json();
  again = body.id ? { userId: body.id, email: member.email, password: member.password } : null;
  check('同じアドレスで作り直せる', !!again, JSON.stringify(body).slice(0, 140));

  if (again) {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(6000);
    await skipIntro(page);
    await page.getByLabel(/メールアドレス|Email/).fill(again.email);
    await page.getByLabel(/^(パスワード|Password)$/).fill(again.password);
    await page.getByRole('button', { name: /^(ログイン|Sign in)$/ }).last().click();
    await page.waitForTimeout(8000);
    await skipIntro(page);
    const back = await page.locator('body').innerText();
    check('入り直せる', back.includes('カテゴリから探す') || back.includes('行きたい場所'), back.slice(0, 120));
    check('新しい無料期間が始まる', (await rows('driver_profiles', again.userId)) === 1);
    check('前のお気に入りは付いてこない', (await rows('driver_favorites', again.userId)) === 0);
  }
} finally {
  console.log('\n--- 後片付け ---');
  if (again) await removeMember(conn, again);
  check('検査で作った会員が残っていない', !(await userExists(member.email)));

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
