/**
 * 管理画面の見た目を画像として書き出す。
 *
 *   node tools/screenshot.mjs
 *
 * ログインが必要な画面も撮れるよう、Supabase にパスワードでログインして
 * セッション Cookie を注入する。認証情報は admin/.env.local から読む。
 *
 * 生成物は tools/screenshots/ (Git 管理外)。
 */
import { mkdirSync, readFileSync } from 'node:fs';

import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const OUT = 'tools/screenshots';

const shots = [
  { name: '01-login-ja-dark', path: '/login', locale: 'ja', theme: 'dark' },
  { name: '02-login-en-light', path: '/login', locale: 'en', theme: 'light' },
  { name: '03-dashboard-ja-dark', path: '/', locale: 'ja', theme: 'dark', auth: true },
  { name: '04-dashboard-en-light', path: '/', locale: 'en', theme: 'light', auth: true },
  { name: '05-facilities-ja-dark', path: '/facilities', locale: 'ja', theme: 'dark', auth: true },
  { name: '06-new-facility-ja-light', path: '/facilities/new', locale: 'ja', theme: 'light', auth: true },
  { name: '07-categories-en-dark', path: '/categories', locale: 'en', theme: 'dark', auth: true },
];

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv('admin/.env.local');
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];

const email = process.env.KN_EMAIL;
const password = process.env.KN_PASSWORD;

mkdirSync(OUT, { recursive: true });

/**
 * 実際のログイン画面から入力して認証する。
 *
 * Cookie を自前で組み立てる方法もあるが、@supabase/ssr の保存形式
 * （接頭辞・チャンク分割）に依存するため壊れやすい。
 * 画面を操作して得た Cookie をそのまま使うほうが確実で、
 * ついでにログイン導線そのものの動作確認にもなる。
 */
async function login(browser) {
  if (!email || !password) return null;

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  } catch {
    console.warn('  ログインできませんでした。未ログイン画面のみ撮影します。');
    await context.close();
    return null;
  }

  const cookies = await context.cookies();
  await context.close();
  return cookies.filter((c) => c.name.startsWith('sb-'));
}

void ANON;
void projectRef;

const browser = await chromium.launch();
const authCookie = await login(browser);
console.log(
  authCookie ? `ログインしました (${authCookie.length} cookies)` : '未ログインで撮影します',
);

for (const shot of shots) {
  if (shot.auth && !authCookie) {
    console.log(`  skip ${shot.name} (ログインが必要)`);
    continue;
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: shot.locale === 'ja' ? 'ja-JP' : 'en-GB',
  });

  const cookies = [
    { name: 'kn_locale', value: shot.locale, domain: 'localhost', path: '/' },
    { name: 'kn_theme', value: shot.theme, domain: 'localhost', path: '/' },
  ];
  if (shot.auth && authCookie) {
    cookies.push(...authCookie);
  }
  await context.addCookies(cookies);

  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const finalUrl = new URL(page.url()).pathname;
  await page.screenshot({ path: `${OUT}/${shot.name}.png`, fullPage: true });

  const redirected = finalUrl !== shot.path;
  console.log(
    `  ${shot.name}  -> ${finalUrl}${redirected ? '  (リダイレクト)' : ''}` +
      (errors.length ? `  [console errors: ${errors.length}]` : ''),
  );
  errors.slice(0, 3).forEach((e) => console.log(`      ${e.slice(0, 160)}`));

  await context.close();
}

await browser.close();
console.log(`\n${OUT}/ に出力しました。`);
