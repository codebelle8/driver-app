/**
 * 書き込んだ日から1年を過ぎたチャットの書き込みが、データベースから消えるかを確かめる（2026-10-12）。
 *
 *   node tools/test-chat-retention.mjs                                       手元（アプリ 4291・管理画面 3100）
 *   node tools/test-chat-retention.mjs https://kurumayose-navi.vercel.app https://kurumayose-navi-admin.vercel.app
 *
 * ご回答（2026-10-08）「運営側でも期限を決めて消す（1年）」。プライバシーポリシー・
 * 利用規約 第15条第9項。仕掛け（cron）を置かず、アプリか管理画面が開かれたときに消す。
 *
 *   1. アプリを開くと、1年を過ぎた書き込みが消える（1年に満たないものは残る）
 *   2. 管理画面を開いても、1年を過ぎた書き込みが消える
 *   3. 操作履歴に「何件消したか」が残る（本文は残らない）
 *
 * 検査用の書き込みは、過去の日付で用意する。**最後に、検査用の会員・職員・
 * 書き込みと、この検査で増えた操作履歴を消す。**
 */
import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect, createMember, removeMember, signInOn } from './lib/member.mjs';

const APP = (process.argv[2] ?? 'http://localhost:4291').replace(/\/$/, '');
const ADMIN = (process.argv[3] ?? 'http://localhost:3100').replace(/\/$/, '');
const conn = connect();
const STAMP = String(Date.now()).slice(-6);
const PASSWORD = 'Hq7wTz3nRv9xLm';
const DAY = 24 * 60 * 60 * 1000;

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

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${conn.url}${path}`, {
    method,
    headers: prefer ? { ...conn.svc, Prefer: prefer } : conn.svc,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: r.ok, status: r.status, body: json };
}

const exists = async (body) =>
  ((await sb(`/rest/v1/chat_messages?select=id&body=eq.${encodeURIComponent(body)}`)).body ?? []).length > 0;

async function seed(writer, rows) {
  const r = await sb('/rest/v1/chat_messages', {
    method: 'POST',
    body: rows.map(([body, days]) => ({
      user_id: writer.userId,
      body,
      created_at: new Date(Date.now() - days * DAY).toISOString(),
    })),
  });
  if (!r.ok) throw new Error(`用意できません: ${r.status} ${JSON.stringify(r.body)}`);
}

async function waitGone(body, ms = 20_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (!(await exists(body))) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

let browser = null;
let staff = null;
const members = [];
let auditBefore = 0;

try {
  console.log(`チャットの1年での削除の検査: ${APP} / ${ADMIN}\n`);
  auditBefore = (await sb('/rest/v1/audit_logs?select=id&order=id.desc&limit=1')).body?.[0]?.id ?? 0;

  const writer = await createMember(conn, 'retain-w');
  const reader = await createMember(conn, 'retain-r');
  members.push(writer, reader);
  const OLD_APP = `1年の検査${STAMP}：400日前（アプリ）`;
  const KEEP = `1年の検査${STAMP}：300日前`;
  const OLD_ADMIN = `1年の検査${STAMP}：400日前（管理画面）`;

  browser = await chromium.launch({ channel: 'msedge' });

  /* ---- 1. アプリを開いたとき ---- */
  /* 書く会員の名簿を作る（書き込みは会員の行が要る） */
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    await signInOn(page, APP, writer);
    await ctx.close();
  }
  await seed(writer, [[OLD_APP, 400], [KEEP, 300]]);
  check('（用意）1年を過ぎた書き込みがある', await exists(OLD_APP));
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    await signInOn(page, APP, reader);
    check('アプリを開くと、1年を過ぎた書き込みが消える', await waitGone(OLD_APP));
    check('1年に満たない書き込みは残る', await exists(KEEP));
    await ctx.close();
  }

  /* ---- 2. 管理画面を開いたとき ---- */
  await seed(writer, [[OLD_ADMIN, 400]]);
  const email = `retain-staff-${STAMP}@kurumayose.invalid`;
  const u = await sb('/auth/v1/admin/users', { method: 'POST', body: { email, password: PASSWORD, email_confirm: true } });
  if (!u.body?.id) throw new Error(`職員を作れません: ${JSON.stringify(u.body).slice(0, 160)}`);
  staff = { id: u.body.id };
  await sb('/rest/v1/admin_profiles', { method: 'POST', body: { user_id: staff.id, display_name: `1年の検査${STAMP}`, role: 'editor' } });
  {
    const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1360, height: 1000 } });
    await ctx.addCookies([{ name: 'kn_locale', value: 'ja', domain: new URL(ADMIN).hostname, path: '/' }]);
    const page = await ctx.newPage();
    await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000);
    await page.goto(`${ADMIN}/chat?tab=all`, { waitUntil: 'networkidle' });
    check('管理画面を開いても、1年を過ぎた書き込みが消える', await waitGone(OLD_ADMIN));
    await ctx.close();
  }

  /* ---- 3. 操作履歴 ---- */
  const logs = (await sb(
    `/rest/v1/audit_logs?select=id,diff&id=gt.${auditBefore}&table_name=eq.chat_messages&action=eq.delete`,
  )).body ?? [];
  check('操作履歴に「何件消したか」が残る',
    logs.length >= 2 && logs.every((l) => typeof l.diff?.retention?.count === 'number'), JSON.stringify(logs));
  check('操作履歴に本文は残らない', !JSON.stringify(logs).includes('1年の検査'));
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  for (const m of members) {
    await sb(`/rest/v1/chat_messages?user_id=eq.${m.userId}`, { method: 'DELETE' });
  }
  if (staff) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${staff.id}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${staff.id}`, { method: 'DELETE' });
  }
  let gone = true;
  for (const m of members) gone = (await removeMember(conn, m)) && gone;
  /* この検査で増えた「1年を過ぎた書き込みを消した」の履歴（record_id を持たない） */
  const extra = await sb(
    `/rest/v1/audit_logs?id=gt.${auditBefore}&table_name=eq.chat_messages&action=eq.delete&actor_id=is.null`,
    { method: 'DELETE', prefer: 'return=representation' },
  );
  const purged = await purgeAuditLogs(sb, [staff?.id, ...members.map((m) => m.userId)]);
  console.log(`\n検査用の会員・職員・書き込みを消した: ${gone ? 'はい' : 'いいえ（要確認）'}` +
    `（操作履歴 ${(extra.body?.length ?? 0) + purged} 件）`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
