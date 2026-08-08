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

  // ハンドルが切れていて、計器の針も動いている状態を狙う
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/08-loading-steering-${theme}.png` });
  console.log(`  08-loading-steering-${theme}.png`);

  await context.close();
}

await browser.close();
console.log('完了');
