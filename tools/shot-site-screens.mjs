/**
 * 紹介サイトに載せる、アプリの実画面を撮る。
 *
 *   node tools/shot-site-screens.mjs
 *   node tools/shot-site-screens.mjs http://localhost:4190
 *
 * **なぜ撮り直せるようにしておくか**
 *   アプリの見た目が変われば、紹介サイトの画面も古くなる。手で撮ると、
 *   どの施設を開いたか、どこで切ったかが分からなくなる。何度でも同じ
 *   ものが撮れるようにしておく。
 *
 * **作った販促画像は使わない。**
 *   発注元からいただいたバナー（app/public/art/）には、実際のアプリに
 *   無い機能（駐車場情報・案内図の経路線など）も描かれている。紹介
 *   サイトで「できること」として載せると、使った方が探しても見つからない。
 *   実物を撮る。
 *
 * **施設は「浦安ブライトンホテル」を開く。**
 *   進入方法に「１Fはバス専用、スロープを上がって２Fに車寄せ」とあり、
 *   ナビの案内先と実際の車寄せがずれる、という発注元の文面そのものを
 *   実例で示せる。進入方法が「現地調査前」の施設を載せると、情報が
 *   まだ無いことを宣伝してしまう。
 *
 * **検査用の会員で入り、最後に消す。** 右上の丸（アカウントの頭文字）は
 * 検査用の会員のものなので、写す前に隠す。
 */
import { mkdirSync } from 'node:fs';

import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const APP = (process.argv[2] ?? 'https://app.kurumayosenavi.com').replace(/\/$/, '');
const OUT = 'site/assets/screens';
const FACILITY = '浦安ブライトンホテル';

mkdirSync(OUT, { recursive: true });
const conn = connect();
const member = await createMember(conn, 'site');
const browser = await chromium.launch();

/** 右上のアカウントの丸を隠す。検査用の会員の頭文字が出ているため。 */
async function hideAccount(page) {
  await page.addStyleTag({
    content: '[aria-label="アカウントのメニュー"]{visibility:hidden !important}',
  });
}

try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ja-JP',
  });
  const page = await ctx.newPage();
  await signInOn(page, APP, member, { goto: '/' });

  /* 探す */
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await skipIntro(page);
  await hideAccount(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/search.png` });
  console.log(`  写し  ${OUT}/search.png`);

  /* 施設の詳細 */
  const box = page.getByPlaceholder('施設名・よみがな・住所').first();
  await box.fill(FACILITY);
  await page.waitForTimeout(3000);
  await page.getByText(FACILITY, { exact: true }).first().click();
  await page.waitForTimeout(6000);
  await hideAccount(page);
  await page.waitForTimeout(800);
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  if (!body.includes('スロープ')) throw new Error(`進入方法が出ていません: ${body.slice(0, 200)}`);
  await page.screenshot({ path: `${OUT}/detail.png` });
  console.log(`  写し  ${OUT}/detail.png`);

  await ctx.close();
} finally {
  await browser.close();
  await removeMember(conn, member);
  console.log('  片付け  検査用の会員を消しました');
}
