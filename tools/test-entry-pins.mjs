/**
 * 施設の地図に、入口ごとのピンが立つかを見る。
 *
 *   node tools/test-entry-pins.mjs                          手元の書き出し (4173)
 *   node tools/test-entry-pins.mjs https://kurumayose-navi.vercel.app
 *
 * ご指摘（2026-09-29）「進入路が2つある施設で、地図には1つしか無いように見える」。
 * 以前は先頭の入口（A）だけを地図に渡しており、「経路」も常に A へ向かっていた。
 *
 * 見るのは次のとおり（帝国ホテル東京＝入口 A・B で見る）。
 *   Google の地図
 *     1. 入口の数だけピンが立つ（A・B の記号付き）
 *     2. すべてのピンが地図の中に収まる
 *     3. はじめは A を選んでいる（経路の札が「経路（A）」）
 *     4. カード B を押すと B を選び、地図が B へ寄る
 *     5. 「経路」が B の座標へ向かう
 *     6. ピン A を押すと A を選ぶ
 *     7. 狭い画面でカードを押すと、地図が見えるところまで戻る
 *   国土地理院の地図（Google の地図を読めないとき・端末のアプリ）
 *     8. ピンが2本立ち、押すと選べる
 *   入口が1つの施設
 *     9. ピンは1本、札は「経路」のまま（これまでどおり）
 *
 * **検査用の会員を作り、最後に消す。**
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
const conn = connect();

/** 帝国ホテル東京（入口 A・B） */
const TWO = '8e1f2039-8b2d-4728-9ee1-6704ebbef86e';
/** ブルガリホテル東京（入口1つ） */
const ONE = 'dfbc299d-a79d-4d40-8016-ed5c7a89f3e1';

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

/** 入口の座標（照らし合わせ用） */
async function entryCoords(facilityId) {
  const r = await fetch(
    `${conn.url}/rest/v1/entry_points?select=code,nav_lat,nav_lng&facility_id=eq.${facilityId}&is_active=eq.true&order=code`,
    { headers: conn.svc },
  );
  return Object.fromEntries((await r.json()).map((e) => [e.code, e]));
}

/** 経路の札の記号（「経路（B）」なら B、記号なしなら ''） */
const routeCode = (page) =>
  page.evaluate(() => {
    const m = document.body.innerText.match(/経路（([A-Z])）/);
    if (m) return m[1];
    return /経路/.test(document.body.innerText) ? '' : null;
  });

/** Google の地図のピン（title が「A 車寄せ」の形） */
const googlePins = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[title]')]
      .filter((e) => /^[A-Z] /.test(e.getAttribute('title')))
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { code: e.getAttribute('title')[0], x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }),
  );

/** 地図の枠（Google の地図の div） */
const mapBox = (page) =>
  page.evaluate(() => {
    const g = document.querySelector('.gm-style');
    const r = (g?.parentElement ?? g)?.getBoundingClientRect();
    return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
  });

async function openFacility(ctx, member, id, { blockGoogle = false } = {}) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (blockGoogle) await page.route('**/maps.googleapis.com/**', (r) => r.abort());
  await signInOn(page, BASE, member);
  await page.goto(`${BASE}/facility/${id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await skipIntro(page);
  await page.waitForTimeout(2500);
  return { page, errors };
}

let browser = null;
let member = null;

try {
  console.log(`入口ごとのピンの検査: ${BASE}\n`);
  member = await createMember(conn, 'pins');
  browser = await chromium.launch({ channel: 'msedge' });
  const coords = await entryCoords(TWO);

  /* =================================================================== */
  console.log('--- Google の地図（広い画面） ---');
  /* =================================================================== */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const { page, errors } = await openFacility(ctx, member, TWO);

    let pins = await googlePins(page);
    const codes = pins.map((p) => p.code).sort().join(',');
    check('入口の数だけピンが立つ（A・B）', codes === 'A,B', codes);

    const box = await mapBox(page);
    const inside = (p) => box && p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom;
    check('すべてのピンが地図の中に収まる', pins.length === 2 && pins.every(inside), JSON.stringify({ box, pins }));
    check('はじめは A を選んでいる（経路の札が「経路（A）」）', (await routeCode(page)) === 'A');

    /* カード B を押す */
    const center = box ? { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 } : { x: 0, y: 0 };
    const dist = (p) => Math.hypot(p.x - center.x, p.y - center.y);
    const bBefore = pins.find((p) => p.code === 'B');
    await page.getByRole('button', { name: /^B「/ }).click();
    await page.waitForTimeout(1500);
    check('カード B を押すと B を選ぶ（経路の札が「経路（B）」）', (await routeCode(page)) === 'B');
    pins = await googlePins(page);
    const bAfter = pins.find((p) => p.code === 'B');
    check(
      '地図が B へ寄る（B のピンが地図の中心に近づく）',
      bBefore && bAfter && dist(bAfter) < dist(bBefore) - 20 && dist(bAfter) < 30,
      JSON.stringify({ before: bBefore && Math.round(dist(bBefore)), after: bAfter && Math.round(dist(bAfter)) }),
    );

    /*
      ピン A を押す。

      **地図の中に見えているピンだけを押す。** B へ寄せたあとは、A が
      地図の外へ出ていることがある（広い画面で 2026-10-05 に確認）。
      外のまま位置を押すと、左の列（カードや札）を押してしまい、
      ピンを押したことにならない。以前はそこに A のカードがあったため、
      カードを押して偶然合格していた。

      見えていなければ、人と同じく地図を動かして（A のほうへ引いて）
      から押す。
    */
    /* Google のピンは、押せる枠の上に絵が重なっている。人が押すのと同じく、マウスで位置を押す */
    const pinA = async () => (await googlePins(page)).find((p) => p.code === 'A');
    let a = await pinA();
    if (a && !inside(a) && box) {
      /* 地図の中心から A の向きへ、はみ出したぶんだけ引く */
      const dx = Math.max(box.left + 80 - a.x, Math.min(0, box.right - 80 - a.x));
      const dy = Math.max(box.top + 80 - a.y, Math.min(0, box.bottom - 80 - a.y));
      await page.mouse.move(center.x, center.y);
      await page.mouse.down();
      await page.mouse.move(center.x + dx, center.y + dy, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(1200);
      a = await pinA();
    }
    check('ピン A が地図の中に見えている（押せる）', !!a && inside(a), JSON.stringify({ box, a }));
    if (a && inside(a)) await page.mouse.click(a.x, a.y);
    await page.waitForTimeout(1200);
    check('ピン A を押すと A を選ぶ（経路の札が「経路（A）」）', (await routeCode(page)) === 'A');
    const cardA = await page.getByRole('button', { name: /^A「/ }).getAttribute('aria-selected');
    check('A のカードが選ばれた見た目になる', cardA === 'true', String(cardA));
    check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));

    /*
      「経路」は選んだ入口（B）へ向かうか。ブラウザでは、同じ画面のまま
      Google マップの経路へ移る。移る先の住所を捕まえて、座標を見る。
      **最後に行う**（押すとこの画面を離れるため）。
    */
    await page.getByRole('button', { name: /^B「/ }).click();
    await page.waitForTimeout(800);
    await page.route('**://www.google.com/maps/**', (r) => r.abort());
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('google.com/maps/dir'), { timeout: 10000 }).catch(() => null),
      page.getByText(/経路（B）/).click(),
    ]);
    const opened = decodeURIComponent(req?.url() ?? '');
    const b = coords.B;
    check(
      '「経路」が選んだ入口（B）の座標へ向かう',
      opened.includes(`${b.nav_lat.toFixed(6)},${b.nav_lng.toFixed(6)}`),
      opened,
    );
    await ctx.close();
  }

  /* =================================================================== */
  console.log('\n--- Google の地図（狭い画面） ---');
  /* =================================================================== */
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
    const { page, errors } = await openFacility(ctx, member, TWO);
    const pins = await googlePins(page);
    check('狭い画面でも、ピンが2本立つ', pins.length === 2, JSON.stringify(pins.map((p) => p.code)));

    /* 下まで送ってからカード B を押すと、地図が見えるところまで戻る */
    await page.getByRole('button', { name: /^B「/ }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const hidden = await mapBox(page);
    await page.getByRole('button', { name: /^B「/ }).click();
    await page.waitForTimeout(1500);
    const shown = await mapBox(page);
    check(
      'カードを押すと、地図が見えるところまで戻る',
      shown && shown.top >= 0 && shown.top < 200,
      JSON.stringify({ before: hidden?.top, after: shown?.top }),
    );
    check('押したカードの入口を選ぶ（経路（B））', (await routeCode(page)) === 'B');
    check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
    await ctx.close();
  }

  /* =================================================================== */
  console.log('\n--- 国土地理院の地図（Google を読めないとき・端末のアプリ） ---');
  /* =================================================================== */
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
    const { page, errors } = await openFacility(ctx, member, TWO, { blockGoogle: true });
    const gsi = await page.evaluate(() => document.body.innerText.includes('国土地理院'));
    check('Google を読めないとき、国土地理院の地図に切り替わる', gsi);
    const a = page.getByRole('button', { name: /^A：/ });
    const b = page.getByRole('button', { name: /^B：/ });
    check('ピンが2本立つ（A・B）', (await a.count()) === 1 && (await b.count()) === 1);
    await b.click();
    await page.waitForTimeout(800);
    check('ピン B を押すと B を選ぶ（経路（B））', (await routeCode(page)) === 'B');
    check('B のピンが選ばれた見た目になる', (await b.getAttribute('aria-selected')) === 'true');
    check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
    await ctx.close();
  }

  /* =================================================================== */
  console.log('\n--- 入口が1つの施設（これまでどおり） ---');
  /* =================================================================== */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const { page, errors } = await openFacility(ctx, member, ONE);
    const pins = await googlePins(page);
    check('ピンは1本', pins.length === 1, JSON.stringify(pins.map((p) => p.code)));
    check('経路の札は「経路」のまま（記号を付けない）', (await routeCode(page)) === '');
    const hint = await page.evaluate(() => document.body.innerText.includes('経路の行き先を選べます'));
    check('選び方の案内は出さない（選ぶものが無い）', !hint);
    check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
    await ctx.close();
  }
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close();
  const gone = await removeMember(conn, member);
  console.log(`\n検査用の会員を消した: ${gone ? 'はい' : 'いいえ（要確認）'}`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
