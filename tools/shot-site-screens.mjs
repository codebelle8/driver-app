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
 * **撮るもの**（「できること」のカードと、「車寄せナビとは」の実例の端末）
 *
 *   search.png     探す。開いたままの画面
 *   detail.png     確かめる・実例。浦安ブライトンホテル
 *   route.png      向かう。シャングリ・ラ ホテル 東京（入口が2つ。「経路（B）」と、
 *                  行き先の選び方の一文が出る）
 *   approach.png   入り方。帝国ホテル東京（2つの入口に、道順が文で入っている）。
 *                  入口の札が見えるところまで送る
 *   favorites.png  いつもの場所。上の3施設を「保存」したあとのお気に入り
 *   chat.png       チャット。**「情報交換」の最新の書き込みの行は隠す**
 *                  （会員の表示名と書き込みが出るため。公開のサイトに載せない）
 *   offline.png    圏外でも。データベースへの通信を止めて開き直し、「前回取得した
 *                  内容を表示しています」と、最近見た施設が出ているところまで送る
 *
 * **施設は、進入方法が書いてあるものを開く。** 「現地調査前」の施設を載せると、
 * 情報がまだ無いことを宣伝してしまう。浦安ブライトンホテルは「１Fはバス専用、
 * スロープを上がって２Fに車寄せ」とあり、ナビの案内先と実際の車寄せがずれる、
 * という発注元の文面そのものを実例で示せる。
 *
 * カードの窓には画面の上半分ほどしか入らない。どこを見せるかは、サイトの
 * `index.html` の `--shift` で写真ごとに決めている。撮り直して位置が変わったら、
 * そちらも合わせる。
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
const ROUTE_FACILITY = 'シャングリ・ラ ホテル 東京';
const APPROACH_FACILITY = '帝国ホテル東京';

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

async function shoot(page, name) {
  await hideAccount(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  写し  ${OUT}/${name}.png`);
}

/** 探す画面へ戻る。開き直すと導入の動画が出るので、飛ばす */
async function home(page) {
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await skipIntro(page);
}

/** 施設を名前で引いて開く */
async function openFacility(page, name) {
  await home(page);
  await page.getByPlaceholder('施設名・よみがな・住所').first().fill(name);
  await page.waitForTimeout(3000);
  await page.getByText(name, { exact: true }).first().click();
  await page.waitForTimeout(6000);
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  if (body.includes('現地調査前')) throw new Error(`${name} の進入方法が「現地調査前」です`);
}

/** 施設の画面の「保存」。お気に入りに入れる */
async function save(page) {
  await page.getByText('保存', { exact: true }).first().click();
  await page.waitForTimeout(1500);
}

/** 下のタブ。広い画面向けの左のメニューにも同じ名前があるため、見えているほうを押す */
async function tab(page, label) {
  await page.locator(`text="${label}" >> visible=true`).last().click();
  await page.waitForTimeout(4000);
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
  await home(page);
  await shoot(page, 'search');

  /* 確かめる（施設の詳細） */
  await openFacility(page, FACILITY);
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  if (!body.includes('スロープ')) throw new Error(`進入方法が出ていません: ${body.slice(0, 200)}`);
  await shoot(page, 'detail');
  await save(page);

  /* 向かう */
  await openFacility(page, ROUTE_FACILITY);
  await shoot(page, 'route');
  await save(page);

  /* 入り方。中身が短く、先頭の入口の札は画面の中ほどまでしか上がらない */
  await openFacility(page, APPROACH_FACILITY);
  await page
    .getByText('車寄せ（進入路 1）', { exact: true })
    .first()
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(1000);
  await shoot(page, 'approach');
  await save(page);

  /* いつもの場所 */
  await home(page);
  await tab(page, 'お気に入り');
  await shoot(page, 'favorites');

  /* チャット。最新の書き込みの行（表示名：本文）は隠す */
  await tab(page, 'チャット');
  const hidden = await page.evaluate(() => {
    let n = 0;
    for (const el of document.querySelectorAll('div')) {
      if (el.children.length || !el.textContent.includes('：')) continue;
      const row = el.closest('[role="button"], [role="link"], a');
      if (row && row.textContent.includes('情報交換')) {
        el.style.visibility = 'hidden';
        n++;
      }
    }
    return n;
  });
  if (hidden !== 1) throw new Error(`情報交換の最新の行を隠せませんでした（${hidden} か所）`);
  await shoot(page, 'chat');

  /* 圏外でも。データベースへの通信だけを止めて開き直す（画面そのものは読める） */
  await page.route(`${conn.url}/**`, (route) => route.abort());
  await page.goto(`${APP}/`, { waitUntil: 'load' });
  await page.waitForTimeout(8000);
  await skipIntro(page);
  const stale = (await page.locator('body').innerText()).includes('前回取得した内容を表示しています');
  if (!stale) throw new Error('「前回取得した内容を表示しています」が出ていません');
  await page
    .getByText('最近見たスポット', { exact: true })
    .first()
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(1000);
  await shoot(page, 'offline');

  await ctx.close();
} finally {
  await browser.close();
  await removeMember(conn, member);
  console.log('  片付け  検査用の会員を消しました');
}
