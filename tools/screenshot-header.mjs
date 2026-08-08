/**
 * ヘッダーの並びを幅ごとに確認する。
 *
 *   node tools/screenshot-header.mjs
 *
 * 狭い画面で操作ボタンが下段へ回り込まないか、
 * ロゴとナビが分離して見えるかを確かめる目的。
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

const auth = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await auth.newPage();
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.fill('input[name="email"]', email);
await p.fill('input[name="password"]', password);
await p.click('button[type="submit"]');
await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
const cookies = (await auth.cookies()).filter((c) => c.name.startsWith('sb-'));
await auth.close();

for (const width of [320, 480, 768, 1440]) {
  const context = await browser.newContext({
    viewport: { width, height: 520 },
    deviceScaleFactor: 2,
    locale: 'ja-JP',
  });
  await context.addCookies([
    ...cookies,
    { name: 'kn_locale', value: 'ja', domain: 'localhost', path: '/' },
    { name: 'kn_theme', value: 'dark', domain: 'localhost', path: '/' },
  ]);

  const page = await context.newPage();
  await page.goto(`${BASE}/facilities`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // 1段に収まっているか（高さ）と、横にはみ出していないか（必要幅）を確認する
  const m = await page.locator('header > div').evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    needed: el.scrollWidth,
    available: el.clientWidth,
  }));

  await page.locator('header').screenshot({ path: `${OUT}/09-header-${width}.png` });
  const overflow = m.needed - m.available;
  console.log(
    `  09-header-${width}.png   高さ ${Math.round(m.height)}px   ` +
      `必要幅 ${m.needed}px / 表示幅 ${m.available}px   ` +
      (overflow > 1 ? `はみ出し ${overflow}px` : 'OK'),
  );

  await context.close();
}

await browser.close();
console.log('完了');
