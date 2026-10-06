/**
 * チャットのオンライン状態を確かめる（2026-10-06）。
 *
 *   node tools/test-chat-presence.mjs                                 手元（4291）
 *   node tools/test-chat-presence.mjs https://kurumayose-navi.vercel.app
 *
 * ご指示「チャットで、アイコンの横にオンライン状態を出す」。
 *
 * 見るもの
 *   1. アプリを開いているほかの方の書き込みに、オンラインの印が付く
 *   2. 「いまオンライン ○人」が出る
 *   3. その方がアプリを閉じると、印が消える
 *   4. 設定で「オンライン状態を出さない」にすると、印が消える（戻すと付く）
 *   5. 書き込みの目印に、会員の id は出ない
 *
 * **検査用の会員・書き込みを作り、最後に消す。**
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const APP = (process.argv[2] ?? 'http://localhost:4291').replace(/\/$/, '');
const conn = connect();
const STAMP = String(Date.now()).slice(-6);
const POST_B = `検査 ${STAMP}：オンラインの印を見る`;

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

async function waitFor(fn, ms = 60_000) {
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
  console.log(`チャットのオンライン状態の検査: ${APP}\n`);
  const a = await createMember(conn, 'presence-a');
  const b = await createMember(conn, 'presence-b');
  members.push(a, b);
  browser = await chromium.launch({ channel: 'msedge' });

  /* B が入り、書き込む（アプリは開いたまま＝オンライン） */
  let bCtx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  let bPage = await bCtx.newPage();
  await signInOn(bPage, APP, b);
  await fetch(`${conn.url}/rest/v1/driver_profiles?user_id=eq.${b.userId}`, {
    method: 'PATCH',
    headers: conn.svc,
    body: JSON.stringify({ display_name: `オンライン検査B${STAMP}` }),
  });
  const tokenB = await tokenOf(b);
  const posted = await fetch(`${conn.url}/rest/v1/chat_messages`, {
    method: 'POST',
    headers: { apikey: conn.anon, Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: b.userId, body: POST_B }),
  });
  if (!posted.ok) throw new Error(`検査用の書き込みができません: ${posted.status} ${await posted.text()}`);

  /* A が情報交換を開く */
  const aCtx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const aPage = await aCtx.newPage();
  const errors = [];
  aPage.on('pageerror', (e) => errors.push(e.message));
  await signInOn(aPage, APP, a);
  await aPage.goto(`${APP}/chat-room`, { waitUntil: 'networkidle' });
  await aPage.waitForTimeout(3000);
  await skipIntro(aPage);
  const bRow = () => aPage.getByTestId('chat-message').filter({ hasText: POST_B });
  const dotOn = async () => (await bRow().getByTestId('online-dot').count()) === 1;

  check('アプリを開いているほかの方の書き込みに、オンラインの印が付く', await waitFor(dotOn, 30_000));
  const count = aPage.getByTestId('online-count');
  const n = (await count.count()) ? Number(((await count.innerText()).match(/\d+/) ?? ['0'])[0]) : 0;
  check('「いまオンライン ○人」が出る（2人以上）', n >= 2, String(n));

  const feed = await (await fetch(`${conn.url}/rest/v1/rpc/chat_feed`, {
    method: 'POST',
    headers: { apikey: conn.anon, Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' },
    body: '{}',
  })).json();
  check('書き込みの目印に、会員の id は出ない', !JSON.stringify(feed).includes(b.userId) && !!feed.me?.key);

  /* B がアプリを閉じる → 印が消える */
  await bCtx.close();
  check('その方がアプリを閉じると、印が消える（60秒以内）', await waitFor(async () => !(await dotOn())));

  /* B がもう一度開き、設定で出さないにする → 消える。戻すと付く */
  bCtx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  bPage = await bCtx.newPage();
  await signInOn(bPage, APP, b);
  check('もう一度開くと、印が付く', await waitFor(dotOn, 30_000));
  await bPage.goto(`${APP}/mypage`, { waitUntil: 'networkidle' });
  await bPage.waitForTimeout(3000);
  const toggle = bPage.getByRole('switch', { name: 'チャットでオンライン状態を出さない' });
  check('設定に「チャットでオンライン状態を出さない」がある', (await toggle.count()) === 1);
  await toggle.click();
  check('出さないにすると、印が消える', await waitFor(async () => !(await dotOn()), 30_000));
  await toggle.click();
  check('戻すと、印が付く', await waitFor(dotOn, 30_000));
  check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
  await bCtx.close();
  await aCtx.close();
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
