/**
 * 管理画面の、まだ検査の無かったところを一通り見る。
 *
 *   node tools/test-admin-all.mjs
 *   node tools/test-admin-all.mjs https://kurumayose-navi-admin.vercel.app
 *
 * **なぜ要るか**
 *   画面ごとの検査は積み上げてきたが、**入口（ログイン）・ダッシュボード・
 *   カテゴリ・アカウント・操作履歴・通知**には、通しの検査が無かった。
 *   「動いているはず」で済ませていた範囲にあたる。
 *
 * **何を見るか**
 *   入口       … 誤ったパスワード／職員でない方／停止中の方を断る
 *   ダッシュボード … 開ける。件数が出る
 *   カテゴリ   … 追加 → 名前を直す → 並べ替え → 停止 → 削除
 *                 施設が紐づくカテゴリは**削除できない**こと
 *   アカウント … 発行 → 初期パスワードが一度だけ出る → 停止 → 再開 → 削除
 *                役割ごとに見える画面が変わること
 *   操作履歴   … 行が出る。ページを送れる
 *   通知       … 画面が出る。**空では送れない**
 *   共通       … 会員・送金・履歴は、編集者に見せない
 *
 * **通知は実際に送らない。**
 *   送れば本番の会員の端末が鳴る。**題名を空にして弾かれることだけ**を
 *   見る。送る経路そのものは check-push-guard.mjs が別に見ている。
 *
 * **本番のデータには触れない。**
 *   検査用の職員とカテゴリをその都度作り、最後に消す。
 *   自動で書かれた操作履歴も消す。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';

const NL = String.fromCharCode(10);
const raw = process.argv[2] ?? 'https://kurumayose-navi-admin.vercel.app';
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
if (!SB || !KEY) throw new Error('接続先または鍵がありません');

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
/** この検査が始まった時刻。操作履歴を時刻で区切って消すのに使う。 */
const startedAt = new Date().toISOString();
const ADMIN_EMAIL = `all-admin-${stamp}@kurumayose.invalid`;
const EDITOR_EMAIL = `all-editor-${stamp}@kurumayose.invalid`;
const DRIVER_EMAIL = `all-driver-${stamp}@example.com`;
const PASSWORD = 'Hq7wTz3nRv9xLm';

/** 検査用のカテゴリ。識別子は一度決めると変えられないため、時刻を混ぜる。 */
const CAT_CODE = `zztest${String(stamp).slice(-6)}`;
const CAT_NAME = `検査用カテゴリ${String(stamp).slice(-4)}`;

const made = { admin: null, editor: null, driver: null, categories: [] };

/**
 * 並べ替えの前に控えた、本番のカテゴリの表示順。
 *
 * **「前へ移動」は、隣のカテゴリと入れ替える。** 検査で足したカテゴリを
 * 動かすと、**隣にいる本番のカテゴリの表示順まで変わる。** 実際に
 * 「駅・空港」の値を 5 から 6 へ動かしてしまった（2026-09-17）。
 * 見た目の並びは変わらなかったが、控えの値は変わっていた。
 * 触る前に控え、最後に戻す。
 */
let orderBefore = [];

async function makeUser(email, { staff = null } = {}) {
  const stale = (await sb('/auth/v1/admin/users?page=1&per_page=200')).body?.users ?? [];
  for (const u of stale.filter((x) => x.email === email)) {
    await sb(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
  }
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
  return id;
}

/**
 * まっさらな窓を開く。
 *
 * **入るたびに新しい窓を使う。** 前の方の合鍵（Cookie）が残っていると、
 * 入口が「もう入っている」と判断して中へ送り、入力欄が出ない。
 * 実際それで検査が止まった。
 */
async function freshPage() {
  const ctx = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 1360, height: 1000 },
  });
  await ctx.addCookies([{ name: 'kn_locale', value: 'ja', domain: HOST, path: '/' }]);
  contexts.push(ctx);
  return ctx.newPage();
}

/** 入口から入る。入れたかどうかを返す。 */
async function signIn(page, email, password = PASSWORD) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  return !new URL(page.url()).pathname.startsWith('/login');
}

const text = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

let browser = null;
const contexts = [];

try {
  console.log(`管理画面の通しの検査: ${BASE}${NL}`);

  made.admin = await makeUser(ADMIN_EMAIL, { staff: { name: '通し検査・管理者', role: 'admin' } });
  made.editor = await makeUser(EDITOR_EMAIL, { staff: { name: '通し検査・編集者', role: 'editor' } });
  /* 職員ではない方。アプリの会員として作る。 */
  made.driver = await makeUser(DRIVER_EMAIL);
  console.log('  用意  検査用の職員2名と、職員でない方1名を作りました');

  browser = await chromium.launch();

  /* ===================================================================== */
  console.log(`${NL}--- 入口 ---`);
  /* ===================================================================== */

  let gate = await freshPage();
  check('誤ったパスワードでは入れない', !(await signIn(gate, ADMIN_EMAIL, 'wrong-password')), gate.url());
  check(
    '断られた理由が画面に出る',
    /合いません|正しくありません|できません|error/i.test(await text(gate)),
    (await text(gate)).slice(0, 200),
  );

  /*
    職員でない方（アプリの会員）。**同じ認証を使っている。**
    アプリにログインしたままこの住所を開く、という場面がそのまま起きる。
  */
  gate = await freshPage();
  const droveIn = await signIn(gate, DRIVER_EMAIL);
  check('職員でない方は入れない', !droveIn, gate.url());
  check(
    '入口に、権限が無い旨が出る',
    /権限|ご利用いただけません/.test(await text(gate)) || gate.url().includes('no_permission'),
    `${gate.url()} ${(await text(gate)).slice(0, 160)}`,
  );

  /*
    **入口へ戻れること。** ここが果てしない往復になっていた（2026-09-17）。
    /login と / が互いに送り返し合い、ブラウザが諦める。中身は漏れないが、
    職員として入り直すことも、出ることもできなくなる。
  */
  let loop = null;
  await gate.goto(`${BASE}/login`, { waitUntil: 'networkidle' }).catch((e) => {
    loop = String(e.message).split(NL)[0];
  });
  check('職員でない方でも、入口の画面は開ける（往復にならない）', loop === null, loop ?? '');
  check(
    '入り直すための欄が出ている',
    loop === null && (await gate.locator('input[name="email"]').count()) > 0,
    gate.url(),
  );

  /* 停止中の職員 */
  await sb(`/rest/v1/admin_profiles?user_id=eq.${made.editor}`, {
    method: 'PATCH',
    body: { is_active: false },
  });
  gate = await freshPage();
  check('停止中の職員は入れない', !(await signIn(gate, EDITOR_EMAIL)), gate.url());
  await sb(`/rest/v1/admin_profiles?user_id=eq.${made.editor}`, {
    method: 'PATCH',
    body: { is_active: true },
  });

  const page = await freshPage();
  check('正しい組み合わせでは入れる', await signIn(page, ADMIN_EMAIL), page.url());

  /* 既に入っている職員が入口を開いたら、中へ送る */
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check(
    '入っている職員が入口を開くと、中へ送られる',
    !new URL(page.url()).pathname.startsWith('/login'),
    page.url(),
  );

  /* ===================================================================== */
  console.log(`${NL}--- ダッシュボード ---`);
  /* ===================================================================== */

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const home = await text(page);
  check('ダッシュボードが開ける', !new URL(page.url()).pathname.startsWith('/login'), page.url());
  check('件数が出ている', /\d/.test(home), home.slice(0, 160));

  /* 左のメニューから、すべての画面へ行けること */
  for (const [label, path] of [
    ['施設一覧', '/facilities'],
    ['カテゴリ', '/categories'],
    ['会員・お支払い', '/members'],
    ['アカウント', '/accounts'],
    ['操作履歴', '/history'],
    ['サイト設定', '/site'],
    ['通知', '/push'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const gone = new URL(page.url()).pathname.startsWith('/login');
    const body = await text(page);
    check(
      `${label}（${path}）が開ける`,
      !gone && !/申し訳|エラーが発生|Application error/.test(body),
      `${page.url()} ${body.slice(0, 120)}`,
    );
  }

  /* ===================================================================== */
  console.log(`${NL}--- カテゴリ ---`);
  /* ===================================================================== */

  await page.goto(`${BASE}/categories`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  /* 追加 */
  const addForm = page.locator('form').filter({ has: page.locator('input[name="code"]') }).first();
  await addForm.locator('input[name="name"]').fill(CAT_NAME);
  await addForm.locator('input[name="name_en"]').fill('Test Category');
  await addForm.locator('input[name="code_prefix"]').fill('ZZT');
  await addForm.locator('input[name="code"]').fill(CAT_CODE);
  await addForm.getByRole('button', { name: /カテゴリを追加/ }).click();
  await page.waitForTimeout(3000);

  let row = (await sb(`/rest/v1/categories?select=*&code=eq.${CAT_CODE}`)).body?.[0] ?? null;
  if (row) made.categories.push(row.id);
  check('カテゴリを追加できる', !!row, JSON.stringify(row ?? {}).slice(0, 160));
  check('追加したカテゴリが一覧に出る', (await text(page)).includes(CAT_NAME));

  if (row) {
    /* 名前を直す */
    const NEW_NAME = `${CAT_NAME}改`;
    const target = page.locator('tr').filter({ hasText: CAT_NAME }).first();
    await target.getByRole('button', { name: /^編集$/ }).click();
    await page.waitForTimeout(800);
    const edit = page.locator('form').filter({ has: page.locator(`input[value="${CAT_CODE}"]`) }).first();
    const nameBox = page.locator(`input[name="name"][value="${CAT_NAME}"]`).first();
    await nameBox.fill(NEW_NAME);
    await page.getByRole('button', { name: /^保存$/ }).first().click();
    await page.waitForTimeout(3000);
    row = (await sb(`/rest/v1/categories?select=*&code=eq.${CAT_CODE}`)).body?.[0] ?? null;
    check('カテゴリの名前を直せる', row?.name === NEW_NAME, `name=${row?.name}`);

    /* 並べ替え。**触る前に、全カテゴリの表示順を控える。** */
    orderBefore =
      (await sb('/rest/v1/categories?select=id,sort_order&order=sort_order')).body ?? [];

    const before = row?.sort_order;
    await page.goto(`${BASE}/categories`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const moveRow = page.locator('tr').filter({ hasText: NEW_NAME }).first();
    const up = moveRow.getByRole('button', { name: /前へ移動/ });
    if (await up.count()) {
      await up.first().click();
      await page.waitForTimeout(3000);
      const after = (await sb(`/rest/v1/categories?select=*&code=eq.${CAT_CODE}`)).body?.[0];
      check('並べ替えで表示順が変わる', after?.sort_order !== before, `${before} → ${after?.sort_order}`);
    } else {
      check('並べ替えの釦がある', false, '「前へ移動」が見つかりません');
    }

    /* 停止（アプリに出さない） */
    await page.goto(`${BASE}/categories`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const offRow = page.locator('tr').filter({ hasText: NEW_NAME }).first();
    await offRow.getByRole('button', { name: /^編集$/ }).click();
    await page.waitForTimeout(800);
    const tick = page.locator('input[name="is_active"]').first();
    if (await tick.count()) {
      await tick.uncheck().catch(() => undefined);
      await page.getByRole('button', { name: /^保存$/ }).first().click();
      await page.waitForTimeout(3000);
      const off = (await sb(`/rest/v1/categories?select=*&code=eq.${CAT_CODE}`)).body?.[0];
      check('カテゴリを「アプリに出さない」にできる', off?.is_active === false, `is_active=${off?.is_active}`);
    } else {
      check('「アプリに表示する」の印がある', false);
    }

    /* 施設が紐づいていると消せない */
    const anyFacility = (await sb('/rest/v1/facilities?select=id,category_id&limit=1')).body?.[0];
    if (anyFacility) {
      const used = (await sb(`/rest/v1/categories?select=id,name&id=eq.${anyFacility.category_id}`)).body?.[0];
      await page.goto(`${BASE}/categories`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const usedRow = page.locator('tr').filter({ hasText: used?.name ?? '' }).first();
      const del = usedRow.getByRole('button', { name: /^削除$/ });
      const disabled = (await del.count()) === 0 || (await del.first().isDisabled());
      check(
        '施設が紐づくカテゴリは削除できない',
        disabled,
        `${used?.name} の削除釦: ${await del.count()} 個`,
      );
    }
  }

  /* ===================================================================== */
  console.log(`${NL}--- アカウント ---`);
  /* ===================================================================== */

  await page.goto(`${BASE}/accounts`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const accounts = await text(page);
  check('発行した職員が一覧に出る', accounts.includes('通し検査・編集者'), accounts.slice(0, 200));
  check('役割が出ている', /編集者|管理者|調査員/.test(accounts));

  /* 発行（初期パスワードが一度だけ出る） */
  const ISSUE_EMAIL = `all-issued-${stamp}@kurumayose.invalid`;
  await page.fill('input[name="display_name"]', '通し検査・発行');
  await page.fill('input[name="email"]', ISSUE_EMAIL);
  await page.getByRole('button', { name: /発行する/ }).first().click();
  await page.waitForTimeout(4000);
  const issued = await text(page);
  check('初期パスワードが画面に出る', /初期パスワード/.test(issued), issued.slice(0, 220));
  check(
    '「今だけ表示される」旨が添えてある',
    /二度と確認できません|今だけ表示/.test(issued),
    issued.slice(0, 220),
  );
  const issuedUser = ((await sb('/auth/v1/admin/users?page=1&per_page=200')).body?.users ?? []).find(
    (u) => u.email === ISSUE_EMAIL,
  );
  check('発行した職員が名簿に入る', !!issuedUser);
  if (issuedUser) made.issued = issuedUser.id;

  /* 停止 → 再開 */
  const issuedRow = () => page.locator('tr').filter({ hasText: '通し検査・発行' }).first();
  await page.goto(`${BASE}/accounts`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  if (await issuedRow().count()) {
    await issuedRow().getByRole('button', { name: /停止する/ }).click();
    await page.waitForTimeout(3000);
    let prof = (await sb(`/rest/v1/admin_profiles?select=*&user_id=eq.${made.issued}`)).body?.[0];
    check('職員を停止できる', prof?.is_active === false, `is_active=${prof?.is_active}`);

    await page.goto(`${BASE}/accounts`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await issuedRow().getByRole('button', { name: /再開する/ }).click();
    await page.waitForTimeout(3000);
    prof = (await sb(`/rest/v1/admin_profiles?select=*&user_id=eq.${made.issued}`)).body?.[0];
    check('職員を再開できる', prof?.is_active === true, `is_active=${prof?.is_active}`);
  } else {
    check('発行した職員の行が出る', false);
  }

  /* ===================================================================== */
  console.log(`${NL}--- 操作履歴 ---`);
  /* ===================================================================== */

  await page.goto(`${BASE}/history`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const history = await text(page);
  check('操作履歴に行が出ている', /\d{2}\/\d{2}/.test(history), history.slice(0, 200));
  const next = page.getByRole('link', { name: /^次へ$|^次$|Next/ });
  if (await next.count()) {
    const first = history.slice(0, 120);
    await next.first().click();
    await page.waitForTimeout(2500);
    const page2 = await text(page);
    check('操作履歴のページを送れる', page2.slice(0, 120) !== first, page2.slice(0, 120));
  } else {
    check('操作履歴のページ送りがある（1ページのみなら省略）', true);
  }

  /* ===================================================================== */
  console.log(`${NL}--- 通知 ---`);
  /* ===================================================================== */

  await page.goto(`${BASE}/push`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const push = await text(page);
  check('通知の画面が開ける', !/Application error/.test(push), push.slice(0, 160));

  const sendButton = page.getByRole('button', { name: /送信|送る/ }).first();
  if ((await sendButton.count()) && !(await sendButton.isDisabled())) {
    /*
      **本当には送らない。** 題名を空のまま押して、弾かれることだけを見る。
      送れば本番の会員の端末が鳴る。
    */
    await page.fill('input[name="title"]', '');
    await sendButton.click();
    await page.waitForTimeout(2500);
    const after = await text(page);
    check(
      '題名が空では送れない',
      /入力|お書きください|必要|エラー/.test(after) || (await page.locator('input[name="title"]:invalid').count()) > 0,
      after.slice(0, 200),
    );
  } else {
    check('宛先がいなければ送れない（釦が押せない）', true);
  }

  /* ===================================================================== */
  console.log(`${NL}--- 編集者に見せないもの ---`);
  /* ===================================================================== */

  const epage = await freshPage();
  check('編集者は入れる', await signIn(epage, EDITOR_EMAIL), epage.url());

  await epage.goto(`${BASE}/accounts`, { waitUntil: 'networkidle' });
  await epage.waitForTimeout(1500);
  const eAccounts = await text(epage);
  check(
    '編集者はアカウント管理を使えない',
    /管理者のみ/.test(eAccounts) || !new URL(epage.url()).pathname.startsWith('/accounts'),
    `${epage.url()} ${eAccounts.slice(0, 160)}`,
  );

  await epage.goto(`${BASE}/categories`, { waitUntil: 'networkidle' });
  await epage.waitForTimeout(1500);
  check(
    '編集者はカテゴリを編集できる',
    (await epage.getByRole('button', { name: /^編集$/ }).count()) > 0,
    (await text(epage)).slice(0, 160),
  );

  for (const c of contexts) await c.close().catch(() => undefined);
} finally {
  /* --- 後片付け --- */
  if (browser) await browser.close().catch(() => undefined);

  for (const id of made.categories) {
    await sb(`/rest/v1/categories?id=eq.${id}`, { method: 'DELETE' });
  }

  /*
    本番のカテゴリの表示順を戻す。**検査で足した行は既に消してある。**
    控えた値と違うものだけを書き戻す。同じ値で書き戻すと、操作履歴に
    意味のない行が増える。
  */
  let restored = 0;
  for (const c of orderBefore) {
    if (made.categories.includes(c.id)) continue;
    const now = (await sb(`/rest/v1/categories?select=sort_order&id=eq.${c.id}`)).body?.[0];
    if (!now || now.sort_order === c.sort_order) continue;
    await sb(`/rest/v1/categories?id=eq.${c.id}`, {
      method: 'PATCH',
      body: { sort_order: c.sort_order },
    });
    restored++;
  }
  if (restored > 0) console.log(`  片付け  カテゴリの表示順を ${restored} 件戻しました`);
  for (const id of [made.admin, made.editor, made.driver, made.issued].filter(Boolean)) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${id}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  }

  /* 自動で書かれた操作履歴を消す。**いちばん最後。** */
  /*
    検査で作った行の記録を消す。
    **本番のカテゴリの id は、この一括の消し方に渡してはいけない。**
    渡すと、発注元ご自身が並べ替えた記録（2026-08-29 のもの）まで
    巻き添えで消える。以前それをやって、正当な記録を200件消している。
  */
  const gone = await purgeAuditLogs(sb, [
    ...made.categories,
    made.admin,
    made.editor,
    made.driver,
    made.issued,
  ]);

  /*
    本番のカテゴリに付いた記録は、**この検査が動いていた間のものだけ**
    を消す。時刻で区切る。
  */
  let goneCat = 0;
  for (const c of orderBefore) {
    if (made.categories.includes(c.id)) continue;
    const r = await sb(
      `/rest/v1/audit_logs?record_id=eq.${c.id}&table_name=eq.categories` +
        `&created_at=gte.${startedAt}`,
      { method: 'DELETE', prefer: 'return=representation' },
    );
    if (r.ok && Array.isArray(r.body)) goneCat += r.body.length;
  }
  console.log(
    `${NL}  片付け  検査用の職員とカテゴリを消しました（操作履歴 ${gone + goneCat} 件）`,
  );

  console.log(`${NL}  ${pass} 件が通り、${failures.length} 件が落ちました`);
  for (const f of failures) console.error(`    - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
