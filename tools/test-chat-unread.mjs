/**
 * チャット「情報交換」の未読の知らせを確かめる（2026-10-05）。
 *
 *   node tools/test-chat-unread.mjs                                 手元（4291）
 *   node tools/test-chat-unread.mjs https://kurumayose-navi.vercel.app
 *
 * ご指示「チャットに新しい書き込みが届いたら知らせ、未読があることを示す」。
 *
 * 見るもの
 *   1. 入った時点の書き込みは未読にしない（この版へ上がった途端に全部が未読にならない）
 *   2. 探す画面を見ているあいだに、ほかの方が書くと
 *      ・下のタブの「チャット」に未読の数が出る
 *      ・「情報交換に新しい書き込みがあります」と短く知らせる
 *   3. チャットの一覧の「情報交換」に「未読 ○」
 *   4. 情報交換を開くと既読になり、数が消える
 *   5. 自分の書き込みは未読に数えない
 *   6. 広い画面では、左メニューの「チャット」に数が出る
 *
 * **検査用の会員・書き込みを作り、最後に消す。**
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const APP = (process.argv[2] ?? 'http://localhost:4291').replace(/\/$/, '');
const conn = connect();
const STAMP = String(Date.now()).slice(-6);

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

async function tokenOf(member) {
  const r = await fetch(`${conn.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: member.email, password: member.password }),
  });
  return (await r.json()).access_token;
}

/** B が書く（会員の鍵で。アプリと同じ道筋） */
async function post(member, token, body) {
  const r = await fetch(`${conn.url}/rest/v1/chat_messages`, {
    method: 'POST',
    headers: { apikey: conn.anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: member.userId, body }),
  });
  if (!r.ok) throw new Error(`書けません: ${r.status} ${await r.text()}`);
}

/**
 * 下のタブの「チャット」に添えた数（無ければ ''）。
 *
 * **画面の下端の帯の中だけを探す。** チャットの画面では見出しも「チャット」で、
 * そちらを拾うと、画面の中の数字（採用 0件 など）を数と取り違える。
 */
const tabBadge = (page) =>
  page.evaluate(() => {
    const label = [...document.querySelectorAll('div, span')].find(
      (e) =>
        e.childElementCount === 0 &&
        e.textContent?.trim() === 'チャット' &&
        e.getBoundingClientRect().top > window.innerHeight - 120,
    );
    let el = label;
    for (let i = 0; i < 6 && el && el.tagName !== 'A' && el.getAttribute('role') !== 'tab' && el.getAttribute('role') !== 'button'; i++) {
      el = el.parentElement;
    }
    const text = (el ?? label?.parentElement)?.innerText ?? '';
    const m = text.replace('チャット', '').match(/\d+\+?/);
    return m ? m[0] : '';
  });

async function waitFor(fn, ms = 75_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

let browser = null;
const members = [];

try {
  console.log(`チャットの未読の検査: ${APP}\n`);
  const a = await createMember(conn, 'unread-a');
  const b = await createMember(conn, 'unread-b');
  members.push(a, b);
  browser = await chromium.launch({ channel: 'msedge' });

  /* B を先に入れておく（書くには会員の行が要る）。前もって1件書いておく */
  const bCtx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const bPage = await bCtx.newPage();
  await signInOn(bPage, APP, b);
  await bCtx.close();
  const tokenB = await tokenOf(b);
  await post(b, tokenB, `検査 ${STAMP}：A が入る前の書き込み`);

  /* =================================================================== */
  console.log('--- 狭い画面 ---');
  /* =================================================================== */
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signInOn(page, APP, a);
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await skipIntro(page);
  await page.waitForTimeout(3000);
  check('入った時点の書き込みは未読にしない', (await tabBadge(page)) === '', await tabBadge(page));

  await post(b, tokenB, `検査 ${STAMP}：B の書き込み 1`);
  await post(b, tokenB, `検査 ${STAMP}：B の書き込み 2`);
  const got = await waitFor(async () => (await tabBadge(page)) === '2');
  check('ほかの方が書くと、下のタブの「チャット」に未読の数（2）が出る', got, await tabBadge(page));
  check('「情報交換に新しい書き込みがあります」と知らせる',
    (await page.locator('body').innerText()).includes('情報交換に新しい書き込みがあります') ||
      (await waitFor(async () => (await page.locator('body').innerText()).includes('情報交換に新しい書き込みがあります'), 8000)));

  await page.goto(`${APP}/chat`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const pill = page.getByTestId('chat-unread-general');
  check('チャットの一覧の「情報交換」に「未読 2」', (await pill.count()) === 1 && (await pill.innerText()).includes('未読 2'),
    (await pill.count()) ? await pill.innerText() : '(無い)');

  await page.getByRole('button', { name: '情報交換' }).click();
  await page.waitForTimeout(4000);
  await page.goto(`${APP}/chat`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  check('情報交換を開くと既読になり、一覧の「未読」が消える', (await page.getByTestId('chat-unread-general').count()) === 0);
  check('下のタブの数も消える', (await tabBadge(page)) === '', await tabBadge(page));

  /* 自分の書き込みは数えない */
  await page.goto(`${APP}/chat-room`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.getByLabel('書き込む（500字まで）').fill(`検査 ${STAMP}：A の書き込み`);
  await page.getByRole('button', { name: '送る', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  check('自分の書き込みは未読に数えない', (await tabBadge(page)) === '', await tabBadge(page));
  check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
  await ctx.close();

  /* =================================================================== */
  console.log('\n--- 広い画面 ---');
  /* =================================================================== */
  const wide = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const wPage = await wide.newPage();
  await signInOn(wPage, APP, a);
  await wPage.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await wPage.waitForTimeout(3000);
  await skipIntro(wPage);
  await wPage.waitForTimeout(2000);
  await post(b, tokenB, `検査 ${STAMP}：B の書き込み 3`);
  const railed = await waitFor(async () => (await wPage.getByTestId('chat-unread').count()) === 1);
  check('左メニューの「チャット」に未読の数が出る', railed && (await wPage.getByTestId('chat-unread').innerText()) === '1',
    railed ? await wPage.getByTestId('chat-unread').innerText() : '(無い)');
  await wide.close();
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  for (const m of members) {
    await fetch(`${conn.url}/rest/v1/chat_messages?user_id=eq.${m.userId}`, { method: 'DELETE', headers: conn.svc });
  }
  let gone = true;
  for (const m of members) gone = (await removeMember(conn, m)) && gone;
  console.log(`\n検査用の会員・書き込みを消した: ${gone ? 'はい' : 'いいえ（要確認）'}`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
