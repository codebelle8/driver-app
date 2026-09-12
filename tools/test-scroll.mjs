/**
 * 画面の下端が切れて、届かなくなっていないかを測る。
 *
 *   node tools/test-scroll.mjs                        手元の書き出し
 *   node tools/test-scroll.mjs https://kurumayose-navi.vercel.app
 *
 * **なぜ要るか**
 *   マイページに**スクロールする箱が無かった。** 中身が画面より高く
 *   なると、そのまま切り落とされ、指で動かしても何も起きない。
 *   実機で「このアプリについて」から下へ届かなくなっていた
 *   （ご報告 2026-09-13）。
 *
 *   手元の検査はどれも 1280×900 で見ていた。**その大きさでは収まる。**
 *   だから一度も引っかからなかった。実機の縦の狭さは、横幅の検査でも
 *   読みやすさの検査でも代わりにならない。
 *
 * **どう測るか**
 *   端末に近い大きさで開き、文字を持つ要素のうち**いちばん下にあるもの**
 *   を選ぶ。画面に収まっていればそれでよい。はみ出しているときは、
 *   **指で動かして**、本当に届くかを見る。届かなければ切れている。
 *
 * **scrollIntoView で測ってはいけない**
 *   最初そう書いたところ、**本番（まだ直っていない版）でも合格した。**
 *   overflow: hidden の箱は、指では動かないが、命令では動く。
 *   出来合いの関数で送ると、動かないはずのものが動いてしまう。
 *
 *   だから、ここでは車輪（wheel）を回す。指と同じ道を通る。
 *   検査は「直っていないものを、ちゃんと落とせるか」で確かめること。
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const raw = process.argv[2] ?? 'http://localhost:4190';
const BASE = raw.endsWith('/') ? raw.slice(0, -1) : raw;
const NL = String.fromCharCode(10);

const conn = connect();

/**
 * 実機に近い大きさ。
 *
 * 縦の狭いほうで見る。横幅は別の検査（test-breakpoints）が見ている。
 */
const SIZES = [
  ['iPhone SE 相当', 375, 667],
  ['iPhone 14 相当', 390, 844],
  ['小さめの Android', 360, 640],
];

/*
  見て回る画面。

  施設の詳細は中身がいちばん多い。写真・注意事項・入口が増えるほど
  伸びるため、必ず入れる。どの施設かは、その場で1件もらう。
*/
const one = await fetch(`${conn.url}/rest/v1/facilities?select=id&limit=1`, {
  headers: conn.svc,
})
  .then((r) => r.json())
  .catch(() => null);
const facilityId = Array.isArray(one) && one[0] ? one[0].id : null;

const SCREENS = [
  ['探す', '/'],
  ['お気に入り', '/favorites'],
  ['履歴', '/history'],
  ['マイページ', '/mypage'],
  ['アカウント', '/account'],
  ['お支払い', '/plan'],
  ['お知らせ', '/notices'],
  ...(facilityId ? [['施設の詳細', `/facility/${facilityId}`]] : []),
];

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}`);
    if (detail) console.error(detail);
  }
};

/** いま、いちばん下の要素の下端はどこにあるか */
const WHERE = () => {
  const el = window.__kn_last;
  return el ? Math.round(el.getBoundingClientRect().bottom) : null;
};

let browser = null;
let member = null;

try {
  console.log(`下端まで届くかの検査: ${BASE}${NL}`);
  member = await createMember(conn, 'scroll');
  browser = await chromium.launch();

  for (const [sizeName, width, height] of SIZES) {
    console.log(`--- ${sizeName}（${width}×${height}）---`);
    const ctx = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();

    /*
      まず**未ログインの入口**を見る。

      全員が最初に見る画面で、しかも横向きにすると一気に狭くなる。
      ログインしてからの画面しか見ていないと、ここが抜ける。
    */
    const 見る画面 = [['ログインの入口（未ログイン）', '/', true]];
    for (const [name, path] of SCREENS) 見る画面.push([name, path, false]);

    /* 一度入ったら、そのまま続ける（画面を移るたびに入り直さない） */
    let 入った = false;

    for (const [name, path, 未ログイン] of 見る画面) {
      if (!未ログイン && !入った) {
        await signInOn(page, BASE, member, { goto: '/' });
        await page.waitForTimeout(3000);
        入った = true;
      }
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3500);
      await skipIntro(page);
      await page.waitForTimeout(700);

      /* いちばん下の要素を覚える。ここではまだ動かさない */
      const before = await page.evaluate(() => {
        const vh = window.innerHeight;
        const items = [];
        for (const el of document.querySelectorAll('*')) {
          const own = [...el.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent.trim())
            .join('')
            .trim();
          if (!own) continue;
          const s = getComputedStyle(el);
          if (s.visibility === 'hidden' || s.display === 'none') continue;
          const b = el.getBoundingClientRect();
          if (b.width < 2 || b.height < 2) continue;
          items.push({ el, own, bottom: b.bottom });
        }
        if (items.length === 0) return { 空: true };
        items.sort((a, b) => b.bottom - a.bottom);
        const last = items[0];
        window.__kn_last = last.el;
        return {
          空: false,
          fits: last.bottom <= vh + 1,
          文: last.own.slice(0, 24),
          下: Math.round(last.bottom),
          高: vh,
        };
      });

      if (before.空) {
        check(`${name} — 文字が見つからない`, false);
        continue;
      }
      if (before.fits) {
        check(`${name}（${before.下}px / 画面 ${before.高}px に収まる）`, true);
        continue;
      }

      /*
        指で動かす。一度で足りないことがあるため、繰り返す。

        **場所を変えて何度か試す。**
        施設の詳細には地図が埋まっており、地図の上で車輪を回しても
        画面は送られない（地図が受け取る。指一本なら送られる）。
        真ん中だけで試して「動かない」と決めると、**誤って落とす。**
        実際に一度そうなった。

        下のほうから試す。地図や写真は上に置かれることが多い。
      */
      const 試す場所 = [0.82, 0.68, 0.5, 0.35].map((r) => Math.round(height * r));
      let 位置 = before.下;
      let 動いた = false;
      let 届いた = false;

      for (const y of 試す場所) {
        await page.mouse.move(Math.round(width / 2), y);
        for (let i = 0; i < 15; i++) {
          await page.mouse.wheel(0, 600);
          await page.waitForTimeout(200);
          const now = await page.evaluate(WHERE);
          if (now === null) break;
          if (now < 位置 - 2) 動いた = true;
          if (now === 位置) break; // ここでは効かない。別の場所を試す
          位置 = now;
          if (now <= height + 1) { 届いた = true; break; }
        }
        if (届いた) break;
      }

      check(
        `${name}（${before.下}px まであり、指で動かして届く）`,
        届いた,
        動いた
          ? `        動きはするが、下端が ${位置}px で止まり、画面 ${height}px に入らない。` +
            `${NL}        いちばん下の文字「${before.文}」へ届きません。`
          : `        **画面のどこで動かしても、まったく動きません。**` +
            `${NL}        試した高さ: ${試す場所.join('px, ')}px` +
            `${NL}        下端は ${位置}px のまま。画面は ${height}px。` +
            `${NL}        いちばん下の文字「${before.文}」は切れたままです。`,
      );
    }
    await ctx.close();
  }
} finally {
  console.log(`${NL}--- 後片付け ---`);
  check('検査で作った会員を消した', await removeMember(conn, member));
  if (browser) await browser.close();
  console.log(`${NL}合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
