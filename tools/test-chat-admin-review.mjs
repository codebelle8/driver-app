/**
 * 管理画面のチャットの「要確認（自動の旗）」と「未確認」を確かめる（2026-10-08）。
 *
 *   node tools/test-chat-admin-review.mjs                                       手元（3100）
 *   node tools/test-chat-admin-review.mjs https://kurumayose-navi-admin.vercel.app
 *
 * ご指示（2026-10-08）「① 未確認だけを出す ② 怪しい書き込みに自動で旗を立てる」。
 *
 *   要確認
 *     1. 電話番号を含む書き込みが「要確認」に出て、「電話番号らしきもの」と添えてある
 *     2. ふつうの書き込みは「要確認」に出ない
 *     3. 左の柱の「チャット」の数に入る
 *     4. 「問題なし（旗を下ろす）」で「要確認」から消える
 *   未確認
 *     5. 新しい書き込みが「未確認」に出る
 *     6. 「ここまで確認した」で消える（数も 0 になる）
 *     7. そのあとに来た書き込みは、また「未確認」に出る
 *   8. 画面に誤りが出ない
 *
 * **「ここまで確認した」の印は、本番の職員で共有している。** 検査で進めた印は、
 * 最後に元の値へ戻す（本物の書き込みを、だれも読まないまま確認済みにしない）。
 *
 * **検査用の会員・職員・書き込みを作り、最後に消す**（操作履歴も消す）。
 */
import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect, createMember, removeMember } from './lib/member.mjs';

const ADMIN = (process.argv[2] ?? 'http://localhost:3100').replace(/\/$/, '');
const conn = connect();
const STAMP = String(Date.now()).slice(-6);
const PASSWORD = 'Hq7wTz3nRv9xLm';
const PHONE = `見張りの検査${STAMP}：電話は090-1234-5678まで`;
const PLAIN = `見張りの検査${STAMP}：ふつうの書き込み`;
const LATER = `見張りの検査${STAMP}：あとから来た書き込み`;

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

async function sb(path, { method = 'GET', body, prefer, token } = {}) {
  const headers = token
    ? { apikey: conn.anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { ...conn.svc };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${conn.url}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: r.ok, status: r.status, body: json };
}

let browser = null;
let staff = null;
let member = null;
let markBefore;

try {
  console.log(`管理画面の要確認・未確認の検査: ${ADMIN}\n`);
  const state = await sb('/rest/v1/chat_review_state?select=checked_until,checked_by,checked_at&id=eq.1');
  if (!state.ok) throw new Error('chat_review_state がありません（20261008000001 の前）');
  markBefore = state.body?.[0] ?? null;

  member = await createMember(conn, 'review');
  const tok = (await (await fetch(`${conn.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: member.email, password: member.password }),
  })).json()).access_token;
  await sb('/rest/v1/rpc/ensure_driver_profile', { method: 'POST', body: {}, token: tok });
  await sb(`/rest/v1/driver_profiles?user_id=eq.${member.userId}`, {
    method: 'PATCH',
    body: { display_name: `見張り検査${STAMP}` },
  });
  for (const body of [PHONE, PLAIN]) {
    const r = await sb('/rest/v1/chat_messages', { method: 'POST', body: { user_id: member.userId, body }, token: tok });
    if (!r.ok) throw new Error(`書き込めません: ${r.status} ${JSON.stringify(r.body)}`);
  }

  const email = `chat-review-${STAMP}@kurumayose.invalid`;
  const u = await sb('/auth/v1/admin/users', { method: 'POST', body: { email, password: PASSWORD, email_confirm: true } });
  if (!u.body?.id) throw new Error(`職員を作れません: ${JSON.stringify(u.body).slice(0, 160)}`);
  staff = { id: u.body.id };
  await sb('/rest/v1/admin_profiles', { method: 'POST', body: { user_id: staff.id, display_name: `見張り検査${STAMP}`, role: 'editor' } });

  browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'kn_locale', value: 'ja', domain: new URL(ADMIN).hostname, path: '/' }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);

  /* ---- 要確認 ---- */
  await page.goto(`${ADMIN}/chat?tab=flags`, { waitUntil: 'networkidle' });
  const card = (text) => page.getByTestId('admin-chat-message').filter({ hasText: text });
  const phoneCard = card(PHONE);
  check('電話番号を含む書き込みが「要確認」に出る', (await phoneCard.count()) === 1);
  check('「電話番号らしきもの」と添えてある',
    (await phoneCard.count()) === 1 && (await phoneCard.innerText()).includes('電話番号らしきもの'));
  check('ふつうの書き込みは「要確認」に出ない', (await card(PLAIN).count()) === 0);
  const navChat = page.getByRole('link', { name: /^チャット/ });
  const navText = (await navChat.count()) ? await navChat.first().innerText() : '';
  check('左の柱の「チャット」の数に入る', /\d+/.test(navText) && Number(navText.match(/\d+/)[0]) >= 1, navText);
  await phoneCard.getByRole('button', { name: '問題なし（旗を下ろす）' }).click();
  await page.waitForTimeout(3000);
  check('「問題なし（旗を下ろす）」で「要確認」から消える', (await card(PHONE).count()) === 0);
  const cleared = (await sb(`/rest/v1/chat_messages?select=flag_cleared_by,flags&body=eq.${encodeURIComponent(PHONE)}`)).body?.[0];
  check('誰が旗を下ろしたかが残り、旗の記録も残る',
    cleared?.flag_cleared_by === staff.id && cleared?.flags?.includes('phone'), JSON.stringify(cleared));

  /* ---- 未確認 ---- */
  await page.goto(`${ADMIN}/chat?tab=new`, { waitUntil: 'networkidle' });
  check('新しい書き込みが「未確認」に出る', (await card(PLAIN).count()) === 1 && (await card(PHONE).count()) === 1);
  const mark = page.getByRole('button', { name: /^ここまで確認した/ });
  /* 未確認が多いときは数回に分かれる。検査の書き込みが消えるまで押す */
  for (let i = 0; i < 5 && (await card(PLAIN).count()) > 0 && (await mark.count()) > 0; i++) {
    await mark.click();
    await page.waitForTimeout(3000);
  }
  check('「ここまで確認した」で「未確認」から消える', (await card(PLAIN).count()) === 0 && (await card(PHONE).count()) === 0);
  const tabNew = page.getByRole('link', { name: /^未確認/ });
  check('「未確認」の数が 0 になる', (await tabNew.innerText()).replace(/\s/g, '').endsWith('0'), await tabNew.innerText());

  const later = await sb('/rest/v1/chat_messages', { method: 'POST', body: { user_id: member.userId, body: LATER }, token: tok });
  if (!later.ok) throw new Error(`書き込めません: ${later.status}`);
  await page.waitForTimeout(6000);
  check('そのあとに来た書き込みは、また「未確認」に出る（読み直さずに）', (await card(LATER).count()) === 1);
  check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
  await ctx.close();
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  /* 「ここまで確認した」の印を元へ戻す（本番の職員で共有しているため） */
  if (markBefore !== undefined) {
    const back = await sb('/rest/v1/chat_review_state?id=eq.1', {
      method: 'PATCH',
      body: markBefore ?? { checked_until: null, checked_by: null, checked_at: null },
    });
    console.log(`  「ここまで確認した」の印を元に戻した: ${back.ok ? 'はい' : 'いいえ（要確認）'}`);
  }
  const touched = [];
  if (member) {
    const mine = await sb(`/rest/v1/chat_messages?select=id&user_id=eq.${member.userId}`);
    for (const r of mine.body ?? []) touched.push(r.id);
    await sb(`/rest/v1/chat_messages?user_id=eq.${member.userId}`, { method: 'DELETE' });
  }
  if (staff) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${staff.id}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${staff.id}`, { method: 'DELETE' });
  }
  const gone = member ? await removeMember(conn, member) : true;
  const purged = await purgeAuditLogs(sb, [...touched, staff?.id, member?.userId]);
  console.log(`\n検査用の会員・職員・書き込みを消した: ${gone ? 'はい' : 'いいえ（要確認）'}（操作履歴 ${purged} 件）`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
