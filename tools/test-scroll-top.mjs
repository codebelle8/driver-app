/**
 * 「上へ」の釦が、探す・お気に入り・履歴の3画面で同じように働くかを見る。
 *
 *   node tools/test-scroll-top.mjs                        手元の書き出し
 *   node tools/test-scroll-top.mjs https://app.kurumayosenavi.com
 *
 * **なぜ要るか**
 *   探す画面にはあったが、**お気に入りと履歴には無かった**
 *   （ご指示 2026-09-13）。同じ形の一覧なのに、片方だけ戻せない。
 *
 * **どう測るか**
 *   1. 先頭にいるあいだは出ていないこと（浮いていると一覧を隠す）
 *   2. 下へ送ると出ること
 *   3. 押すと先頭へ戻り、釦も引っ込むこと
 *   4. 中身が空のときは出ないこと
 *
 *   「置いてあるか」ではなく「押すと戻るか」で見る。
 *
 * **中身はこちらで用意する**
 *   お気に入りと履歴は端末の中にある。空のままでは一覧が伸びず、
 *   送ることも試せない。使い捨ての会員を作り、その端末へ直に置く。
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const raw = process.argv[2] ?? 'http://localhost:4190';
const BASE = raw.endsWith('/') ? raw.slice(0, -1) : raw;
const NL = String.fromCharCode(10);

const conn = connect();

/** 釦に付けてある読み上げ用の名前。ここを手がかりに探す。 */
const LABEL = '一覧の先頭へ戻る';

/** 一覧が画面より十分に長くなる件数。240px を超えて送れるだけ要る。 */
const SEED = 20;

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

/** 釦が見えているか。透けて消しているので、親までさかのぼって掛ける。 */
const SEEN = (label) => {
  const el = document.querySelector(`[aria-label="${label}"]`);
  if (!el) return { ある: false, 見える: false };
  let o = 1;
  for (let p = el; p; p = p.parentElement) o *= Number(getComputedStyle(p).opacity);
  const b = el.getBoundingClientRect();
  return { ある: true, 見える: o > 0.5 && b.width > 2 && b.height > 2, 濃さ: Number(o.toFixed(2)) };
};

/** いちばん長く送れる箱の、いまの送り位置 */
const OFFSET = () => {
  let best = null;
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (!/(auto|scroll)/.test(s.overflowY)) continue;
    if (el.scrollHeight <= el.clientHeight + 2) continue;
    if (!best || el.scrollHeight > best.scrollHeight) best = el;
  }
  return best ? Math.round(best.scrollTop) : null;
};

let browser = null;
let member = null;

try {
  console.log(`「上へ」の釦の検査: ${BASE}${NL}`);

  member = await createMember(conn, 'top');

  /* 端末へ置く中身。実在する施設の id を使う */
  const rows = await fetch(`${conn.url}/rest/v1/facilities?select=id,name,name_en&limit=${SEED}`, {
    headers: conn.svc,
  }).then((r) => r.json());
  if (!Array.isArray(rows) || rows.length < 10) {
    throw new Error(`施設を取れません: ${JSON.stringify(rows).slice(0, 160)}`);
  }
  const 種 = rows.map((f, i) => ({
    id: f.id,
    name: f.name,
    name_en: f.name_en,
    at: new Date(Date.now() - i * 60000).toISOString(),
  }));

  browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  await signInOn(page, BASE, member, { goto: '/' });
  await page.waitForTimeout(3000);
  await skipIntro(page);

  // --- 中身が空のとき -------------------------------------------------------
  console.log('--- 中身が空のとき ---');
  for (const [name, path] of [['お気に入り', '/favorites'], ['履歴', '/history']]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const s = await page.evaluate(SEEN, LABEL);
    check(`${name} — 空のときは出ない`, !s.見える, `        ${JSON.stringify(s)}`);
  }

  // --- 中身を置く -----------------------------------------------------------
  await page.evaluate(
    ([list]) => {
      localStorage.setItem('kn_favorites', JSON.stringify(list));
      localStorage.setItem('kn_history', JSON.stringify(list));
    },
    [種],
  );

  // --- 3画面を見る ----------------------------------------------------------
  const 画面 = [
    ['探す', '/', true],
    ['お気に入り', '/favorites', false],
    ['履歴', '/history', false],
  ];

  for (const [name, path, 絞り込む] of 画面) {
    console.log(`--- ${name} ---`);
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await skipIntro(page);
    await page.waitForTimeout(600);

    /*
      探す画面の釦は、絞り込んでいるあいだだけ出る。
      入り口の画面（カテゴリの並び）では要らないため。
    */
    if (絞り込む) {
      const box = page.locator('input').first();
      await box.click();
      await box.fill('東京');
      await page.waitForTimeout(2500);
    }

    const 先頭 = await page.evaluate(SEEN, LABEL);
    check(`${name} — 先頭では出ない`, !先頭.見える, `        ${JSON.stringify(先頭)}`);

    /* 下へ送る。一覧の上で車輪を回す */
    await page.mouse.move(195, 620);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(140);
    }
    await page.waitForTimeout(600);

    const 送った先 = await page.evaluate(OFFSET);
    const 出た = await page.evaluate(SEEN, LABEL);
    check(
      `${name} — 下へ送ると出る（送り位置 ${送った先}px）`,
      出た.見える,
      `        ${JSON.stringify(出た)} / 送り位置 ${送った先}`,
    );
    if (!出た.見える) continue;

    /* 押して、先頭へ戻るか */
    await page.click(`[aria-label="${LABEL}"]`);
    await page.waitForTimeout(1200);

    const 戻り = await page.evaluate(OFFSET);
    check(
      `${name} — 押すと先頭へ戻る（${送った先}px → ${戻り}px）`,
      戻り !== null && 戻り <= 2,
      `        送り位置が ${戻り}px のままです`,
    );

    const 引っ込み = await page.evaluate(SEEN, LABEL);
    check(`${name} — 戻ったら引っ込む`, !引っ込み.見える, `        ${JSON.stringify(引っ込み)}`);
  }

  await ctx.close();
} finally {
  console.log(`${NL}--- 後片付け ---`);
  check('検査で作った会員を消した', await removeMember(conn, member));
  if (browser) await browser.close();
  console.log(`${NL}合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
