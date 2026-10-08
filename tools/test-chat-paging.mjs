/**
 * チャットを10日ずつ読み、90日で会員の画面から外れることを確かめる（2026-10-08）。
 *
 *   node tools/test-chat-paging.mjs                                 手元（4291）
 *   node tools/test-chat-paging.mjs https://kurumayose-navi.vercel.app
 *
 * ご指示「90日を過ぎたら会員の画面から外す。最初は10日ぶん、上へスクロールしたら
 * 前を取りに行く」。
 *
 *   1. 開いたときは直近の10日ぶん（11日前の書き込みは出ていない）
 *   2. 上へスクロールすると、その前を読み足す（11日前・25日前…が出る）
 *   3. 読み足しても、見ていた書き込みが画面から飛ばない
 *   4. いちばん上まで行くと 89日前まで出て、91日前・100日前は出ない
 *   5. 「これより前の書き込みはありません（90日を過ぎた…）」と出る
 *   6. 画面に誤りが出ない
 *
 * 検査用の書き込みは、過去の日付で用意する（0〜12日前に2件ずつ、その先は
 * ところどころ）。**最後に消す。**
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const APP = (process.argv[2] ?? 'http://localhost:4291').replace(/\/$/, '');
const conn = connect();
const STAMP = String(Date.now()).slice(-6);
const TAG = `保存期間の検査${STAMP}`;

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

const DAY = 24 * 60 * 60 * 1000;
/* 何日前に置くか（1時間ずらして、日の境目に乗らないようにする） */
const SEED_DAYS = [
  ...Array.from({ length: 13 }, (_, d) => [d, d]).flat(),
  15, 25, 35, 45, 55, 65, 75, 85, 89, 91, 95, 100,
];
const label = (d, i) => `${TAG} ${d}日前 #${i}`;

let browser = null;
const members = [];

try {
  console.log(`チャットの保存期間と読み足しの検査: ${APP}\n`);
  const writer = await createMember(conn, 'paging-w');
  const reader = await createMember(conn, 'paging-r');
  members.push(writer, reader);

  /* 書く会員の名簿を作ってから、過去の日付で書き込みを用意する（職員の鍵で） */
  const wTok = (await (await fetch(`${conn.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: writer.email, password: writer.password }),
  })).json()).access_token;
  await fetch(`${conn.url}/rest/v1/rpc/ensure_driver_profile`, {
    method: 'POST',
    headers: { apikey: conn.anon, Authorization: `Bearer ${wTok}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const now = Date.now();
  const rows = SEED_DAYS.map((d, i) => ({
    user_id: writer.userId,
    body: label(d, i),
    created_at: new Date(now - d * DAY - 60 * 60 * 1000).toISOString(),
  }));
  const seeded = await fetch(`${conn.url}/rest/v1/chat_messages`, {
    method: 'POST',
    headers: conn.svc,
    body: JSON.stringify(rows),
  });
  if (!seeded.ok) throw new Error(`用意できません: ${seeded.status} ${await seeded.text()}`);

  browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signInOn(page, APP, reader);
  await page.goto(`${APP}/chat-room`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await skipIntro(page);
  await page.waitForTimeout(1500);

  const seen = async (d) => (await page.getByText(new RegExp(`${TAG} ${d}日前 #`)).count()) > 0;

  check('開いたときは直近の10日ぶん（9日前は出ている）', await seen(9));
  check('開いたときは、11日前の書き込みは出ていない', !(await seen(11)));

  /*
    上へスクロールして読み足す。いま読んであるいちばん古い書き込み（目印）が、
    読み足したあとも画面に残っているか（下へ押し出されていないか）も見る。
  */
  const oldest = page.getByTestId('chat-message').filter({ hasText: TAG }).first();
  const anchorText = (await oldest.innerText()).split('\n').find((l) => l.includes(TAG)) ?? '';
  const anchor = anchorText ? page.getByText(anchorText, { exact: true }) : null;
  const scrollTop = async () => {
    await page.getByTestId('chat-message').first().scrollIntoViewIfNeeded();
    await page.mouse.move(210, 400);
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(2500);
  };
  await scrollTop();
  check('上へスクロールすると、その前を読み足す（11日前が出る）', await seen(11));
  if (anchor && (await anchor.count())) {
    const box = await anchor.first().boundingBox();
    check('読み足しても、見ていた書き込みが画面から飛ばない',
      !!box && box.y > -40 && box.y < 900, JSON.stringify(box));
  }

  for (let i = 0; i < 15 && !(await page.getByTestId('chat-no-older').count()); i++) await scrollTop();
  check('いちばん上まで行くと、89日前まで出る', await seen(89));
  check('91日前・100日前の書き込みは出ない', !(await seen(91)) && !(await seen(100)));
  const end = page.getByTestId('chat-no-older');
  check('「これより前の書き込みはありません（90日を過ぎた…）」と出る',
    (await end.count()) === 1 && (await end.innerText()).includes('90日'));
  check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
  await ctx.close();
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
