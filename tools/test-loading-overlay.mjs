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

const email = process.env.KN_EMAIL;
const password = process.env.KN_PASSWORD;

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

console.log('');
if (failures.length) {
  console.error(`合格 ${pass} 件 / 失敗 ${failures.length} 件`);
  process.exit(1);
}
console.log(`合格 ${pass} 件 / 失敗 0 件 — 元の画面を残したまま重ねて表示されます。`);
