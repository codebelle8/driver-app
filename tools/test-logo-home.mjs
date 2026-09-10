/**
 * ロゴを押すと探す画面へ戻ることを見る。
 *
 *   node tools/test-logo-home.mjs                        手元の書き出し
 *   node tools/test-logo-home.mjs http://localhost:4190
 *
 * **なぜ入れたか**（ご指示 2026-09-10）
 *   ロゴを押せば最初の画面へ戻る、というのは web で身についた癖で、
 *   まず試される。何も起きないと、そこで手が止まる。
 *
 * **締めているあいだは設定へ渡す**
 *   期限が切れていると探す画面へは入れない。探す画面へ渡しても
 *   門で戻されるだけで、押しても何も起きないのと変わらない。
 *
 * 狭い画面と広い画面の両方を見る。ロゴの置き場所が違う
 * （狭い＝探す画面の頭、広い＝左メニューの上）。
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:4190').replace(/\/$/, '');
const conn = connect();
const DAY = 86_400_000;

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

const setTrial = (userId, days, status = 'trial') =>
  fetch(`${conn.url}/rest/v1/driver_profiles?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: conn.svc,
    body: JSON.stringify({
      trial_ends_at: new Date(Date.now() + days * DAY).toISOString(),
      status,
    }),
  });

let browser = null;
let member = null;

try {
  console.log(`ロゴの行き先の検査: ${BASE}\n`);
  member = await createMember(conn, 'logo');
  browser = await chromium.launch();

  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const page = await ctx.newPage();
  await signInOn(page, BASE, member, { goto: '/' });

  const go = async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    await skipIntro(page);
  };

  /* ロゴは読み上げの名前で拾う。画像そのものは alt が「車寄せナビ」。 */
  const logo = () => page.getByRole('link', { name: /探す画面へ|設定へ|Go to search|Go to settings/ });

  // --- 狭い画面（探す画面の頭にある）------------------------------------------
  console.log('--- 400px ---');
  await go('/');
  check('ロゴが押せるものになっている', (await logo().count()) > 0);

  // 絞り込んでいる最中に押すと、絞り込みが解けて検索欄へ戻る
  await page.getByPlaceholder(/施設名・よみがな・住所|Name, reading or address/).first().fill('東京');
  await page.waitForTimeout(2500);
  const filtered = await page.locator('body').innerText();
  check(
    '絞り込めている',
    !filtered.includes('カテゴリから探す'),
    filtered.slice(0, 70),
  );

  await logo().first().click();
  await page.waitForTimeout(2500);
  const reset = await page.locator('body').innerText();
  check(
    'ロゴを押すと絞り込みが解ける',
    reset.includes('カテゴリから探す'),
    reset.slice(0, 70),
  );
  check('探す画面のまま', new URL(page.url()).pathname === '/', page.url());

  // 別の画面から戻れることを見る（探す画面で押しても動きが分からない）
  const fac = await (
    await fetch(`${conn.url}/rest/v1/facilities?select=id&limit=1`, { headers: conn.svc })
  ).json();
  await go(`/facility/${fac[0].id}`);
  check('施設の画面にロゴは出ない（帯には無い）', (await logo().count()) === 0);

  // --- 広い画面（左メニューの上）----------------------------------------------
  console.log('\n--- 1280px ---');
  await page.setViewportSize({ width: 1280, height: 860 });
  await go(`/facility/${fac[0].id}`);
  check('左メニューのロゴが押せる', (await logo().count()) > 0);

  await logo().first().click();
  await page.waitForTimeout(3000);
  check('探す画面へ戻る', new URL(page.url()).pathname === '/', page.url());

  await go('/mypage');
  await logo().first().click();
  await page.waitForTimeout(3000);
  check('設定からも戻れる', new URL(page.url()).pathname === '/', page.url());

  // --- 期限が切れているとき ----------------------------------------------------
  console.log('\n--- 期限が切れているとき ---');
  await setTrial(member.userId, -1);
  await go('/mypage');
  check('行き先が設定に変わる', (await logo().count()) > 0);
  check(
    '読み上げも「設定へ」になる',
    (await logo().first().getAttribute('aria-label')) === '設定へ',
    String(await logo().first().getAttribute('aria-label')),
  );

  await logo().first().click();
  await page.waitForTimeout(3000);
  check('押しても設定に留まる', page.url().includes('/mypage'), page.url());

  // --- 払ったら元に戻る --------------------------------------------------------
  console.log('\n--- お支払いのあと ---');
  await setTrial(member.userId, -1, 'active');
  await go('/mypage');
  check(
    '読み上げが「探す画面へ」に戻る',
    (await logo().first().getAttribute('aria-label')) === '探す画面へ',
    String(await logo().first().getAttribute('aria-label')),
  );
  await logo().first().click();
  await page.waitForTimeout(3000);
  check('探す画面へ戻れる', new URL(page.url()).pathname === '/', page.url());
} finally {
  console.log('\n--- 後片付け ---');
  check('検査で作った会員を消した', await removeMember(conn, member));

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
