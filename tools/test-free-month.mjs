/**
 * 毎月の上位の翌月無料を確かめる（2026-10-06）。
 *
 *   node tools/test-free-month.mjs                                     手元（アプリ 4291・管理画面 3100）
 *   node tools/test-free-month.mjs https://app.kurumayosenavi.com https://admin.kurumayosenavi.com
 *
 * **数え方と締めそのもの**（上位・最低件数・月の区切り・二重に締めない・お支払いの
 * 延長）は、手元の検証用データベースで確かめている（db/tests/0008_free_month_tests.sql）。
 * 本番の月を締め直すと、本物の会員の無料に触れるため、ここではしない。
 *
 * ここでは、**無料の記録がある方の画面**を見る。本物の月と混ざらないよう、
 * 検証用の月（2000-01）の記録を作り、最後に消す。
 *
 *   アプリ
 *     1. 無料期間が切れていても締め出されない
 *     2. 設定・お支払いの画面に「○月○日まで無料（情報提供の上位）」。料金の選択を出さない
 *     3. ランキングに「先月の上位に入られたため…まで無料」と、翌月無料の決まり
 *     4. 前の月を締める関数を会員が呼べる（何度呼んでも構わない）
 *   管理画面
 *     5. 会員の一覧で「無料（上位）」
 *     6. サイト設定に人数・最低件数の欄（いまの値が入っている）
 *     7. 情報提供の画面に「毎月の上位（翌月無料）」と、その月の無料の方
 *
 * **検査用の会員・職員・記録を作り、最後に消す**（操作履歴も消す）。
 */
import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const APP = (process.argv[2] ?? 'http://localhost:4291').replace(/\/$/, '');
const ADMIN = (process.argv[3] ?? 'http://localhost:3100').replace(/\/$/, '');
const conn = connect();
const STAMP = String(Date.now()).slice(-6);
const TEST_MONTH = '2000-01';
const PASSWORD = 'Hq7wTz3nRv9xLm';

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
    headers: { ...conn.svc, ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
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

async function tokenOf(member) {
  const r = await fetch(`${conn.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: member.email, password: member.password }),
  });
  return (await r.json()).access_token;
}

/** 日本時間の「M月D日」 */
const jpDay = (iso) => {
  const d = new Date(new Date(iso).getTime() - 1 + 9 * 3600e3);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
};

let browser = null;
let member = null;
let admin = null;

try {
  console.log(`翌月無料の検査: アプリ ${APP} ／ 管理画面 ${ADMIN}\n`);
  member = await createMember(conn, 'freemonth');
  browser = await chromium.launch({ channel: 'msedge' });

  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signInOn(page, APP, member);
  await sb(`/rest/v1/driver_profiles?user_id=eq.${member.userId}`, {
    method: 'PATCH',
    body: { display_name: `翌月無料検査${STAMP}`, trial_ends_at: '2026-01-01T00:00:00Z' },
  });

  /* 検証用の月の無料の記録（いまを挟む期間） */
  const until = new Date(Date.now() + 2 * 86400e3).toISOString();
  await sb('/rest/v1/free_months', { method: 'POST', body: { month: TEST_MONTH, top_count: 20, min_accepted: 3, winners: 1 } });
  const g = await sb('/rest/v1/free_grants', {
    method: 'POST',
    body: {
      month: TEST_MONTH, user_id: member.userId, rank: 1, accepted: 7,
      free_from: new Date(Date.now() - 3600e3).toISOString(), free_until: until,
    },
  });
  check('検証用の無料の記録を作れる', g.ok, JSON.stringify(g.body).slice(0, 160));
  const day = jpDay(until);

  /* =================================================================== */
  console.log('--- アプリ ---');
  /* =================================================================== */
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await skipIntro(page);
  await page.waitForTimeout(1500);
  check('無料期間が切れていても締め出されない', !page.url().includes('/mypage'), page.url());

  await page.goto(`${APP}/mypage`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const mypage = await page.locator('body').innerText();
  check(`設定に「情報提供の上位のため、${day}まで無料です」`, mypage.includes(`情報提供の上位のため、${day}まで無料です`),
    mypage.slice(0, 240));

  await page.goto(`${APP}/plan`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const plan = await page.locator('body').innerText();
  check(`お支払いの画面に「無料（${day}まで・情報提供の上位）」`, plan.includes(`無料（${day}まで・情報提供の上位）`), plan.slice(0, 240));
  check('お支払いが要らないことを書いてある', plan.includes('お支払いの手続きは要りません'));
  check('料金の選択を出さない', (await page.locator('[role="radiogroup"]').count()) === 0);

  await page.goto(`${APP}/ranking`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const free = page.getByTestId('ranking-free');
  check('ランキングに「先月の上位に入られたため…まで無料」',
    (await free.count()) === 1 && (await free.innerText()).includes(`${day}まで無料`),
    (await free.count()) ? await free.innerText() : '(無い)');
  const rk = await page.locator('body').innerText();
  check('翌月無料の決まり（人数・件数）が書いてある', /採用\d+件以上で上位\d+名の方は、翌月の1か月が無料/.test(rk), rk.slice(-300));
  check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
  await ctx.close();

  /* 会員が前の月を締める関数を呼べる（何度でも） */
  const token = await tokenOf(member);
  const call = () =>
    fetch(`${conn.url}/rest/v1/rpc/settle_free_month`, {
      method: 'POST',
      headers: { apikey: conn.anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  const first = await call();
  const second = await call();
  const secondBody = await second.text();
  check('会員は「前の月を締める」を呼べる', first.ok, String(first.status));
  check('2回目は何もしない（同じ月は締め直さない）', second.ok && secondBody.trim() === 'null', secondBody);
  const atTime = await fetch(`${conn.url}/rest/v1/rpc/settle_free_month_at`, {
    method: 'POST',
    headers: { apikey: conn.anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_now: '2030-01-01T00:00:00Z' }),
  });
  check('会員は好きな時刻で締められない', !atTime.ok, String(atTime.status));

  /* =================================================================== */
  console.log('\n--- 管理画面 ---');
  /* =================================================================== */
  {
    const email = `free-admin-${STAMP}@kurumayose.invalid`;
    const r = await sb('/auth/v1/admin/users', { method: 'POST', body: { email, password: PASSWORD, email_confirm: true } });
    admin = { id: r.body?.id, email };
    await sb('/rest/v1/admin_profiles', { method: 'POST', body: { user_id: admin.id, display_name: '翌月無料検査・管理者', role: 'admin' } });

    const actx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1360, height: 1000 } });
    await actx.addCookies([{ name: 'kn_locale', value: 'ja', domain: new URL(ADMIN).hostname, path: '/' }]);
    const ap = await actx.newPage();
    await ap.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
    await ap.fill('input[name="email"]', email);
    await ap.fill('input[name="password"]', PASSWORD);
    await ap.click('button[type="submit"]');
    await ap.waitForTimeout(4000);

    let row = null;
    for (let p = 1; p <= 10 && !row; p++) {
      await ap.goto(`${ADMIN}/members${p > 1 ? `?page=${p}` : ''}`, { waitUntil: 'networkidle' });
      await ap.waitForTimeout(800);
      const hit = ap.locator('tr', { hasText: member.email });
      if (await hit.count()) row = (await hit.first().innerText()).replace(/\s+/g, ' ');
      else if (!(await ap.locator('body').innerText()).includes('次へ')) break;
    }
    check('会員の一覧で「無料（上位）」', !!row && row.includes('無料（上位）') && !row.includes('超過'), String(row));

    await ap.goto(`${ADMIN}/site`, { waitUntil: 'networkidle' });
    await ap.waitForTimeout(1200);
    const top = ap.locator('input[name="free_top_count"]');
    const min = ap.locator('input[name="free_min_accepted"]');
    check('サイト設定に人数・最低件数の欄（いまの値）',
      (await top.count()) === 1 && /^\d+$/.test(await top.inputValue()) && /^\d+$/.test(await min.inputValue()),
      `${(await top.count()) ? await top.inputValue() : '-'} / ${(await min.count()) ? await min.inputValue() : '-'}`);

    await ap.goto(`${ADMIN}/submissions`, { waitUntil: 'networkidle' });
    await ap.waitForTimeout(1500);
    const sub = await ap.locator('body').innerText();
    check('情報提供の画面に「毎月の上位（翌月無料）」', sub.includes('毎月の上位（翌月無料）'));
    check('その月の無料の方が出る', sub.includes('2000年1月の上位') && sub.includes(`翌月無料検査${STAMP}`), sub.slice(0, 400));
    await actx.close();
  }
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  await sb(`/rest/v1/free_months?month=eq.${TEST_MONTH}`, { method: 'DELETE' });
  if (admin?.id) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${admin.id}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${admin.id}`, { method: 'DELETE' });
  }
  const gone = await removeMember(conn, member);
  const left = await sb(`/rest/v1/free_months?select=month&month=eq.${TEST_MONTH}`);
  const purged = await purgeAuditLogs(sb, [admin?.id, member?.userId]);
  console.log(`\n検査用の会員・職員・記録を消した: ${gone && (left.body ?? []).length === 0 ? 'はい' : 'いいえ（要確認）'}（操作履歴 ${purged} 件）`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
