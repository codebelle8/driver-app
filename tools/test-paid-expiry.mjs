/**
 * お支払いいただいた期間の終わりを確かめる。
 *
 *   node tools/test-paid-expiry.mjs
 *   node tools/test-paid-expiry.mjs --app https://kurumayose-navi.vercel.app \
 *                                   --admin https://kurumayose-navi-admin.vercel.app
 *
 * **なぜ要るか**（ご指示 2026-09-15）
 *   これまで「ご利用中」にすると、そのまま無期限に使えた。1か月ぶん
 *   払った方も1年ぶん払った方も、画面上はまったく同じだった。
 *   期間を持たせ、過ぎたら無料期間の終わりと同じように締める。
 *
 * **何を見るか**
 *   管理画面
 *     1. 「入金を確認した」で、お選びの刻みぶんだけ先の期限が入る
 *     2. 無料期間へ戻すと、その期限が消える
 *     3. 一覧に、お支払い済みの期間の終わりが出る
 *     4. 期間が過ぎた方は「期限切れ」として出る
 *   アプリ
 *     5. 残っているあいだは「ご利用期間 残り ◯ 日」
 *     6. 期限を持たない方は、これまでどおり「ご利用中」（締めない）
 *     7. 過ぎたら「ご利用期間が終了しました」
 *     8. 過ぎたら設定より先へ進めない（探す画面へ入れない）
 *     9. 過ぎたときの文面が、無料期間のものと違う
 *    10. 終わりが近いと、お知らせが出る（お支払い済みの言い回しで）
 *
 * **本番の会員には触れない。** 検査用の会員と職員をその都度作り、
 * 最後に消す。自動で書かれた操作履歴も消す。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { signInOn, skipIntro } from './lib/member.mjs';
import { paidModeForTest } from './lib/trial.mjs';

const NL = String.fromCharCode(10);

/** 引数。--app と --admin で別々に受ける。片方だけでも動く。 */
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  const v = i >= 0 ? argv[i + 1] : undefined;
  const raw = v ?? fallback;
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};
const APP = argOf('--app', 'http://localhost:4190');
const ADMIN = argOf('--admin', 'http://localhost:3000');
const ADMIN_HOST = new URL(ADMIN).hostname;

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
/* 会員自身としてログインするのに使う（名簿の行を作らせるため） */
const ANON = loadEnv('app/.env.local').EXPO_PUBLIC_SUPABASE_ANON_KEY;
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
  return { ok: r.ok, body: b };
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

const STAFF_EMAIL = 'paid-expiry-staff@kurumayose.invalid';
const STAFF_PASSWORD = 'Qw8zR4tYu2pLx6';

/** 検査で選ばせる刻み。3か月。1か月だと、月数を無視しても通ってしまう。 */
const PLAN = { id: 'quarterly', months: 3 };

const day = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();

/** その会員の名簿を書き換える（検査用の会員だけ） */
const setProfile = (userId, patch) =>
  sb(`/rest/v1/driver_profiles?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation',
  });

const getProfile = async (userId) =>
  (await sb(`/rest/v1/driver_profiles?select=*&user_id=eq.${userId}`)).body?.[0] ?? null;

let browser = null;
let staffId = null;
let member = null;

/* 締め出しを確かめるため、検査のあいだだけ有料の提供のときの姿にする（試験提供を外す） */
let restoreTrial = async () => {};

try {
  restoreTrial = await paidModeForTest({ url: SB, svc: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } });
  console.log(`お支払いいただいた期間の検査${NL}  アプリ    ${APP}${NL}  管理画面  ${ADMIN}${NL}`);

  /* --- 検査用の会員 --- */
  const email = `kn-paid-${Date.now()}@example.com`;
  const password = 'kn-paid-password-2026';
  const made = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password, email_confirm: true },
  });
  if (!made.body?.id) throw new Error(`会員を作れません: ${JSON.stringify(made.body).slice(0, 160)}`);
  member = { userId: made.body.id, email, password };

  /*
    名簿の行を、ここで作らせておく。

    **作っておかないと、この検査は静かに何も見ないまま緑になる。**
    行は初回のログインで作られる（ensure_driver_profile）。それまでは
    名簿を書き換えても当たる行が無く、PATCH は「0 件を直した」で
    成功したことになる。管理画面の一覧にも出てこない。
    アプリがログインのときに呼ぶのと同じ関数を、ここでも呼ぶ。
  */
  const tok = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const access = (await tok.json()).access_token;
  if (!access) throw new Error('検査用の会員でログインできません');
  const born = await fetch(`${SB}/rest/v1/rpc/ensure_driver_profile`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!born.ok) throw new Error(`名簿の行を作れません: ${born.status}`);
  console.log(`  用意  検査用の会員 ${email}`);

  /* --- 検査用の職員 --- */
  const users = await sb('/auth/v1/admin/users?page=1&per_page=200');
  const stale = (users.body?.users ?? []).find((u) => u.email === STAFF_EMAIL);
  if (stale) await sb(`/auth/v1/admin/users/${stale.id}`, { method: 'DELETE' });
  staffId = (
    await sb('/auth/v1/admin/users', {
      method: 'POST',
      body: { email: STAFF_EMAIL, password: STAFF_PASSWORD, email_confirm: true },
    })
  ).body?.id;
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: staffId, display_name: '期限の検査', role: 'admin' },
  });

  browser = await chromium.launch();

  /* ===================================================================== */
  /* 管理画面                                                               */
  /* ===================================================================== */

  const actx = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 1280, height: 1000 },
  });
  await actx.addCookies([{ name: 'kn_locale', value: 'ja', domain: ADMIN_HOST, path: '/' }]);
  const admin = await actx.newPage();

  await admin.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await admin.fill('input[name="email"]', STAFF_EMAIL);
  await admin.fill('input[name="password"]', STAFF_PASSWORD);
  await admin.click('button[type="submit"]');
  await admin.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });

  /*
    アプリから選んだのと同じ形にしておく。
    刻みが入っていないと、月数を見ずに1か月として扱われる。
  */
  await setProfile(member.userId, {
    plan: PLAN.id,
    plan_chosen_at: new Date().toISOString(),
    status: 'trial',
    paid_until: null,
  });

  /** 一覧からこの会員の行を取る。会員番号で引く。 */
  const profile0 = await getProfile(member.userId);
  const memberNo = profile0?.member_no;
  const rowOf = () =>
    admin.locator('tr').filter({ hasText: String(memberNo).padStart(4, '0') }).first();

  /** 一覧のうち、この会員の行へ行き着くまでページを送る。 */
  async function findRow() {
    for (let page = 1; page <= 20; page++) {
      await admin.goto(`${ADMIN}/members?page=${page}`, { waitUntil: 'networkidle' });
      await admin.waitForTimeout(800);
      if (await rowOf().count()) return true;
      const next = admin.getByRole('link', { name: /次|Next/ });
      if (!(await next.count())) return false;
    }
    return false;
  }

  const found = await findRow();
  check('管理画面の一覧に、検査用の会員が出る', found, `会員番号 ${memberNo}`);

  if (found) {
    /* 1. 「入金を確認した」で期限が入る */
    await rowOf().getByRole('button', { name: /入金を確認した|Mark as paid/ }).click();
    await admin.waitForTimeout(2500);

    const after = await getProfile(member.userId);
    /*
      **無料期間の残りから数える**（ご指摘 2026-09-15）。

      いまから数えると、無料期間の途中で払った方の残りが消える。
      検査用の会員は作りたてで、無料期間が1か月ぶん残っている。
      いまから3か月なのか、無料期間の終わりから3か月なのかで、
      ちょうど1か月ずれる。**そのずれを見る。**
    */
    const trialEnd = new Date(profile0?.trial_ends_at ?? Date.now());
    const want = new Date(trialEnd);
    want.setMonth(want.getMonth() + PLAN.months);
    const got = after?.paid_until ? new Date(after.paid_until).getTime() : 0;
    check(
      `「入金を確認した」で、無料期間の残り＋${PLAN.months} か月の期限が入る`,
      after?.status === 'active' && Math.abs(got - want.getTime()) < day,
      `status=${after?.status} paid_until=${after?.paid_until} 期待=${want.toISOString()}`,
    );

    /* 残りが切り捨てられていないことを、はっきり見る */
    const fromNow = new Date();
    fromNow.setMonth(fromNow.getMonth() + PLAN.months);
    check(
      '無料期間の残りが、切り捨てられていない',
      got - fromNow.getTime() > 20 * day,
      `差 ${Math.round((got - fromNow.getTime()) / day)} 日`,
    );

    /* 3. 一覧に、その日付が出る */
    await admin.goto(admin.url(), { waitUntil: 'networkidle' });
    await admin.waitForTimeout(1200);
    const text = (await rowOf().innerText()).replace(/\s+/g, ' ');
    const d = new Date(after?.paid_until ?? 0);
    const shown = `${d.getFullYear()}`;
    check(
      '一覧に、お支払いいただいた期間の終わりが出る',
      text.includes(shown) && /あと\s*\d+か月/.test(text),
      text.slice(0, 160),
    );
    /* **月だけで丸めない**（ご指摘 2026-09-15）。端数の日まで出す。 */
    check(
      '残りが「◯か月 ◯日」で出る（月だけで丸めない）',
      /あと\s*\d+か月\s*\d+日/.test(text),
      text.slice(0, 160),
    );

    /* 4. 過ぎていれば「期限切れ」 */
    await setProfile(member.userId, { paid_until: iso(Date.now() - 2 * day) });
    await admin.goto(admin.url(), { waitUntil: 'networkidle' });
    await admin.waitForTimeout(1200);
    const over = (await rowOf().innerText()).replace(/\s+/g, ' ');
    check(
      'お支払い済みでも、過ぎていれば「期限切れ」と出る',
      over.includes('期限切れ') && /\d+\s*日超過/.test(over),
      over.slice(0, 160),
    );

    /* 2. 無料期間へ戻すと、期限が消える */
    await setProfile(member.userId, { status: 'active', paid_until: iso(Date.now() + 30 * day) });
    await admin.goto(admin.url(), { waitUntil: 'networkidle' });
    await admin.waitForTimeout(1200);
    const undo = rowOf().getByRole('button', { name: /無料期間へ戻す|Back to free month/ });
    if (await undo.count()) {
      await undo.first().click();
      await admin.waitForTimeout(2500);
      const back = await getProfile(member.userId);
      check(
        '無料期間へ戻すと、お支払いいただいた期間の終わりが消える',
        back?.status === 'trial' && back?.paid_until === null,
        `status=${back?.status} paid_until=${back?.paid_until}`,
      );
    } else {
      check('無料期間へ戻す釦がある', false, '釦が見つかりません');
    }
  }

  await actx.close();

  /* ===================================================================== */
  /* アプリ                                                                 */
  /* ===================================================================== */

  const ctx = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  /** 設定の画面を開き直して、そこに出ている文字を返す */
  async function settingsText() {
    await page.goto(`${APP}/mypage`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await skipIntro(page);
    /* 名簿を書き換えたので、端末が持っている控えではなく取り直させる */
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  }

  /* 5. 残っているあいだ */
  /*
    40日にしてある。ちょうど30日だと「1か月」と出て端数が無く、
    **「◯か月 ◯日」で出ているかどうかを確かめられない。**
  */
  await setProfile(member.userId, { status: 'active', paid_until: iso(Date.now() + 40 * day) });
  await signInOn(page, APP, member, { goto: '/mypage' });
  let body = await settingsText();
  check(
    '残っているあいだは「ご利用期間 残り …」と出る',
    /ご利用期間\s*残り\s*\d+/.test(body),
    body.slice(0, 200),
  );
  /* **月だけで丸めない**（ご指摘 2026-09-15）。端数の日まで出す。 */
  check(
    'アプリでも「◯か月 ◯日」で出る',
    /ご利用期間\s*残り\s*\d+か月\s*\d+日/.test(body),
    body.slice(0, 200),
  );
  check('残っているあいだは、締めない（探す画面へ行ける）', await canSearch(page), '');

  /* 6. 期限を持たない方 */
  await setProfile(member.userId, { status: 'active', paid_until: null });
  body = await settingsText();
  check(
    '期限を持たない方は、これまでどおり「ご利用中」',
    body.includes('ご利用中') && !/ご利用期間が終了/.test(body),
    body.slice(0, 200),
  );
  check('期限を持たない方は、締めない', await canSearch(page), '');

  /* 7〜9. 過ぎたあと */
  await setProfile(member.userId, { status: 'active', paid_until: iso(Date.now() - 2 * day) });
  body = await settingsText();
  check('過ぎたら「ご利用期間が終了しました」と出る', body.includes('ご利用期間が終了しました'), body.slice(0, 200));
  check(
    '過ぎたときの文面が、無料期間のものと違う',
    !body.includes('無料期間が終了しました'),
    body.slice(0, 200),
  );
  check(
    'お支払い済みの方へ「ご継続のお手続き」と案内する',
    body.includes('ご継続のお手続き'),
    body.slice(0, 200),
  );
  check('過ぎたら設定より先へ進めない', !(await canSearch(page)), '');

  /* 10. 終わりが近いときのお知らせ */
  await setProfile(member.userId, { status: 'active', paid_until: iso(Date.now() + 1.5 * day) });
  await page.goto(`${APP}/notices`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4500);
  const notices = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check(
    'お知らせが、お支払い済みの言い回しで出る',
    /ご利用期間が、あと\s*\d+\s*日で終わります/.test(notices),
    notices.slice(0, 220),
  );
  check(
    'お知らせに「無料期間」と出さない',
    !/無料期間が、あと/.test(notices),
    notices.slice(0, 220),
  );

  await ctx.close();
} finally {
  await restoreTrial();
  /* --- 後片付け --- */
  if (browser) await browser.close().catch(() => undefined);

  if (member?.userId) {
    await sb(`/auth/v1/admin/users/${member.userId}`, { method: 'DELETE' });
  }
  if (staffId) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${staffId}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${staffId}`, { method: 'DELETE' });
  }
  /* 自動で書かれた操作履歴を消す。**いちばん最後**（上の削除も履歴を作る） */
  const gone = await purgeAuditLogs(sb, [member?.userId, staffId]);
  console.log(`${NL}  片付け  検査用の会員と職員を消しました（操作履歴 ${gone} 件）`);

  console.log(`${NL}  ${pass} 件が通り、${failures.length} 件が落ちました`);
  if (failures.length > 0) {
    for (const f of failures) console.error(`    - ${f}`);
    process.exitCode = 1;
  }
}

/**
 * 探す画面へ入れるか。
 *
 * **住所を直に打って確かめる。** 下の帯から項目が消えているだけでは
 * 足りない。ブラウザなら打てば入れてしまう。
 */
async function canSearch(page) {
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  /* 設定へ送り返されていれば、締められている。 */
  return !/ご利用期間が終了しました|無料期間が終了しました/.test(text) && !text.includes('お支払いの手続きへ');
}
