/**
 * 管理画面のチャットに、新しい書き込み・通報が読み直さずに出るかを確かめる（2026-10-08）。
 *
 *   node tools/test-chat-admin-live.mjs                                       手元（3100）
 *   node tools/test-chat-admin-live.mjs https://admin.kurumayosenavi.com
 *
 * ご指摘「管理画面のチャットに、会員の書き込みがすぐ出ない」。
 *
 *   1. 「すべての書き込み」を開いたまま、会員が書き込む → 15 秒以内に出る
 *   2. 「通報（未対応）」を開いたまま、ほかの会員が通報する → 40 秒以内に出る
 *      （通報は合図を配らない表なので、一定の間隔の読み直しで拾う）
 *   3. そのあいだ、画面に誤りが出ない
 *
 * 職員は編集者で入る（管理者だけでなく、編集者にも合図が届くこと）。
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
const BODY = `管理画面の即時表示の検査 ${STAMP}`;

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

async function tokenOf(m) {
  const r = await fetch(`${conn.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: m.email, password: m.password }),
  });
  return (await r.json()).access_token;
}

/** 画面を読み直さずに、条件が満たされるまで待つ（何秒かかったかも返す） */
async function appears(fn, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return Math.round((Date.now() - start) / 1000);
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

let browser = null;
let staff = null;
const members = [];

try {
  console.log(`管理画面のチャットの即時表示の検査: ${ADMIN}\n`);

  /* 書く会員と、通報する会員 */
  const writer = await createMember(conn, 'live-w');
  const reporter = await createMember(conn, 'live-r');
  members.push(writer, reporter);
  const wTok = await tokenOf(writer);
  const rTok = await tokenOf(reporter);
  for (const tok of [wTok, rTok]) await sb('/rest/v1/rpc/ensure_driver_profile', { method: 'POST', body: {}, token: tok });
  await sb(`/rest/v1/driver_profiles?user_id=eq.${writer.userId}`, {
    method: 'PATCH',
    body: { display_name: `即時表示検査${STAMP}` },
  });

  /* 職員（編集者） */
  const email = `chat-live-${STAMP}@kurumayose.invalid`;
  const u = await sb('/auth/v1/admin/users', { method: 'POST', body: { email, password: PASSWORD, email_confirm: true } });
  if (!u.body?.id) throw new Error(`職員を作れません: ${JSON.stringify(u.body).slice(0, 160)}`);
  staff = { id: u.body.id };
  await sb('/rest/v1/admin_profiles', { method: 'POST', body: { user_id: staff.id, display_name: `即時表示検査${STAMP}`, role: 'editor' } });

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

  /* 1. すべての書き込み */
  await page.goto(`${ADMIN}/chat?tab=all`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const posted = await sb('/rest/v1/chat_messages', {
    method: 'POST',
    body: { user_id: writer.userId, body: BODY },
    token: wTok,
  });
  if (!posted.ok) throw new Error(`書き込めません: ${posted.status} ${JSON.stringify(posted.body)}`);
  /* 会員の鍵では書いた行を返してもらえない（列の権限）。id は職員側で引く */
  const messageId = (await sb(`/rest/v1/chat_messages?select=id&body=eq.${encodeURIComponent(BODY)}`)).body?.[0]?.id;
  const secPost = await appears(async () => (await page.getByText(BODY).count()) > 0, 15_000);
  check('会員の書き込みが、読み直さずに出る（15 秒以内）', secPost !== null, `出なかった`);
  if (secPost !== null) console.log(`        ${secPost} 秒で出た`);

  /* 2. 通報（未対応） */
  await page.goto(`${ADMIN}/chat`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const reported = await sb('/rest/v1/chat_reports', {
    method: 'POST',
    body: { message_id: messageId, reporter_id: reporter.userId },
    token: rTok,
  });
  if (!reported.ok) throw new Error(`通報できません: ${reported.status} ${JSON.stringify(reported.body)}`);
  const secReport = await appears(async () => (await page.getByText(BODY).count()) > 0, 40_000);
  check('通報が、読み直さずに「通報（未対応）」に出る（40 秒以内）', secReport !== null, '出なかった');
  if (secReport !== null) console.log(`        ${secReport} 秒で出た`);

  check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
  await ctx.close();
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  const touched = [];
  for (const m of members) {
    const mine = await sb(`/rest/v1/chat_messages?select=id&user_id=eq.${m.userId}`);
    for (const r of mine.body ?? []) touched.push(r.id);
    await sb(`/rest/v1/chat_messages?user_id=eq.${m.userId}`, { method: 'DELETE' });
  }
  if (staff) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${staff.id}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${staff.id}`, { method: 'DELETE' });
  }
  let gone = true;
  for (const m of members) gone = (await removeMember(conn, m)) && gone;
  const purged = await purgeAuditLogs(sb, [...touched, staff?.id, ...members.map((m) => m.userId)]);
  console.log(`\n検査用の会員・職員・書き込みを消した: ${gone ? 'はい' : 'いいえ（要確認）'}（操作履歴 ${purged} 件）`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
