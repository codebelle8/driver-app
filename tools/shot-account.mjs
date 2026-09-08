/**
 * アカウントの画面を写す。
 *
 *   node tools/shot-account.mjs [宛先]
 *
 * 登録・ログイン・再設定の3つの姿と、マイページの入口を並べて見る。
 * 実際の登録は行わない（発注元の本番に会員が増えてしまうため）。
 */
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');

const browser = await chromium.launch();
try {
  for (const [w, h, tag] of [
    [390, 844, 'sp'],
    [1440, 900, 'pc'],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`${BASE}/mypage`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    const skip = page.getByRole('button', { name: /導入を飛ばす|Skip the intro/ });
    if (await skip.count()) await skip.first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `.tmp-acc-${tag}-mypage.png` });

    await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `.tmp-acc-${tag}-in.png` });

    // 新規登録へ切り替える
    await page.getByRole('tab', { name: /新規登録|Sign up/ }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `.tmp-acc-${tag}-up.png` });

    // 何も入れずに押したときの言い分
    await page.getByRole('button', { name: /登録する|Create account/ }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `.tmp-acc-${tag}-empty.png` });

    // 再設定
    await page.getByRole('tab', { name: /ログイン|Sign in/ }).click();
    await page.waitForTimeout(400);
    await page.getByText(/パスワードをお忘れの方|Forgotten your password/).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `.tmp-acc-${tag}-reset.png` });

    console.log(`  ${w}x${h} を写した`);
    await page.close();
  }
} finally {
  await browser.close();
}
