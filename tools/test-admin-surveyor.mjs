/**
 * 管理画面で、アプリの会員を調査員にする（やめる）操作を確かめる。
 *
 *   node tools/test-admin-surveyor.mjs                                手元（localhost:3000）
 *   node tools/test-admin-surveyor.mjs https://admin.kurumayosenavi.com
 *
 * **なぜ要るか**（ご指示 2026-11-01「管理者が、通常の会員を調査員にできるように」）
 *   それまで調査員は「アカウント」の画面で新しく発行するしかなく、アプリに
 *   登録済みのアドレスでは「既に登録されています」で止まった。
 *   「会員・お支払い」の行から、会員のまま調査員にできるようにした。
 *
 * **何を見るか**
 *   * 会員の行に「調査員にする」が出る。押すと確かめる札が出て、やめれば何も変わらない
 *   * 決めると「無料（調査員）」になり、権限の行ができる。操作履歴に押した管理者が残る
 *   * その会員が、いまのパスワードのまま管理画面に入れる（会員・お支払いは開けない）
 *   * アプリでも無料になる（データベースの my_free_access が「調査員」と答える）
 *   * 「アカウント」の画面で会員のアドレスを発行しようとすると、この入口へ案内する
 *   * 「調査員をやめる」で通常の会員に戻る。会員のアカウントと会員の行は残る
 *   * 停止中の会員には「調査員にする」を出さない
 *
 * **本番のデータには触れない。** 検査用の管理者と会員をその都度作り、最後に消す。
 * 自動で書かれた操作履歴も消す。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';

const NL = String.fromCharCode(10);
const raw = process.argv[2] ?? 'http://localhost:3000';
const BASE = raw.endsWith('/') ? raw.slice(0, -1) : raw;
const HOST = new URL(BASE).hostname;

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(NL)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv('admin/.env.local');
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SB || !KEY || !ANON) throw new Error('接続先または鍵がありません');

const sb = async (path, { method = 'GET', body, prefer } = {}) => {
  const r = await fetch(`${SB}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let b = null;
  try {
    b = t ? JSON.parse(t) : null;
  } catch {
    b = t;
  }
  return { ok: r.ok, status: r.status, body: b };
};

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}`);
    if (detail) console.error(`        ${detail}`);
  }
};

const stamp = Date.now();
const ADMIN_EMAIL = `sv-admin-${stamp}@kurumayose.invalid`;
const MEMBER_EMAIL = `sv-member-${stamp}@example.com`;
const BLOCKED_EMAIL = `sv-blocked-${stamp}@example.com`;
const PASSWORD = 'Hq7wTz3nRv9xLm';
const MEMBER_NAME = `検査会員${String(stamp).slice(-4)}`;

const made = { admin: null, member: null, blocked: null };

async function makeUser(email, { staff = null, driver = null } = {}) {
  const r = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password: PASSWORD, email_confirm: true },
  });
  const id = r.body?.id;
  if (!id) throw new Error(`${email} を作れません: ${JSON.stringify(r.body).slice(0, 160)}`);
  if (staff) {
    await sb('/rest/v1/admin_profiles', {
      method: 'POST',
      body: { user_id: id, display_name: staff.name, role: staff.role },
    });
  }
  /* アプリを一度開いた会員と同じ状態（会員の行がある） */
  if (driver) {
    await sb('/rest/v1/driver_profiles', {
      method: 'POST',
      body: {
        user_id: id,
        display_name: driver.name ?? null,
        status: driver.status ?? 'trial',
        trial_ends_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
    });
  }
  return id;
}

let browser = null;
const contexts = [];

async function freshPage() {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'kn_locale', value: 'ja', domain: HOST, path: '/' }]);
  contexts.push(ctx);
  return ctx.newPage();
}

async function signIn(page, email, password = PASSWORD) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  /* 手元の開発用サーバーは、初めて開く画面の組み立てに十数秒かかる */
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {});
  /*
    落ち着いてから見る。職員でない方は、いったん中（/）へ送られてから
    入口へ戻される。途中の住所で判断すると「入れた」と読み違える
  */
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);
  return !new URL(page.url()).pathname.startsWith('/login');
}

const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ');

/** 会員・お支払いで、そのアドレスの行を探す（ページを送りながら） */
async function rowOf(page, email) {
  for (let p = 1; p <= 20; p++) {
    await page.goto(`${BASE}/members${p > 1 ? `?page=${p}` : ''}`, { waitUntil: 'networkidle' });
    const row = page.locator(`tr:has(a[href="mailto:${email}"])`);
    if (await row.count()) return row;
    /* ページ送りの「1 / 3」。無ければ1ページだけ */
    const pager = page.locator('nav span.tabular');
    if (!(await pager.count())) break;
    const [cur, last] = (await pager.first().innerText()).split('/').map((s) => Number(s.trim()));
    if (!(cur < last)) break;
  }
  return null;
}

const profileOf = async (id) => (await sb(`/rest/v1/admin_profiles?user_id=eq.${id}&select=*`)).body?.[0] ?? null;

try {
  console.log(`会員を調査員にする検査: ${BASE}${NL}`);

  made.admin = await makeUser(ADMIN_EMAIL, { staff: { name: '調査員検査・管理者', role: 'admin' } });
  made.member = await makeUser(MEMBER_EMAIL, { driver: { name: MEMBER_NAME } });
  made.blocked = await makeUser(BLOCKED_EMAIL, { driver: { status: 'blocked' } });
  console.log('  用意  検査用の管理者1名と、会員2名（うち1名は停止中）を作りました');

  browser = await chromium.launch();
  const page = await freshPage();
  check('管理者で入れる', await signIn(page, ADMIN_EMAIL));

  /* ===================================================================== */
  console.log(`${NL}--- 調査員にする ---`);
  /* ===================================================================== */
  let row = await rowOf(page, MEMBER_EMAIL);
  check('会員の行が出る', !!row, `${page.url()} ${(await text(page.locator('body'))).slice(0, 300)}`);
  const make = row.getByRole('button', { name: '調査員にする' });
  check('会員の行に「調査員にする」が出る', (await make.count()) === 1);

  await make.click();
  let dialog = page.locator('[data-testid="confirm-card"]');
  await dialog.waitFor({ timeout: 5000 });
  const dialogText = await text(dialog);
  check('押すと、確かめる札が出る（名前と、できるようになることが書いてある）', dialogText.includes(MEMBER_NAME) && dialogText.includes('管理画面'), dialogText.slice(0, 200));
  await page.locator('[data-testid="confirm-cancel"]').click();
  await page.waitForTimeout(1500);
  check('「キャンセル」なら、何も変わらない', (await profileOf(made.member)) === null);

  await make.click();
  await page.locator('[data-testid="confirm-accept"]').click();
  await page.waitForTimeout(4000);
  const prof = await profileOf(made.member);
  check(
    '決めると、調査員の権限ができる（名前は会員の表示名）',
    prof?.role === 'surveyor' && prof?.is_active === true && prof?.display_name === MEMBER_NAME,
    JSON.stringify(prof),
  );
  row = await rowOf(page, MEMBER_EMAIL);
  const rowText = await text(row);
  check('一覧の状態が「無料（調査員）」になり、「入金を確認した」が消える', rowText.includes('無料（調査員）') && !rowText.includes('入金を確認した'), rowText);
  check('同じ行に「調査員をやめる」が出る', (await row.getByRole('button', { name: '調査員をやめる' }).count()) === 1);

  const logs = (await sb(`/rest/v1/audit_logs?record_id=eq.${made.member}&table_name=eq.admin_profiles&select=action,actor_id`)).body ?? [];
  check('操作履歴に、押した管理者が残る', logs.some((l) => l.action === 'insert' && l.actor_id === made.admin), JSON.stringify(logs));

  /* その会員が、いまのパスワードのまま管理画面に入れる */
  const sp = await freshPage();
  check('その会員が、いまのパスワードのまま管理画面に入れる', await signIn(sp, MEMBER_EMAIL));
  await sp.goto(`${BASE}/members`, { waitUntil: 'networkidle' });
  check('調査員には「会員・お支払い」を開かせない', !new URL(sp.url()).pathname.startsWith('/members'), sp.url());

  /* アプリでも無料になる */
  const tok = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: MEMBER_EMAIL, password: PASSWORD }),
  }).then((r) => r.json());
  const free = await fetch(`${SB}/rest/v1/rpc/my_free_access`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
    body: '{}',
  }).then((r) => r.json());
  check('アプリでも無料になる（調査員として）', free?.reason === 'surveyor', JSON.stringify(free));

  /* ===================================================================== */
  console.log(`${NL}--- 「アカウント」の画面での案内 ---`);
  /* ===================================================================== */
  await page.goto(`${BASE}/accounts`, { waitUntil: 'networkidle' });
  await page.fill('input[name="display_name"]', '重複の検査');
  await page.fill('input[name="email"]', BLOCKED_EMAIL);
  /* 発行の欄の役割（一覧の行にも同じ名前の欄がある） */
  const roleSel = page.locator('select[name="role"]').first();
  if (await roleSel.count()) await roleSel.selectOption('surveyor');
  await page.getByRole('button', { name: '発行する' }).click();
  await page.waitForTimeout(4000);
  const accText = await text(page.locator('body'));
  check('会員のアドレスで発行すると、「会員・お支払い」の入口へ案内する', accText.includes('「会員・お支払い」の画面で「調査員にする」'), accText.slice(0, 300));

  /* ===================================================================== */
  console.log(`${NL}--- 調査員をやめる ---`);
  /* ===================================================================== */
  row = await rowOf(page, MEMBER_EMAIL);
  await row.getByRole('button', { name: '調査員をやめる' }).click();
  dialog = page.locator('[data-testid="confirm-card"]');
  await dialog.waitFor({ timeout: 5000 });
  check('やめるときも、確かめる札が出る', (await text(dialog)).includes('通常の会員に戻します'));
  await page.locator('[data-testid="confirm-accept"]').click();
  await page.waitForTimeout(4000);
  check('やめると、調査員の権限が消える', (await profileOf(made.member)) === null);
  const still = (await sb(`/auth/v1/admin/users/${made.member}`)).body;
  const driverRow = (await sb(`/rest/v1/driver_profiles?user_id=eq.${made.member}&select=user_id`)).body ?? [];
  check('会員のアカウントと会員の行は残る', still?.email === MEMBER_EMAIL && driverRow.length === 1, JSON.stringify({ email: still?.email, rows: driverRow.length }));
  row = await rowOf(page, MEMBER_EMAIL);
  const backText = await text(row);
  check('一覧も、通常の会員に戻る（「調査員にする」がまた出る）', !backText.includes('無料（調査員）') && (await row.getByRole('button', { name: '調査員にする' }).count()) === 1, backText);
  const sp2 = await freshPage();
  check('やめた方は、管理画面に入れない', !(await signIn(sp2, MEMBER_EMAIL)));

  /* ===================================================================== */
  console.log(`${NL}--- 出さないところ ---`);
  /* ===================================================================== */
  const blockedRow = await rowOf(page, BLOCKED_EMAIL);
  check('停止中の会員には「調査員にする」を出さない', !!blockedRow && (await blockedRow.getByRole('button', { name: '調査員にする' }).count()) === 0);
} catch (e) {
  failures.push(`途中で止まった: ${String(e.message).split(NL)[0]}`);
  console.error(e);
} finally {
  for (const c of contexts) await c.close().catch(() => {});
  await browser?.close();
  for (const id of [made.admin, made.member, made.blocked].filter(Boolean)) {
    await sb(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  }
  /* 自動で書かれた操作履歴を消す。いちばん最後 */
  const gone = await purgeAuditLogs(sb, [made.admin, made.member, made.blocked]);
  console.log(`${NL}  片付け  検査用の管理者と会員を消しました（操作履歴 ${gone} 件）`);
  console.log(`${NL}合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
