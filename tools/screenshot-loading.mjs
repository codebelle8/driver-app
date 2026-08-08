/**
 * 読み込み中のハンドル演出を撮影する。
 *
 *   node tools/screenshot-loading.mjs
 *
 * loading.tsx はページのデータ取得中しか表示されないため、
 * 遷移先のリクエストをわざと遅延させて、その瞬間を捉える。
 */
import { mkdirSync, readFileSync } from 'node:fs';

import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const OUT = 'tools/screenshots';
mkdirSync(OUT, { recursive: true });

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
void loadEnv('admin/.env.local');

const email = process.env.KN_EMAIL;
const password = process.env.KN_PASSWORD;

const browser = await chromium.launch();

// --- ログイン ---------------------------------------------------------------
const auth = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const loginPage = await auth.newPage();
await loginPage.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await loginPage.fill('input[name="email"]', email);
await loginPage.fill('input[name="password"]', password);
await loginPage.click('button[type="submit"]');
await loginPage.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
const cookies = (await auth.cookies()).filter((c) => c.name.startsWith('sb-'));
await auth.close();

for (const theme of ['dark', 'light']) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'ja-JP',
  });
  await context.addCookies([
    ...cookies,
    { name: 'kn_locale', value: 'ja', domain: 'localhost', path: '/' },
    { name: 'kn_theme', value: theme, domain: 'localhost', path: '/' },
  ]);

  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  // /facilities へのリクエストを遅らせ、loading.tsx が出ている状態を作る
  await page.route('**/facilities**', async (route) => {
    await new Promise((r) => setTimeout(r, 6000));
    await route.continue();
  });

  await page.getByRole('link', { name: '施設一覧' }).click();

  // 回転していることを確かめるため、切れ角の異なる3枚を撮る
  // （アニメーション周期 3.6s に対して 0.4s / 1.4s / 2.6s 時点）
  const frames = [400, 1000, 1200];
  for (let i = 0; i < frames.length; i++) {
    await page.waitForTimeout(frames[i]);
    const name = `08-loading-steering-${theme}-${i + 1}.png`;
    await page.screenshot({ path: `${OUT}/${name}` });
    console.log(`  ${name}`);
  }

  await context.close();
}

await browser.close();
console.log('完了');
