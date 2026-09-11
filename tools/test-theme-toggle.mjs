/**
 * テーマ切替でロゴが即座に入れ替わるかを確認する。
 *
 *   node tools/test-theme-toggle.mjs
 *
 * 以前は src をサーバー側で選んでいたため、切替後に再描画するまで
 * 画像が変わらなかった。回帰しないようここで確認する。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

/*
  接続先。既定は手元の管理画面（開発サーバー）。

  引数で差し替えられる。決め打ちにしていたため、手元のサーバーが
  止まっているあいだ、この検査は回しようがなかった。
*/
const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
void loadEnv('admin/.env.local');

const browser = await chromium.launch();

let pass = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(`${label} ${detail}`);
    console.error(`  FAIL  ${label} ${detail}`);
  }
}

/**
 * 表示されているロゴのファイル名を返す。
 * next/image は src を /_next/image?url=... に書き換えるため、
 * デコードしてから元のパスを取り出す。
 */
async function visibleLogo(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('img'))
      .filter((i) => getComputedStyle(i).display !== 'none')
      .map((i) => decodeURIComponent(i.currentSrc || i.src))
      .filter((u) => u.includes('/brand/'))
      .map((u) => u.split('/brand/')[1].split(/[?&]/)[0]);
  });
}

// --- ログイン画面（未ログインでも確認できる） --------------------------------
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addCookies([{ name: 'kn_theme', value: 'light', domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();

let navigations = 0;
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) navigations++;
});

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
const navsAfterLoad = navigations;

console.log('ログイン画面:');
check('初期表示は濃紺版', (await visibleLogo(page)).some((s) => s === 'logo-h160.png'), JSON.stringify(await visibleLogo(page)));

// テーマ切替ボタンを押す
await page.getByRole('button', { name: /表示を切り替え|Toggle appearance/ }).click();
await page.waitForTimeout(250);

check('切替後は白抜き版', (await visibleLogo(page)).some((s) => s === 'logo-white-h160.png'), JSON.stringify(await visibleLogo(page)));
check(
  'html の data-theme が dark',
  (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark',
);
check('再読み込みが発生していない', navigations === navsAfterLoad, `(navigations=${navigations - navsAfterLoad})`);

// もう一度押して戻る
await page.getByRole('button', { name: /表示を切り替え|Toggle appearance/ }).click();
await page.waitForTimeout(250);
check('もう一度押すと濃紺版に戻る', (await visibleLogo(page)).some((s) => s === 'logo-h160.png'));

await ctx.close();

// --- ヘッダー（ログイン後） ---------------------------------------------------
const email = process.env.KN_EMAIL;
const password = process.env.KN_PASSWORD;

if (email && password) {
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx2.addCookies([{ name: 'kn_theme', value: 'light', domain: 'localhost', path: '/' }]);
  const p2 = await ctx2.newPage();

  await p2.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p2.fill('input[name="email"]', email);
  await p2.fill('input[name="password"]', password);
  await p2.click('button[type="submit"]');
  await p2.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  await p2.waitForLoadState('networkidle');

  let navs = 0;
  p2.on('framenavigated', (f) => {
    if (f === p2.mainFrame()) navs++;
  });

  console.log('\nヘッダー（ログイン後）:');
  check('初期表示は濃紺版', (await visibleLogo(p2)).includes('logo-h80.png'), JSON.stringify(await visibleLogo(p2)));

  await p2.getByRole('button', { name: /表示を切り替え|Toggle appearance/ }).click();
  await p2.waitForTimeout(250);

  check('切替後は白抜き版', (await visibleLogo(p2)).includes('logo-white-h80.png'), JSON.stringify(await visibleLogo(p2)));
  check('再読み込みが発生していない', navs === 0, `(navigations=${navs})`);

  await ctx2.close();
} else {
  console.log('\nヘッダー: KN_EMAIL / KN_PASSWORD 未設定のため省略');
}

await browser.close();

console.log('');
if (failures.length) {
  console.error(`合格 ${pass} 件 / 失敗 ${failures.length} 件`);
  process.exit(1);
}
console.log(`合格 ${pass} 件 / 失敗 0 件 — テーマ切替と同時にロゴが入れ替わります。`);
