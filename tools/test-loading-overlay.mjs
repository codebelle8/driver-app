/**
 * 読み込み表示が「元の画面の上に重なる」ことを確認する。
 *
 *   node tools/test-loading-overlay.mjs
 *
 * 以前は loading.tsx（Suspense の待機表示）を使っていたため、
 * 元の画面が差し替わってしまい、下に残らなかった。
 * 回帰しないよう、下の画面が残っていることを明示的に検証する。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';

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
/*
  検証用のアカウントを、その場で作って使い、最後に消す。

  以前は KN_EMAIL / KN_PASSWORD を環境変数で渡す作りだった。
  **渡さなければ動かず、渡すとすれば発注元の実アカウントになる。**
  そのため、この検査は回されないままになっていた。
*/
const env = loadEnv('admin/.env.local');
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const email = 'ui-overlay-check@kurumayose.invalid';
const password = 'Ls3nGv7qZa9dMx';

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

let pass = 0;
const failures = [];
function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label} ${detail}`);
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([
  { name: 'kn_locale', value: 'ja', domain: 'localhost', path: '/' },
  { name: 'kn_theme', value: 'dark', domain: 'localhost', path: '/' },
]);
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
await page.waitForLoadState('networkidle');

// ダッシュボード固有の見出しが、遷移中も残っているかを見る
const DASHBOARD_HEADING = 'ダッシュボード';
check(
  '遷移前: ダッシュボードの見出しが表示されている',
  await page.getByRole('heading', { name: DASHBOARD_HEADING }).isVisible(),
);

// 遷移先の応答をわざと遅らせて、読み込み中の状態を観測する
await page.route('**/facilities**', async (route) => {
  await new Promise((r) => setTimeout(r, 5000));
  await route.continue();
});

await page.getByRole('link', { name: '施設一覧' }).click();
await page.waitForSelector('[data-testid="navigation-overlay"]', { timeout: 5000 });

console.log('遷移中:');
const overlay = page.locator('[data-testid="navigation-overlay"]');
check('読み込み表示が出ている', await overlay.isVisible());

// ここが肝心 — 下の画面が消えていないこと
check(
  '元の画面（ダッシュボード）が下に残っている',
  await page.getByRole('heading', { name: DASHBOARD_HEADING }).count() > 0,
);

const style = await overlay.evaluate((el) => {
  const s = getComputedStyle(el);
  return { position: s.position, zIndex: s.zIndex, backdropFilter: s.backdropFilter };
});
check('画面全体に固定表示されている', style.position === 'fixed', JSON.stringify(style));
check('重ね順が指定されている (z-index)', Number(style.zIndex) > 0, `z-index=${style.zIndex}`);
check(
  '背景にぼかしがかかっている',
  /blur/.test(style.backdropFilter),
  `backdrop-filter=${style.backdropFilter}`,
);

// ハンドルと計器が重なった状態で描かれているか
check('ハンドルが描画されている', (await overlay.locator('svg').count()) >= 3);

await page.screenshot({ path: 'tools/screenshots/11-loading-overlay.png' });

// 遷移が終わったら消えること
await page.waitForURL('**/facilities', { timeout: 15000 });
await page.waitForTimeout(600);
console.log('遷移後:');
check('読み込み表示が消えている', (await overlay.count()) === 0);
check(
  '新しい画面が表示されている',
  await page.getByRole('heading', { name: '施設一覧' }).isVisible(),
);

await ctx.close();
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
console.log(`合格 ${pass} 件 / 失敗 0 件 — 元の画面を残したまま重ねて表示されます。`);
