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

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';

/*
  接続先。既定は手元の管理画面（開発サーバー）。

  引数で差し替えられる。決め打ちにしていたため、手元のサーバーが
  止まっているあいだ、この検査は回しようがなかった。
*/
const raw = process.argv[2] ?? 'http://localhost:3000';
const BASE = raw.endsWith('/') ? raw.slice(0, -1) : raw;
/*
  クッキーの宛先。

  以前は 'localhost' を直に書いていた。**本番へ当てると、指定した
  表示が届かず、最初の4件がそのまま落ちていた。** 接続先から取る。
*/
const HOST = new URL(BASE).hostname;

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
/*
  検証用のアカウントを、その場で作って使い、最後に消す。

  以前は KN_EMAIL / KN_PASSWORD を環境変数で渡す作りだった。
  **渡さなければ省略され、渡すとすれば発注元の実アカウントになる。**
  そのため、ログイン後の確認は一度も回されていなかった。
*/
const env = loadEnv('admin/.env.local');
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const email = 'ui-theme-toggle@kurumayose.invalid';
const password = 'Wc5rJp8nTy3kQm';

const sb = async (path, { method = 'GET', body, prefer } = {}) => {
  const r = await fetch(`${SB}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let b = null;
  try { b = t ? JSON.parse(t) : null; } catch { b = t; }
  return { ok: r.ok, body: b };
};

const users = await sb('/auth/v1/admin/users?page=1&per_page=200');
const stale = (users.body?.users ?? []).find((u) => u.email === email);
if (stale) await sb(`/auth/v1/admin/users/${stale.id}`, { method: 'DELETE' });
const made = await sb('/auth/v1/admin/users', {
  method: 'POST',
  body: { email, password, email_confirm: true },
});
const userId = made.body?.id;
if (!userId) throw new Error(`検証用のアカウントを作れません: ${JSON.stringify(made.body).slice(0, 160)}`);
await sb('/rest/v1/admin_profiles', {
  method: 'POST',
  body: { user_id: userId, display_name: 'UI検証用管理者', role: 'admin' },
});

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
await ctx.addCookies([{ name: 'kn_theme', value: 'light', domain: HOST, path: '/' }]);
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
{
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx2.addCookies([{ name: 'kn_theme', value: 'light', domain: HOST, path: '/' }]);
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
}

await browser.close();

// --- 後片付け -----------------------------------------------------------------
await sb(`/rest/v1/audit_logs?actor_id=eq.${userId}`, { method: 'DELETE' });
await sb(`/rest/v1/admin_profiles?user_id=eq.${userId}`, { method: 'DELETE' });
await sb(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
const purged = await purgeAuditLogs(sb, [userId]);
console.log(`  片付け  検証用のアカウントを消しました（操作履歴 ${purged} 件）`);

console.log('');
if (failures.length) {
  console.error(`合格 ${pass} 件 / 失敗 ${failures.length} 件`);
  process.exit(1);
}
console.log(`合格 ${pass} 件 / 失敗 0 件 — テーマ切替と同時にロゴが入れ替わります。`);
