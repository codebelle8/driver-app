/**
 * 運営者のアカウント（osa603mu@yahoo.co.jp・上野修さん）が無料かを確かめる（2026-10-07）。
 *
 *   node tools/test-operator-free.mjs                                       手元（3100）
 *   node tools/test-operator-free.mjs https://admin.kurumayosenavi.com
 *
 * ご指示「osa603mu@yahoo.co.jp のアカウントは、有料版でも無料のままにする」。
 *
 *   1. データベースが「運営者のため無料（期限なし）」と判断する
 *   2. 管理画面の会員の一覧で「無料（運営者）」と出る
 *   3. 削除・停止・降格されない保護（所有者だけのもの）は付いていない
 *
 * ご本人のアカウントには触れない（読むだけ）。アプリへのログインはしない
 * （パスワードを持たない）。アプリの出し方は、所有者と同じ道を通るため、
 * test-surveyor-free / test-free-month で見ている。
 *
 * **検査用の職員を作り、最後に消す**（作ったときの操作履歴も消す）。
 */
import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect } from './lib/member.mjs';

const ADMIN = (process.argv[2] ?? 'http://localhost:3100').replace(/\/$/, '');
const conn = connect();
const STAMP = String(Date.now()).slice(-6);
const PASSWORD = 'Hq7wTz3nRv9xLm';
const TARGET = 'osa603mu@yahoo.co.jp';

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

let browser = null;
let staff = null;

try {
  console.log(`運営者のアカウントの無料の検査: ${ADMIN}\n`);
  const users = (await sb('/auth/v1/admin/users?per_page=200')).body?.users ?? [];
  const target = users.find((u) => u.email?.toLowerCase() === TARGET);
  if (!target) throw new Error('対象のアカウントが見つかりません');
  const profile = (await sb(`/rest/v1/driver_profiles?select=member_no&user_id=eq.${target.id}`)).body?.[0];

  const reason = (await sb('/rest/v1/rpc/free_reason_of', { method: 'POST', body: { p_user: target.id } })).body;
  check('データベースが「運営者のため無料（期限なし）」と判断する', reason === 'owner', JSON.stringify(reason));

  /* 管理画面の会員の一覧 */
  const email = `operator-free-${STAMP}@kurumayose.invalid`;
  const u = await sb('/auth/v1/admin/users', { method: 'POST', body: { email, password: PASSWORD, email_confirm: true } });
  if (!u.body?.id) throw new Error(`職員を作れません: ${JSON.stringify(u.body).slice(0, 160)}`);
  staff = { id: u.body.id };
  await sb('/rest/v1/admin_profiles', { method: 'POST', body: { user_id: staff.id, display_name: `運営者無料検査${STAMP}`, role: 'admin' } });

  browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'kn_locale', value: 'ja', domain: new URL(ADMIN).hostname, path: '/' }]);
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  await page.goto(`${ADMIN}/members`, { waitUntil: 'networkidle' });
  const row = page.locator('tbody tr').filter({ hasText: TARGET });
  const rowText = (await row.count()) ? await row.first().innerText() : '';
  check(`管理画面の会員の一覧で「無料（運営者）」と出る（会員番号 ${profile?.member_no}）`,
    rowText.includes('無料（運営者）'), rowText.replace(/\s+/g, ' ').slice(0, 160));

  /* 保護は所有者だけ（職員の一覧で「所有者」の印が付かない） */
  await page.goto(`${ADMIN}/accounts`, { waitUntil: 'networkidle' });
  const staffRow = page.locator('tr, li').filter({ hasText: TARGET });
  const staffText = (await staffRow.count()) ? await staffRow.first().innerText() : '';
  check('削除・停止・降格されない保護（所有者の印）は付いていない',
    !!staffText && !staffText.includes('所有者'), staffText.replace(/\s+/g, ' ').slice(0, 160));
  await ctx.close();
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (staff) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${staff.id}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${staff.id}`, { method: 'DELETE' });
    const purged = await purgeAuditLogs(sb, [staff.id]);
    console.log(`\n検査用の職員を消した（操作履歴 ${purged} 件）`);
  }
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
