/**
 * 管理画面の「お知らせ」と、会員一覧のページ送りを確かめる。
 *
 *   node tools/test-notices.mjs                          手元（既定 3000）
 *   node tools/test-notices.mjs http://localhost:3010
 *   node tools/test-notices.mjs https://kurumayose-navi-admin.vercel.app
 *
 * **何を見るか**
 *   1. 会員がお振込みを報告すると、ヘッダーに知らせが出る
 *   2. 何度押しても増えない
 *   3. 「入金を確認した」を押すと、知らせが片付く
 *   4. 半年より古い記録があると、整理のお伺いが出る
 *   5. 「今回は見送る」で消えない。**記録はそのまま残る**
 *   6. 「同意して消す」で、**半年より古いものだけ**が消える
 *   7. 管理者以外にはベルを出さない
 *   8. 会員一覧は1ページ10名
 *
 * **消える側を、必ず数えて確かめる**
 *   整理は戻せない。「消えた」だけでなく「消えてはいけないものが
 *   残っている」ことまで見る。ここを見ないと、条件を取り違えて
 *   全部消していても検査は通ってしまう。
 *
 * **使い捨てのアカウントを作り、最後に消す。**
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';

const raw = process.argv[2] ?? 'http://localhost:3000';
const BASE = raw.endsWith('/') ? raw.slice(0, -1) : raw;
const HOST = new URL(BASE).hostname;
const NL = String.fromCharCode(10);

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
const appEnv = loadEnv('app/.env.local');
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const sb = async (path, { method = 'GET', body, prefer, range } = {}) => {
  const r = await fetch(`${SB}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
      ...(range ? { Range: range } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let b = null;
  try { b = t ? JSON.parse(t) : null; } catch { b = t; }
  return { ok: r.ok, body: b, headers: r.headers };
};

/** 半年より古い記録の件数を数える（消さない） */
async function countOld() {
  const cut = new Date();
  cut.setMonth(cut.getMonth() - 6);
  const r = await sb(
    `/rest/v1/audit_logs?select=id&created_at=lt.${cut.toISOString()}`,
    { prefer: 'count=exact', range: '0-0' },
  );
  return Number((r.headers.get('content-range') ?? '*/0').split('/')[1]) || 0;
}

/** 記録の総数 */
async function countAll() {
  const r = await sb('/rest/v1/audit_logs?select=id', { prefer: 'count=exact', range: '0-0' });
  return Number((r.headers.get('content-range') ?? '*/0').split('/')[1]) || 0;
}

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

const ADMIN_MAIL = 'ui-notice-admin@kurumayose.invalid';
const EDITOR_MAIL = 'ui-notice-editor@kurumayose.invalid';
const DRIVER_MAIL = 'ui-notice-driver@kurumayose.invalid';
const PASSWORD = 'Nq4vHt8sZe2wRb';

/** 使い捨ての利用者を作る。同じ宛名が残っていたら先に消す。 */
async function makeUser(email) {
  const users = await sb('/auth/v1/admin/users?page=1&per_page=200');
  const stale = (users.body?.users ?? []).find((u) => u.email === email);
  if (stale) await sb(`/auth/v1/admin/users/${stale.id}`, { method: 'DELETE' });
  const made = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password: PASSWORD, email_confirm: true },
  });
  const id = made.body?.id;
  if (!id) throw new Error(`利用者を作れません: ${JSON.stringify(made.body).slice(0, 160)}`);
  return id;
}

/** 会員として入って、鍵（access token）を受け取る */
async function driverToken(email) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const b = await r.json();
  if (!b.access_token) throw new Error(`会員として入れません: ${JSON.stringify(b).slice(0, 160)}`);
  return b.access_token;
}

/** 会員の鍵で RPC を呼ぶ */
async function callRpc(token, name) {
  const r = await fetch(`${SB}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const t = await r.text();
  let b = null;
  try { b = t ? JSON.parse(t) : null; } catch { b = t; }
  return { ok: r.ok, body: b };
}

/**
 * ベルの未対応の数を読む。出ていなければ null。
 *
 * ベルは**リンク**（押すと一覧へ移る）。釦ではない。
 */
const BELL = () => {
  const el = [...document.querySelectorAll('a, button')].find((b) =>
    (b.getAttribute('aria-label') ?? '').includes('お知らせ'),
  );
  if (!el) return { ある: false };
  const badge = el.querySelector('span');
  return {
    ある: true,
    数: badge ? badge.textContent.trim() : '',
    行き先: el.getAttribute('href') ?? null,
  };
};

let browser = null;
let adminId = null;
let editorId = null;
let driverId = null;
let seededAudit = null;

try {
  console.log(`管理画面のお知らせの検査: ${BASE}${NL}`);

  adminId = await makeUser(ADMIN_MAIL);
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: adminId, display_name: '検査用管理者', role: 'admin' },
  });

  editorId = await makeUser(EDITOR_MAIL);
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: editorId, display_name: '検査用編集者', role: 'editor' },
  });

  driverId = await makeUser(DRIVER_MAIL);
  await sb('/rest/v1/driver_profiles', {
    method: 'POST',
    body: {
      user_id: driverId,
      trial_ends_at: new Date(Date.now() + 86400000).toISOString(),
      plan: 'monthly',
    },
  });

  browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'kn_locale', value: 'ja', domain: HOST, path: '/' }]);
  const page = await ctx.newPage();

  const signIn = async (email) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });
    await page.waitForLoadState('networkidle');
  };

  // --- 1. お支払いの報告 -----------------------------------------------------
  console.log('--- お支払いの報告 ---');
  const token = await driverToken(DRIVER_MAIL);
  const first = await callRpc(token, 'report_payment');
  check('会員から報告できる', first.ok && first.body?.kind === 'payment',
    JSON.stringify(first.body).slice(0, 160));

  await callRpc(token, 'report_payment');
  await callRpc(token, 'report_payment');
  const mine = await sb(
    `/rest/v1/admin_notices?select=id&kind=eq.payment&member_id=eq.${driverId}&state=eq.open`,
  );
  check('何度押しても増えない', Array.isArray(mine.body) && mine.body.length === 1,
    `未対応 ${Array.isArray(mine.body) ? mine.body.length : '?'} 件`);

  const seen = await callRpc(token, 'my_payment_reported');
  check('会員から「報告済み」を確かめられる', seen.ok && typeof seen.body === 'string',
    JSON.stringify(seen.body).slice(0, 120));

  await signIn(ADMIN_MAIL);
  let bell = await page.evaluate(BELL);
  check('管理者にベルが出る', bell.ある === true, JSON.stringify(bell));
  check('未対応の数が出る', bell.数 !== '', JSON.stringify(bell));

  check('ベルは一覧への行き先を持つ', bell.行き先 === '/notices', JSON.stringify(bell));

  await page.goto(`${BASE}/notices`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const body = await page.evaluate(() => document.body.innerText);
  check('一覧にお支払いの報告が並ぶ', body.includes('お支払いの報告'), body.slice(0, 200));
  check('会員番号が出る', /\d{4}/.test(body), body.slice(0, 200));

  // --- 2. 入金を確認すると片付く ---------------------------------------------
  console.log('--- 入金の確認 ---');
  const profile = await sb(`/rest/v1/driver_profiles?select=member_no&user_id=eq.${driverId}`);
  const memberNo = profile.body?.[0]?.member_no;
  await sb(`/rest/v1/driver_profiles?user_id=eq.${driverId}`, {
    method: 'PATCH',
    body: { status: 'active' },
  });
  await sb(`/rest/v1/admin_notices?kind=eq.payment&member_id=eq.${driverId}&state=eq.open`, {
    method: 'PATCH',
    body: { state: 'done', decided_at: new Date().toISOString() },
  });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  bell = await page.evaluate(BELL);
  check(`片付けると未対応が消える（会員番号 ${memberNo}）`, bell.ある === true && bell.数 === '',
    JSON.stringify(bell));

  // --- 3. 履歴の整理をお伺いする --------------------------------------------
  console.log('--- 履歴の整理 ---');
  const before = { all: await countAll(), old: await countOld() };
  check('いま半年より古い記録は無い', before.old === 0, `${before.old} 件`);

  const long = new Date();
  long.setMonth(long.getMonth() - 7);
  const seeded = await sb('/rest/v1/audit_logs', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      actor_id: adminId,
      action: 'update',
      table_name: 'facilities',
      created_at: long.toISOString(),
      diff: { 検査: '半年より古い記録' },
    },
  });
  seededAudit = seeded.body?.[0]?.id ?? null;
  check('古い記録を1件置いた', seededAudit !== null, JSON.stringify(seeded.body).slice(0, 120));

  await page.goto(`${BASE}/notices`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const text = await page.evaluate(() => document.body.innerText);
  check('整理のお伺いが出る', text.includes('操作履歴の整理'), text.slice(0, 200));
  check('戻せない旨を添えている', text.includes('戻せません'), text.slice(0, 200));

  // --- 4. 見送ると、消えない -------------------------------------------------
  await page.click('button:has-text("今回は見送る")');
  await page.waitForTimeout(2000);
  const afterDecline = { all: await countAll(), old: await countOld() };
  check('見送ったら1件も消えていない',
    afterDecline.all === before.all + 1 && afterDecline.old === 1,
    `総数 ${afterDecline.all}（前 ${before.all}）/ 古い ${afterDecline.old}`);

  await page.goto(`${BASE}/notices`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const openAfter = await sb('/rest/v1/admin_notices?select=id&kind=eq.purge_request&state=eq.open');
  /*
    **二重に積まれていないことも、ここで見る。**

    外枠と中身が同時に描かれるため、両方が「まだ無い」と判断して
    2件作ったことがあった（2026-09-14、差は2ミリ秒）。
    データベース側の索引で1件までに縛ってある。
  */
  check('見送った直後に、同じお伺いを出し直さない',
    Array.isArray(openAfter.body) && openAfter.body.length === 0,
    `未対応 ${Array.isArray(openAfter.body) ? openAfter.body.length : '?'} 件`);

  const everyPurge = await sb('/rest/v1/admin_notices?select=id,state&kind=eq.purge_request');
  check('お伺いが二重に積まれていない',
    Array.isArray(everyPurge.body) && everyPurge.body.length === 1,
    JSON.stringify(everyPurge.body));

  // --- 5. 同意すると、古いものだけが消える -----------------------------------
  const cut = new Date();
  cut.setMonth(cut.getMonth() - 6);
  const made = await sb('/rest/v1/admin_notices', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      kind: 'purge_request',
      detail: { cutoff: cut.toISOString(), count: 1 },
    },
  });
  const purgeId = made.body?.[0]?.id ?? null;

  await page.goto(`${BASE}/notices`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('button:has-text("同意して消す")');
  await page.waitForTimeout(2500);

  const afterApprove = { all: await countAll(), old: await countOld() };
  check('半年より古い記録が消えた', afterApprove.old === 0, `${afterApprove.old} 件残っている`);
  /*
    消してよい1件だけが減り、整理そのものの記録が1件増える。
    差し引きで、元の総数と同じになる。
  */
  check('半年より新しい記録は消えていない',
    afterApprove.all === before.all + 1,
    `総数 ${afterApprove.all}（元 ${before.all} / 整理の記録が1件増える）`);

  const mark = await sb(
    '/rest/v1/audit_logs?select=id,diff&table_name=eq.audit_logs&order=id.desc&limit=1',
  );
  check('整理したこと自体が記録に残る',
    Array.isArray(mark.body) && mark.body[0]?.diff?.purged === 1,
    JSON.stringify(mark.body).slice(0, 160));

  const done = await sb(`/rest/v1/admin_notices?select=state&id=eq.${purgeId}`);
  check('お伺いが片付いた', done.body?.[0]?.state === 'done', JSON.stringify(done.body));

  // --- 6. 管理者以外にはベルを出さない ---------------------------------------
  console.log('--- 権限 ---');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  const ctx2 = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 900 } });
  await ctx2.addCookies([{ name: 'kn_locale', value: 'ja', domain: HOST, path: '/' }]);
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p2.fill('input[name="email"]', EDITOR_MAIL);
  await p2.fill('input[name="password"]', PASSWORD);
  await p2.click('button[type="submit"]');
  await p2.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });
  await p2.waitForLoadState('networkidle');
  const bell2 = await p2.evaluate(BELL);
  check('編集者にはベルを出さない', bell2.ある === false, JSON.stringify(bell2));
  await ctx2.close();

  // --- 7. 会員一覧は1ページ10名 ---------------------------------------------
  console.log('--- 会員一覧のページ送り ---');
  await page.goto(`${BASE}/members`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const rows1 = await page.locator('table tbody tr').count();
  check(`1ページ目は10名まで（${rows1} 名）`, rows1 > 0 && rows1 <= 10, `${rows1} 名`);

  const total = await sb('/rest/v1/driver_profiles?select=user_id');
  const members = Array.isArray(total.body) ? total.body.length : 0;
  const lastPage = Math.max(1, Math.ceil(members / 10));
  check(`会員は ${members} 名（${lastPage} ページ）`, members > 0);

  if (lastPage > 1) {
    const nav = await page.locator('nav[aria-label="ページ送り"]').count();
    check('ページ送りが出ている', nav === 1, `${nav} 個`);
    await page.goto(`${BASE}/members?page=2`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const rows2 = await page.locator('table tbody tr').count();
    check(`2ページ目に残りが出る（${rows2} 名）`, rows2 > 0 && rows2 <= 10, `${rows2} 名`);
    check('1ページ目と2ページ目で合計が合う',
      rows1 + rows2 <= members && rows1 === 10,
      `${rows1} + ${rows2} / 全 ${members}`);
  } else {
    check('会員が10名以下なのでページ送りは出さない',
      (await page.locator('nav[aria-label="ページ送り"]').count()) === 0);
  }

  // --- 8. 左の並びと印 -------------------------------------------------------
  console.log('--- 左の並びと印 ---');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const nav = await page.evaluate(() => {
    const links = [...document.querySelectorAll('aside a[href], nav a[href]')]
      .filter((a) => a.textContent.trim() && a.querySelector('svg'));
    const seen = new Map();
    for (const a of links) if (!seen.has(a.getAttribute('href'))) seen.set(a.getAttribute('href'), a);
    const list = [...seen.entries()].map(([href, a]) => ({
      href,
      label: a.textContent.trim(),
      d: [...a.querySelectorAll('svg path, svg circle')].map((x) => x.getAttribute('d') ?? 'circle').join('|'),
    }));
    const bell = document.querySelector('a[aria-label*="お知らせ"] svg');
    return {
      list,
      bellD: bell
        ? [...bell.querySelectorAll('path, circle')].map((x) => x.getAttribute('d') ?? 'circle').join('|')
        : null,
    };
  });
  const last = nav.list[nav.list.length - 1];
  check(`「通知」が左の並びのいちばん下（いまは「${last?.label ?? '?'}」）`,
    last?.href === '/push', JSON.stringify(nav.list.map((x) => x.label)));

  const push = nav.list.find((x) => x.href === '/push');
  check('「通知」の印が、ヘッダーのベルと違う',
    Boolean(push && nav.bellD && push.d !== nav.bellD),
    `通知 ${push?.d?.slice(0, 40)} / ベル ${nav.bellD?.slice(0, 40)}`);

  // --- 9. 細い画面 -----------------------------------------------------------
  console.log('--- 細い画面（390×844） ---');
  const spCtx = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await spCtx.addCookies([{ name: 'kn_locale', value: 'ja', domain: HOST, path: '/' }]);
  const sp = await spCtx.newPage();
  await sp.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await sp.fill('input[name="email"]', ADMIN_MAIL);
  await sp.fill('input[name="password"]', PASSWORD);
  await sp.click('button[type="submit"]');
  await sp.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });
  await sp.waitForLoadState('networkidle');
  await sp.waitForTimeout(800);

  /*
    指で押して移る。覗き窓は出さない。

    以前は押すと窓が開き、その窓が画面の左へはみ出して文字が
    切れていた（ご報告 2026-09-14）。
  */
  await sp.tap('a[aria-label*="お知らせ"]');
  await sp.waitForTimeout(1500);
  check('指で押すと一覧へ移る',
    new URL(sp.url()).pathname === '/notices', sp.url());

  const peek = await sp.evaluate(() => document.querySelectorAll('[role="tooltip"]').length);
  check('覗き窓は出ない（指で操作する端末）', peek === 0, `${peek} 個`);

  /* 画面の外へ出ていないか。はみ出すと文字が切れる。 */
  const over = await sp.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('svg')) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) continue;
      /*
        右へのはみ出しだけを見る。

        左の柱（aside）は、狭い画面では画面の外へ隠してある。
        三本線を押すと出てくる作りで、これは正しい状態。
        左を数えると、この引き出しを毎回「はみ出し」と呼ぶことになる。
      */
      if (b.right > w + 1) {
        bad.push(`${el.tagName}.${(el.className || '').toString().slice(0, 26)} 左${Math.round(b.left)} 右${Math.round(b.right)}`);
      }
    }
    return { w, bad: bad.slice(0, 4) };
  });
  check(`お知らせの一覧が画面に収まる（幅 ${over.w}px）`, over.bad.length === 0, over.bad.join(' | '));
  await spCtx.close();

  await ctx.close();
} finally {
  console.log(`${NL}--- 後片付け ---`);
  if (browser) await browser.close();

  if (seededAudit !== null) {
    await sb(`/rest/v1/audit_logs?id=eq.${seededAudit}`, { method: 'DELETE' });
  }
  for (const id of [adminId, editorId, driverId]) {
    if (!id) continue;
    await sb(`/rest/v1/admin_notices?member_id=eq.${id}`, { method: 'DELETE' });
    await sb(`/rest/v1/audit_logs?actor_id=eq.${id}`, { method: 'DELETE' });
    await sb(`/rest/v1/admin_profiles?user_id=eq.${id}`, { method: 'DELETE' });
    await sb(`/rest/v1/driver_profiles?user_id=eq.${id}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  }
  /* 検査で作った整理のお伺いを消す（本番の履歴に残さない） */
  await sb('/rest/v1/admin_notices?kind=eq.purge_request', { method: 'DELETE' });
  const purged = await purgeAuditLogs(sb, [adminId, editorId, driverId]);
  console.log(`  片付け  検査用のアカウントを消しました（操作履歴 ${purged} 件）`);

  console.log(`${NL}合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
