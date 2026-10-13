/**
 * 紹介サイトの右側の縦の一文を確かめる（2026-10-13）。
 *
 *   npx serve -l 4300 site           （別の窓で）
 *   node tools/test-site-rail.mjs
 *   node tools/test-site-rail.mjs https://kurumayosenavi.com/
 *
 * ご指示（2026-10-13）。「みんなで、このアプリをもっと良くしていく。」「みんなが、このアプリの
 * 管理者であり、利用者。」を、サイトの右側に、1文字ずつ上へ流れて出そろうように。
 * くり返し回す。
 *
 * 見るもの
 *   1. 2つの文が、1文字ずつ（上の字から）出て、出そろう
 *   2. 1つ目 → 2つ目 → 1つ目と、くり返す
 *   3. マウスを重ねているあいだは止まり、離すと続く
 *   4. 読み上げには、2つの文がまとまって届く
 *   5. 手書き風の書体が届き、「、」「。」「っ」を縦書きの位置へ寄せている
 *   6. 4つの幅で、本文に掛からない・画面からはみ出さない・UP の釦と重ならない
 *   7. 動きを減らす場合（?calm）も、濃さだけで出そろう
 */
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? 'http://localhost:4300/').replace(/\/?$/, '/');
const SHOTS = new URL('./screenshots/', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, SHOTS));
const LINES = ['みんなで、このアプリをもっと良くしていく。', 'みんなが、このアプリの管理者であり、利用者。'];

let pass = 0;
const failures = [];
function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}`);
    if (detail) console.error(`        ${detail}`);
  }
}

/** それぞれの文で、出ている字の数（濃さ 1・位置が元どおり） */
const state = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#vrail .vrail__line')].map((line) => {
      const chars = [...line.querySelectorAll('.vrail__ch')];
      const shown = chars.map((ch) => {
        const s = getComputedStyle(ch);
        return Number(s.opacity) > 0.99 && (s.transform === 'none' || s.transform === 'matrix(1, 0, 0, 1, 0, 0)');
      });
      return { total: chars.length, shown: shown.filter(Boolean).length, flags: shown };
    }),
  );

/** n 番目の文が出そろうまで待つ。待った時間（ms）を返す。出そろわなければ -1 */
async function waitFull(page, n, limit) {
  const start = Date.now();
  while (Date.now() - start < limit) {
    const s = await state(page);
    if (s[n] && s[n].total > 0 && s[n].shown === s[n].total) return Date.now() - start;
    await page.waitForTimeout(120);
  }
  return -1;
}

const browser = await chromium.launch({ channel: 'msedge' });
try {
  console.log(`右側の縦の一文の検査: ${BASE}\n`);

  /* --- 動き（パソコン幅） --- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });

    const t1 = await waitFull(page, 0, 9000);
    check('1つ目の文が出そろう', t1 >= 0);
    const s = await state(page);
    check(`字の数が文と同じ（${s[0]?.total}・${s[1]?.total}）`, s[0]?.total === Array.from(LINES[0]).length && s[1]?.total === Array.from(LINES[1]).length);

    const read = await page.locator('#vrail .visually-hidden').allTextContents();
    check('読み上げには、2つの文がまとまって届く', read.join('|') === LINES.join('|'), read.join('|'));
    const ariaHidden = await page.locator('#vrail .vrail__cell:not([aria-hidden="true"])').count();
    check('1文字ずつの枠は、読み上げに出さない', ariaHidden === 0);

    const klee = await page.evaluate(() => ({
      loaded: [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Klee One' && f.status === 'loaded'),
      used: getComputedStyle(document.querySelector('#vrail .vrail__ch')).fontFamily,
      /* 「、」「。」「っ」が枠からずれていない（ずらすと、枠の外へ切れて消える） */
      off: [...document.querySelectorAll('#vrail .vrail__line')[0].querySelectorAll('.vrail__ch')]
        .filter((ch) => /[、。っ]/.test(ch.textContent))
        .filter((ch) => {
          const a = ch.getBoundingClientRect();
          const b = ch.parentElement.getBoundingClientRect();
          return Math.abs(a.left - b.left) > 0.5 || Math.abs(a.top - b.top) > 0.5;
        }).length,
    }));
    check('手書き風の書体が届いている', klee.loaded && klee.used.includes('Klee One'), JSON.stringify(klee));
    check('「、」「。」「っ」が枠の中にある（書体の縦書き用の形のまま）', klee.off === 0, JSON.stringify(klee));
    await page.screenshot({ path: shot('rail-1920-line1.png') });

    /* 2つ目の文は、1文字ずつ上から出る。途中の様子を取る */
    let partial = null;
    const until = Date.now() + 14000;
    while (Date.now() < until) {
      const st = await state(page);
      if (st[1].shown > 3 && st[1].shown < st[1].total - 3) {
        partial = st[1];
        break;
      }
      await page.waitForTimeout(60);
    }
    check('2つ目の文は、1文字ずつ出てくる（途中で一部だけ出ている）', partial !== null);
    if (partial) {
      const firstHidden = partial.flags.indexOf(false);
      const lastShown = partial.flags.lastIndexOf(true);
      check('上の字から順に出る（出た字の下に、まだの字が続く）', lastShown < firstHidden + 2, partial.flags.map(Number).join(''));
      await page.screenshot({ path: shot('rail-1920-partial.png') });
    }
    const t2 = await waitFull(page, 1, 9000);
    check('2つ目の文が出そろう', t2 >= 0);
    const both = await state(page);
    check('2つ目のあいだは、1つ目の文は出ていない', both[0].shown === 0, JSON.stringify(both[0].shown));
    const dot = await page.locator('#vrail .vrail__dots i.is-on').evaluate((el) => [...el.parentNode.children].indexOf(el));
    check('下の点が、2つ目を指す', dot === 1);
    await page.screenshot({ path: shot('rail-1920-line2.png') });

    const t3 = await waitFull(page, 0, 12000);
    check('また1つ目の文に戻る（くり返す）', t3 >= 0);

    /* マウスを重ねると止まる */
    await page.locator('#vrail .vrail__card').hover();
    await page.waitForTimeout(7000);
    const held = await state(page);
    check('マウスを重ねているあいだは止まる（7秒たっても1つ目のまま）', held[0].shown === held[0].total, JSON.stringify(held.map((l) => l.shown)));
    await page.mouse.move(400, 400);
    const t4 = await waitFull(page, 1, 12000);
    check('離すと続き、2つ目の文になる', t4 >= 0);
    await ctx.close();
  }

  /* --- 幅ごとの置き場所 --- */
  for (const [w, h] of [
    [1920, 900],
    [1366, 768],
    [820, 1180],
    [390, 844],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await waitFull(page, 0, 9000);
    /* 本文の外枠（.wrap）の右端と、札の左端 */
    const box = await page.evaluate(() => {
      const card = document.querySelector('#vrail .vrail__card').getBoundingClientRect();
      const wraps = [...document.querySelectorAll('main .wrap')].map((el) => el.getBoundingClientRect().right);
      return {
        card: { l: card.left, r: card.right, t: card.top, b: card.bottom, w: card.width },
        wrapRight: Math.max(...wraps),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        fs: parseFloat(getComputedStyle(document.getElementById('vrail')).fontSize),
      };
    });
    check(`[${w}px] 本文に掛からない（本文の右端 ${Math.round(box.wrapRight)} ≦ 札の左端 ${Math.round(box.card.l)}）`, box.card.l >= box.wrapRight - 0.5);
    check(`[${w}px] 画面からはみ出さない`, box.card.r <= w + 0.5 && box.card.t >= 0 && box.card.b <= h && box.overflow <= 1, JSON.stringify(box));
    check(`[${w}px] 字の大きさ ${box.fs}px（11px 以上）`, box.fs >= 11);

    /* 下へ送って UP の釦を出し、重ならないこと */
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2));
    await page.waitForTimeout(800);
    const up = await page.evaluate(() => {
      const u = document.getElementById('page-up').getBoundingClientRect();
      const c = document.querySelector('#vrail .vrail__card').getBoundingClientRect();
      return { overlap: !(c.bottom <= u.top || c.top >= u.bottom || c.right <= u.left || c.left >= u.right) };
    });
    check(`[${w}px] UP の釦と重ならない`, !up.overlap);
    await waitFull(page, 0, 20000);
    await page.screenshot({ path: shot(`rail-${w}.png`) });
    await ctx.close();
  }

  /* --- 脇の写真に道を譲る（上から下まで送って、出ている札が写真に重ならない） --- */
  for (const [w, h] of [
    [1440, 900],
    [1920, 900],
    [1366, 768],
    [390, 844],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await waitFull(page, 0, 9000);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    let clashes = [];
    let aways = 0;
    let backAfterAway = false;
    for (let y = 0; y < height; y += Math.round(h / 3)) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(450);
      const r = await page.evaluate(() => {
        const rail = document.getElementById('vrail');
        const c = rail.querySelector('.vrail__card').getBoundingClientRect();
        const away = rail.classList.contains('is-away');
        const hit = [...document.querySelectorAll('.guide img')].filter((img) => {
          const b = img.getBoundingClientRect();
          return b.width && b.height && b.right > c.left && b.left < c.right && b.bottom > c.top && b.top < c.bottom;
        });
        return { away, opacity: Number(getComputedStyle(rail).opacity), hit: hit.map((img) => img.getAttribute('src')) };
      });
      if (r.away) aways++;
      else if (aways > 0) backAfterAway = true;
      if (!r.away && r.hit.length) clashes.push(`${y}px: ${r.hit.join(',')}`);
    }
    check(`[${w}px] 出ている札が、脇の写真に重ならない（上から下まで）`, clashes.length === 0, clashes.join(' / '));
    if (w === 1440) check(`[${w}px] 写真の横では札が隠れ、過ぎるとまた出る`, aways > 0 && backAfterAway, `隠れた回数 ${aways}`);
    await ctx.close();
  }

  /* --- 動きを減らす場合 --- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}?calm`, { waitUntil: 'networkidle' });
    const t = await waitFull(page, 0, 9000);
    check('[動きを減らす] 1つ目の文が出そろう', t >= 0);
    const moved = await page.evaluate(() =>
      [...document.querySelectorAll('#vrail .vrail__ch')].some((ch) => {
        const tr = getComputedStyle(ch).transform;
        return tr !== 'none' && tr !== 'matrix(1, 0, 0, 1, 0, 0)';
      }),
    );
    check('[動きを減らす] 字の位置は動かさない', !moved);
    await ctx.close();
  }
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
