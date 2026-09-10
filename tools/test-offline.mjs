/**
 * 電波が届かないところで、まだ使えるかを見る。
 *
 *   node tools/test-offline.mjs                        手元の書き出し
 *   node tools/test-offline.mjs http://localhost:4190
 *
 * **なぜ要るか**
 *   このアプリの一番の売りが「地下駐車場でも出る」ことにある。
 *   ところが会員の仕組みを重ねたあと、一度も確かめていなかった。
 *
 *   ログインの確認は通信を使う。**繋がらないときに「ログインして
 *   いない」と判断すると、地下へ入った瞬間に入口へ戻される。**
 *   そこでは電波が無いのでログインもできない。仕事が止まる。
 *
 * **2つの場面を分けて見る**
 *   1. 開いたまま圏外へ入る（走行中に地下へ降りる。こちらが本番）
 *   2. 圏外で開き直す（アプリを閉じてしまった、端末を再起動した）
 *
 *   2 は Service Worker が土台を控えていないと成り立たない。
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

let browser = null;
let member = null;

try {
  console.log(`圏外での動きの検査: ${BASE}\n`);
  member = await createMember(conn, 'offline');
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const page = await ctx.newPage();

  // --- まず繋がるところで、一通り取り込ませる ---------------------------------
  console.log('--- 電波のあるところで ---');
  await signInOn(page, BASE, member, { goto: '/' });
  await page.waitForTimeout(6000);
  await skipIntro(page);

  let text = await page.locator('body').innerText();
  check('施設が出ている', /193/.test(text), text.slice(0, 90));

  // 1件開いて、履歴にも入れておく
  const first = page.getByRole('link').filter({ hasText: /ホテル|Hotel|東京/ }).first();
  const fac = await (
    await fetch(`${conn.url}/rest/v1/facilities?select=id,name&limit=1`, { headers: conn.svc })
  ).json();
  await page.goto(`${BASE}/facility/${fac[0].id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await skipIntro(page);
  check('施設の詳細が出る', (await page.locator('body').innerText()).includes(fac[0].name));

  // --- 開いたまま圏外へ（本番の場面）-----------------------------------------
  console.log('\n--- 開いたまま圏外へ ---');
  await ctx.setOffline(true);
  await page.waitForTimeout(1500);

  // アプリの中を歩く。通信は起きない想定。
  await page.getByRole('link', { name: /探す画面へ|設定へ/ }).first().click();
  await page.waitForTimeout(4000);
  text = await page.locator('body').innerText();

  check('入口へ戻されない', !text.includes('ようこそ'), text.slice(0, 100));
  check('探す画面が出る', text.includes('行きたい場所を見つけよう'), text.slice(0, 100));
  check('施設の件数が出ている', /193/.test(text), text.slice(0, 120));

  // 圏外のまま施設を開けるか
  await page.getByRole('link').filter({ hasText: fac[0].name }).first().click().catch(async () => {
    // 一覧に出ていなければ、検索してから開く
    await page.getByPlaceholder(/施設名・よみがな・住所|Name, reading/).first().fill(fac[0].name);
    await page.waitForTimeout(2000);
    await page.getByRole('link').filter({ hasText: fac[0].name }).first().click();
  });
  await page.waitForTimeout(3500);
  text = await page.locator('body').innerText();
  check('圏外でも施設の詳細が開ける', text.includes(fac[0].name), text.slice(0, 120));
  check('車寄せの案内が出る', /車寄せ|入口|Entrance/.test(text), text.slice(0, 200));

  // 設定も開けるか（ログインの確認が走る画面）
  await page.goto(`${BASE}/mypage`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(5000);
  text = await page.locator('body').innerText();
  check('圏外でも設定が開ける', text.includes('マイページ') || text.includes('Settings'), text.slice(0, 120));

  // --- 圏外で開き直す（アプリを閉じてしまった場合）----------------------------
  console.log('\n--- 圏外で開き直す ---');
  const reloaded = await page
    .reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(6000);
  text = await page.locator('body').innerText().catch(() => '');

  check('開き直せる（土台が控えられている）', reloaded, '読み込めなかった');
  check('開き直しても入口へ戻されない', reloaded && !text.includes('ようこそ'), text.slice(0, 100));

  // --- 電波が戻ったら ---------------------------------------------------------
  console.log('\n--- 電波が戻ったら ---');
  await ctx.setOffline(false);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await skipIntro(page);
  text = await page.locator('body').innerText();
  check('元どおり使える', /193/.test(text) && !text.includes('ようこそ'), text.slice(0, 100));

  // --- ログアウトした後は、圏外でも入れない -----------------------------------
  console.log(`
--- ログアウトした後 ---`);
  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await skipIntro(page);
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByTestId('confirm-accept').click();
  await page.waitForTimeout(5000);

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(6000);
  const after = await page.locator('body').innerText().catch(() => '');
  check(
    '圏外でも、ログアウトした後は入れない',
    after.includes('ようこそ') || after.includes('ログイン'),
    after.slice(0, 100),
  );
  check('中身は出さない', !/193/.test(after), after.slice(0, 100));
  await ctx.setOffline(false);
} finally {
  console.log('\n--- 後片付け ---');
  check('検査で作った会員を消した', await removeMember(conn, member));

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
