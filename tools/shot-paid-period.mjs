/**
 * 直したところを、そのまま見られるようにする。
 *
 *   node tools/shot-paid-period.mjs
 *   node tools/shot-paid-period.mjs --app https://app.kurumayosenavi.com \
 *                                   --admin https://admin.kurumayosenavi.com
 *
 * **なぜ要るか**
 *   「ご利用期間 残り ◯か月 ◯日」は、期限を持っている方にしか出ない。
 *   いまご利用中の方は期限を持っていないため（この仕組みより前からの方）、
 *   ご自身の画面を開いても、直したところが見えない。
 *
 *   **本番の会員には触れない。** 検査用の会員をその都度作り、
 *   その画面を写して、最後に消す。
 *
 * 出来上がりは tools/screenshots/ に置く。
 */
import { mkdirSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const NL = String.fromCharCode(10);
const OUT = 'tools/screenshots';

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  const raw = (i >= 0 ? argv[i + 1] : undefined) ?? fallback;
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};
const APP = argOf('--app', 'http://localhost:4190');
const ADMIN = argOf('--admin', 'http://localhost:3100');
const ADMIN_HOST = new URL(ADMIN).hostname;

const conn = connect();
const day = 86_400_000;

/* 端数が出る長さにする。ちょうど3か月だと「3か月」としか出ない。 */
const PAID_DAYS = 118;

const STAFF_EMAIL = 'shot-paid-staff@kurumayose.invalid';
const STAFF_PASSWORD = 'Zx4mQ8tRv2wKp6';

const sb = async (path, { method = 'GET', body } = {}) => {
  const r = await fetch(`${conn.url}${path}`, {
    method,
    headers: conn.svc,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let b = null;
  try {
    b = t ? JSON.parse(t) : null;
  } catch {
    b = t;
  }
  return { ok: r.ok, body: b };
};

mkdirSync(OUT, { recursive: true });

let browser = null;
let member = null;
let staffId = null;

try {
  member = await createMember(conn, 'shot');
  console.log(`  用意  検査用の会員 ${member.email}`);

  browser = await chromium.launch();

  /* --- アプリ --- */
  const ctx = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  /* 先に入って名簿の行を作らせてから、期限を入れる */
  await signInOn(page, APP, member, { goto: '/mypage' });
  await sb(`/rest/v1/driver_profiles?user_id=eq.${member.userId}`, {
    method: 'PATCH',
    body: {
      status: 'active',
      plan: 'yearly',
      plan_chosen_at: new Date().toISOString(),
      paid_until: new Date(Date.now() + PAID_DAYS * day).toISOString(),
    },
  });

  /*
    開き直すたびに導入の映像が流れ、画面をふさぐ。写す前に飛ばす。
    飛ばさずに写して、**中身が1枚も写っていないことがあった。**
  */
  await page.goto(`${APP}/mypage`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await skipIntro(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/paid-01-mypage.png` });
  console.log(`  写し  ${OUT}/paid-01-mypage.png`);

  await page.goto(`${APP}/plan`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await skipIntro(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/paid-02-plan.png` });
  console.log(`  写し  ${OUT}/paid-02-plan.png`);

  /* 期限が過ぎたとき */
  await sb(`/rest/v1/driver_profiles?user_id=eq.${member.userId}`, {
    method: 'PATCH',
    body: { paid_until: new Date(Date.now() - 2 * day).toISOString() },
  });
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await skipIntro(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/paid-03-expired.png` });
  console.log(`  写し  ${OUT}/paid-03-expired.png`);

  /* 元へ戻してから、管理画面を写す */
  await sb(`/rest/v1/driver_profiles?user_id=eq.${member.userId}`, {
    method: 'PATCH',
    body: { paid_until: new Date(Date.now() + PAID_DAYS * day).toISOString() },
  });
  await ctx.close();

  /* --- 管理画面 --- */
  const stale = (await sb('/auth/v1/admin/users?page=1&per_page=200')).body?.users ?? [];
  for (const u of stale.filter((x) => x.email === STAFF_EMAIL)) {
    await sb(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
  }
  staffId = (
    await sb('/auth/v1/admin/users', {
      method: 'POST',
      body: { email: STAFF_EMAIL, password: STAFF_PASSWORD, email_confirm: true },
    })
  ).body?.id;
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: staffId, display_name: '写しの検査', role: 'admin' },
  });

  const actx = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 1440, height: 900 },
  });
  await actx.addCookies([{ name: 'kn_locale', value: 'ja', domain: ADMIN_HOST, path: '/' }]);
  const admin = await actx.newPage();
  await admin.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await admin.fill('input[name="email"]', STAFF_EMAIL);
  await admin.fill('input[name="password"]', STAFF_PASSWORD);
  await admin.click('button[type="submit"]');
  await admin.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });

  await admin.goto(`${ADMIN}/members`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(2500);

  /*
    一覧の表そのものを写す。ページ全体を写すと、上の受取口座の欄で
    埋まり、**肝心の「あと◯か月 ◯日」が入らない。**
  */
  const table = admin.locator('table').first();
  await table.scrollIntoViewIfNeeded();
  await admin.waitForTimeout(800);
  await table.screenshot({ path: `${OUT}/paid-04-members.png` });
  console.log(`  写し  ${OUT}/paid-04-members.png`);

  await actx.close();
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (member) await removeMember(conn, member);
  if (staffId) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${staffId}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${staffId}`, { method: 'DELETE' });
  }
  const gone = await purgeAuditLogs(sb, [member?.userId, staffId]);
  console.log(`${NL}  片付け  検査用の会員と職員を消しました（操作履歴 ${gone} 件）`);
}
