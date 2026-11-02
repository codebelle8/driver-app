/**
 * ご意見箱（2026-11-02）を確かめる。
 *
 *   node tools/test-feedback.mjs                                         手元（アプリ 4190・管理画面 3000）
 *   node tools/test-feedback.mjs https://app.kurumayosenavi.com https://admin.kurumayosenavi.com
 *
 * **前提:** データベースに 20261102000001_feedback.sql が入っていること。
 *
 * **何を見るか**
 *   アプリ
 *     * 「探す」画面の右下（下のタブのすぐ上）に、ご意見箱の絵が出る
 *     * 押すとご意見箱が開く。種類と内容がそろうまで「送る」は押せない
 *     * 送ると受け付けられ、「送ったご意見」に「受け付けました」で出る
 *     * 絞り込んでいるあいだは絵を出さない（同じ右下に「上へ戻る」が出るため）
 *   データベースの決まり
 *     * ほかの会員のご意見は読めない。覚え書きは本人にも読めない
 *     * 会員は状態を変えられない。送るときに状態を決められない
 *     * 24時間に10件まで
 *   管理画面
 *     * 左の柱の「ご意見」に未対応の数が出る。一覧に届いたご意見が出る
 *     * 「検討中にする」で切り替わり、会員のアプリにも「検討中」と出る
 *     * 操作履歴に、切り替えた管理者が残る
 *
 * **本番のデータには触れない。** 検査用の会員と管理者をその都度作り、最後に消す。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const APP = (process.argv[2] ?? 'http://localhost:4190').replace(/\/$/, '');
const ADMIN = (process.argv[3] ?? 'http://localhost:3000').replace(/\/$/, '');
const NL = String.fromCharCode(10);

const conn = connect();
const env = Object.fromEntries(
  readFileSync('admin/.env.local', 'utf8')
    .split(NL)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

const sb = (path, init = {}) =>
  fetch(`${conn.url}${path}`, { ...init, headers: { ...conn.svc, ...(init.headers ?? {}) } }).then(async (r) => ({
    ok: r.ok,
    status: r.status,
    body: await r.json().catch(() => null),
  }));

/** 会員の鍵（パスワードで入って受け取る） */
async function tokenOf(m) {
  const r = await fetch(`${conn.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: m.email, password: m.password }),
  }).then((x) => x.json());
  return r.access_token;
}
const as = (token) => (path, init = {}) =>
  fetch(`${conn.url}${path}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) }));

const stamp = Date.now();
const BODY = `検査のご意見 ${stamp}：地図の上で、よく行く施設をまとめて見たい。`;
const ADMIN_EMAIL = `fb-admin-${stamp}@kurumayose.invalid`;
const ADMIN_PASSWORD = 'Hq7wTz3nRv9xLm';

let member = null;
let other = null;
let adminId = null;
let browser = null;
/** 送ったご意見の id。状態の切り替えの記録（操作履歴）を片付けるのに使う */
let fid = null;

try {
  console.log(`ご意見箱の検査: ${APP} / ${ADMIN}${NL}`);
  member = await createMember(conn, 'feedback');
  other = await createMember(conn, 'feedback2');
  const a = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true }),
  });
  adminId = a.body?.id;
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: JSON.stringify({ user_id: adminId, display_name: 'ご意見の検査・管理者', role: 'admin' }),
  });
  /* もう一方の会員は、アプリを開いた状態（会員の行がある）にしておく */
  await sb('/rest/v1/driver_profiles', {
    method: 'POST',
    body: JSON.stringify({ user_id: other.userId, trial_ends_at: new Date(Date.now() + 30 * 864e5).toISOString() }),
  });

  browser = await chromium.launch({ channel: 'msedge' });

  /* =================================================================== */
  console.log('--- アプリ ---');
  /* =================================================================== */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signInOn(page, APP, member);

  const btn = page.getByTestId('feedback-button');
  await btn.waitFor({ timeout: 20000 }).catch(() => {});
  const box = await btn.boundingBox();
  const tabBar = await page.getByRole('tab', { name: /探す|Search/ }).first().boundingBox().catch(() => null);
  check(
    '「探す」画面の右下（下のタブのすぐ上）に、ご意見箱の絵が出る',
    !!box && box.x + box.width > 390 - 40 && (!tabBar || box.y + box.height <= tabBar.y + 2) && box.y > 844 / 2,
    JSON.stringify({ box, tabBar }),
  );

  /* 吹き出し「あなたの声が アプリを進化させる。」（2026-11-02）。マウスを重ねたときだけ */
  const bubbleOpacity = () =>
    page.getByTestId('feedback-bubble').evaluate((el) => Number(getComputedStyle(el).opacity)).catch(() => -1);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  const off = await bubbleOpacity();
  await btn.hover();
  await page.waitForTimeout(600);
  const on = await bubbleOpacity();
  const bubble = await page.getByTestId('feedback-bubble').boundingBox();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(600);
  const offAgain = await bubbleOpacity();
  check('絵にマウスを重ねると吹き出しが出て、離すと消える', off === 0 && on > 0.95 && offAgain === 0, JSON.stringify({ off, on, offAgain }));
  check(
    '吹き出しは絵の左上に出て、画面からはみ出さない',
    !!bubble && !!box && bubble.x >= 0 && bubble.y >= 0 && bubble.x + bubble.width <= box.x + box.width && bubble.y < box.y,
    JSON.stringify({ bubble, box }),
  );

  /* 絞り込むと出さない */
  await page.getByPlaceholder(/施設名|Facility/).first().fill('ホテル');
  await page.waitForTimeout(1500);
  check('絞り込んでいるあいだは、ご意見箱の絵を出さない', (await btn.count()) === 0);
  await page.getByPlaceholder(/施設名|Facility/).first().fill('');
  await page.waitForTimeout(1500);

  await btn.click();
  await page.waitForTimeout(2500);
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('押すと、ご意見箱が開く', body.includes('ご意見箱') && body.includes('どんなご意見ですか'), body.slice(0, 160));

  const send = page.getByRole('button', { name: '送る', exact: true });
  const disabled = async () => (await send.getAttribute('aria-disabled')) === 'true' || (await send.isDisabled());
  check('種類と内容がそろうまで、「送る」は押せない', await disabled());
  await page.getByRole('radio', { name: '新しい機能がほしい' }).click();
  check('種類だけでは、まだ押せない', await disabled());
  await page.getByLabel('内容').fill(BODY);
  check('種類と内容がそろうと、押せる', !(await disabled()));
  await send.click();
  await page.waitForTimeout(3500);
  const after = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('送ると受け付けられ、「送ったご意見」に「受け付けました」で出る', after.includes('受け付けました') && after.includes(BODY.slice(0, 20)), after.slice(0, 400));
  check('送ったあと、入力は空に戻る', (await page.getByLabel('内容').inputValue()) === '');

  const rows = (await sb(`/rest/v1/feedback?user_id=eq.${member.userId}&select=*`)).body ?? [];
  check('データベースに、送った会員・種類・内容・状態（new）で入る', rows.length === 1 && rows[0].kind === 'feature' && rows[0].body === BODY && rows[0].status === 'new', JSON.stringify(rows));
  check('アプリに誤りが出ない', errors.length === 0, errors.join(' / '));

  /* =================================================================== */
  console.log(`${NL}--- データベースの決まり ---`);
  /* =================================================================== */
  const meTok = await tokenOf(member);
  const otherTok = await tokenOf(other);
  const mine = as(meTok);
  const theirs = as(otherTok);
  fid = rows[0]?.id ?? null;

  const peek = await theirs(`/rest/v1/feedback?id=eq.${fid}&select=id`);
  check('ほかの会員のご意見は読めない', Array.isArray(peek.body) && peek.body.length === 0, JSON.stringify(peek));
  const note = await mine(`/rest/v1/feedback?id=eq.${fid}&select=staff_note`);
  check('覚え書きは、本人にも読めない', !note.ok, JSON.stringify(note));
  const upd = await mine(`/rest/v1/feedback?id=eq.${fid}`, { method: 'PATCH', body: JSON.stringify({ status: 'done' }), headers: { Prefer: 'return=representation' } });
  const still = (await sb(`/rest/v1/feedback?id=eq.${fid}&select=status`)).body?.[0]?.status;
  check('会員は状態を変えられない', still === 'new', JSON.stringify({ upd: upd.status, still }));
  const forged = await theirs('/rest/v1/feedback', {
    method: 'POST',
    body: JSON.stringify({ user_id: other.userId, kind: 'other', body: '状態を決めて送る', status: 'done' }),
  });
  check('送るときに状態を決められない', !forged.ok, JSON.stringify(forged).slice(0, 160));
  const spoof = await theirs('/rest/v1/feedback', {
    method: 'POST',
    body: JSON.stringify({ user_id: member.userId, kind: 'other', body: '人の名前で送る' }),
  });
  check('ほかの会員の名前では送れない', !spoof.ok, JSON.stringify(spoof).slice(0, 160));

  let limited = null;
  for (let i = 0; i < 11; i++) {
    const r = await theirs('/rest/v1/feedback', {
      method: 'POST',
      body: JSON.stringify({ user_id: other.userId, kind: 'other', body: `上限の検査 ${i + 1}` }),
    });
    if (!r.ok) {
      limited = { i: i + 1, r };
      break;
    }
  }
  check('24時間に10件まで（11件目は断る）', limited?.i === 11 && JSON.stringify(limited.r.body).includes('too_many_feedback'), JSON.stringify(limited).slice(0, 200));

  /* =================================================================== */
  console.log(`${NL}--- 管理画面 ---`);
  /* =================================================================== */
  const actx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, locale: 'ja-JP' });
  await actx.addCookies([{ name: 'kn_locale', value: 'ja', domain: new URL(ADMIN).hostname, path: '/' }]);
  const ap = await actx.newPage();
  await ap.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await ap.fill('input[name="email"]', ADMIN_EMAIL);
  await ap.fill('input[name="password"]', ADMIN_PASSWORD);
  await ap.click('button[type="submit"]');
  await ap.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {});

  await ap.goto(`${ADMIN}/feedback`, { waitUntil: 'networkidle' });
  const nav = (await ap.getByRole('link', { name: /ご意見/ }).first().innerText()).replace(/\s+/g, ' ');
  check('左の柱の「ご意見」に、未対応の数が出る', /ご意見\s*\d+/.test(nav), nav);
  const card = ap.locator('form', { has: ap.locator(`input[name="id"][value="${fid}"]`) });
  const listText = (await ap.locator('main').innerText()).replace(/\s+/g, ' ');
  check('一覧に、届いたご意見が出る（種類・内容・会員のアドレス）', listText.includes(BODY) && listText.includes('新しい機能がほしい') && listText.includes(member.email), listText.slice(0, 300));

  await card.getByRole('button', { name: '検討中にする' }).click();
  await ap.waitForTimeout(4000);
  const changed = (await sb(`/rest/v1/feedback?id=eq.${fid}&select=status,handled_at,handled_by`)).body?.[0];
  check('「検討中にする」で切り替わる（日時と人はデータベースが入れる）', changed?.status === 'considering' && !!changed?.handled_at && changed?.handled_by === adminId, JSON.stringify(changed));
  const logs = (await sb(`/rest/v1/audit_logs?record_id=eq.${fid}&table_name=eq.feedback&select=action,actor_id`)).body ?? [];
  check('操作履歴に、切り替えた管理者が残る', logs.some((l) => l.actor_id === adminId), JSON.stringify(logs));

  /* 会員のアプリにも「検討中」と出る */
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await skipIntro(page);
  const seen = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('会員のアプリの「送ったご意見」にも「検討中」と出る', seen.includes('検討中'), seen.slice(0, 300));
} catch (e) {
  failures.push(`途中で止まった: ${String(e.message).split(NL)[0]}`);
  console.error(e);
} finally {
  await browser?.close();
  const ids = [member?.userId, other?.userId, adminId, fid].filter(Boolean);
  if (member) await removeMember(conn, member);
  if (other) await removeMember(conn, other);
  if (adminId) await sb(`/auth/v1/admin/users/${adminId}`, { method: 'DELETE' });
  /* ご意見の行は会員と一緒に消える。状態の切り替えの記録は、ご意見の id（record_id）で消す */
  const sbForPurge = async (path, { method = 'GET', prefer } = {}) => {
    const r = await fetch(`${conn.url}${path}`, { method, headers: { ...conn.svc, ...(prefer ? { Prefer: prefer } : {}) } });
    const t = await r.text();
    let b = null;
    try {
      b = t ? JSON.parse(t) : null;
    } catch {
      b = t;
    }
    return { ok: r.ok, status: r.status, body: b };
  };
  const gone = await purgeAuditLogs(sbForPurge, ids);
  console.log(`${NL}  片付け  検査用の会員2名と管理者を消しました（操作履歴 ${gone} 件）`);
  console.log(`${NL}合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
