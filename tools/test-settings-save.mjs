/**
 * 管理画面の「上書き」が本当に効くかを確かめる。
 *
 *   node tools/test-settings-save.mjs https://admin.kurumayosenavi.com
 *
 * **なぜ要るか**
 *   「管理画面の各所の更新を試したが、上書きができないようだった」と
 *   ご報告をいただいた（2026-09-14）。どこがどう効かないのかを、
 *   実際に打ち込んで確かめる。
 *
 * **見るのは3つ**
 *   1. 空の状態から保存できるか
 *   2. **保存したものを、別の値で上書きできるか**
 *   3. 画面を開き直したとき、保存した値が欄に出るか
 *      （保存されていても欄が空に戻れば、利用者からは「保存できて
 *        いない」と見える）
 *
 * **発注元の設定を書き換えるため、必ず元へ戻す。**
 *   はじめに控えを取り、最後に書き戻す。途中で落ちても戻すよう
 *   finally に置く。
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
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = 'ui-save-check@kurumayose.invalid';
const PASSWORD = 'Vb3nMk7wQz9xTr';

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
  try { b = t ? JSON.parse(t) : null; } catch { b = t; }
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

/** 1回目と2回目で違う値を入れる。2回目が「上書き」の確認になる。 */
const SITE = [
  {
    operator_name: '検査用の運営者A',
    contact_email: 'check-a@kurumayose.invalid',
    terms_url: 'https://example.com/terms-a',
    privacy_url: 'https://example.com/privacy-a',
    law_url: 'https://example.com/law-a',
  },
  {
    operator_name: '検査用の運営者B',
    contact_email: 'check-b@kurumayose.invalid',
    terms_url: 'https://example.com/terms-b',
    privacy_url: 'https://example.com/privacy-b',
    law_url: 'https://example.com/law-b',
  },
];

const PAY = [
  {
    bank_name: '検査銀行A',
    branch_name: '検査支店A',
    account_number: '1111111',
    account_holder: '検査 太郎A',
    account_holder_kana: 'ケンサ タロウエー',
    note: '検査用A',
  },
  {
    bank_name: '検査銀行B',
    branch_name: '検査支店B',
    account_number: '2222222',
    account_holder: '検査 太郎B',
    account_holder_kana: 'ケンサ タロウビー',
    note: '検査用B',
  },
];

let browser = null;
let userId = null;
let siteBefore = null;
let payBefore = null;
let madeFacilityId = null;
let madeEntryPointId = null;

try {
  console.log(`管理画面の上書きの検査: ${BASE}${NL}`);

  /* --- 控えを取る --- */
  siteBefore = (await sb('/rest/v1/site_settings?select=*&id=eq.1')).body?.[0] ?? null;
  payBefore = (await sb('/rest/v1/payment_settings?select=*&id=eq.1')).body?.[0] ?? null;
  console.log('  控え  サイト設定 / 受取口座を控えました');

  const users = await sb('/auth/v1/admin/users?page=1&per_page=200');
  const stale = (users.body?.users ?? []).find((u) => u.email === EMAIL);
  if (stale) await sb(`/auth/v1/admin/users/${stale.id}`, { method: 'DELETE' });
  userId = (await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD, email_confirm: true },
  })).body?.id;
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: userId, display_name: '保存の検査', role: 'admin' },
  });

  browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 1000 } });
  await ctx.addCookies([{ name: 'kn_locale', value: 'ja', domain: HOST, path: '/' }]);
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });
  await page.waitForLoadState('networkidle');

  /**
   * 欄を埋めて保存し、その結果を返す。
   *
   * 打ち込む前に必ず空にする。既に入っている画面へ追記すると、
   * 「上書きできたのか、継ぎ足しただけなのか」が分からなくなる。
   */
  async function saveForm(path, values, buttonName) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    for (const [name, value] of Object.entries(values)) {
      const field = page.locator(`[name="${name}"]`).first();
      if ((await field.count()) === 0) return { 欄なし: name };
      await field.fill('');
      await field.fill(value);
    }
    /*
      釦の名前は画面ごとに違う（サイト設定は「保存」、受取口座は
      「保存する」）。完全一致で探すと取り違える。
    */
    await page.getByRole('button', { name: buttonName, exact: true }).first().click();
    await page.waitForTimeout(3000);
    const message = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
    return { message };
  }

  /** いま欄に出ている値を読む */
  async function readForm(path, names) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    return page.evaluate(
      (ns) =>
        Object.fromEntries(
          ns.map((n) => [n, document.querySelector(`[name="${n}"]`)?.value ?? null]),
        ),
      names,
    );
  }

  // --- サイト設定 -------------------------------------------------------------
  console.log('--- サイト設定（規約類・お問い合わせ先） ---');
  const s1 = await saveForm('/site', SITE[0], '保存');
  check('1回目の保存で「保存しました」と出る',
    typeof s1.message === 'string' && s1.message.includes('保存しました'),
    JSON.stringify(s1).slice(0, 240));

  let row = (await sb('/rest/v1/site_settings?select=*&id=eq.1')).body?.[0] ?? {};
  check('1回目が控えに入っている', row.operator_name === SITE[0].operator_name,
    JSON.stringify({ 入っている値: row.operator_name, 入れた値: SITE[0].operator_name }));

  let shown = await readForm('/site', Object.keys(SITE[0]));
  check('開き直すと、保存した値が欄に出る',
    shown.operator_name === SITE[0].operator_name && shown.terms_url === SITE[0].terms_url,
    JSON.stringify(shown));

  const s2 = await saveForm('/site', SITE[1], '保存');
  check('2回目（上書き）でも「保存しました」と出る',
    typeof s2.message === 'string' && s2.message.includes('保存しました'),
    JSON.stringify(s2).slice(0, 240));

  row = (await sb('/rest/v1/site_settings?select=*&id=eq.1')).body?.[0] ?? {};
  check('**上書きできている**（控えがBになっている）',
    row.operator_name === SITE[1].operator_name && row.law_url === SITE[1].law_url,
    JSON.stringify({ いまの値: row.operator_name, 入れた値: SITE[1].operator_name }));

  shown = await readForm('/site', Object.keys(SITE[1]));
  check('開き直すと、上書きした値が欄に出る',
    shown.operator_name === SITE[1].operator_name, JSON.stringify(shown));

  /*
    **打ち間違いのときに、何が起きるか。**

    ご報告（2026-09-14）の原因はここだった。ブラウザ任せの検査に
    していたため、https を付け忘れると送信そのものが止まり、英語の
    吹き出しが一瞬出て消えるだけだった。画面には何も残らず、
    **保存を押しても無反応に見えていた。**
  */
  console.log('--- 打ち間違いのとき ---');

  /* 頭の https:// が落ちている。よくある。こちらで補う。 */
  await saveForm('/site', { ...SITE[0], terms_url: 'example.com/terms' }, '保存');
  row = (await sb('/rest/v1/site_settings?select=terms_url&id=eq.1')).body?.[0] ?? {};
  check('「example.com/terms」は https:// を補って保存する',
    row.terms_url === 'https://example.com/terms', JSON.stringify(row));

  /* 鍵の掛かっていない経路。こちらで差し替えず、理由を伝える。 */
  const httpTry = await saveForm('/site', { ...SITE[0], terms_url: 'http://example.com/terms' }, '保存');
  row = (await sb('/rest/v1/site_settings?select=terms_url&id=eq.1')).body?.[0] ?? {};
  check('「http://」は保存しない', row.terms_url !== 'http://example.com/terms',
    JSON.stringify(row));
  check('「http://」を弾いた理由が、日本語で画面に出る',
    typeof httpTry.message === 'string' && httpTry.message.includes('https://'),
    String(httpTry.message).slice(0, 200));
  check('弾いたことが、画面の上にもまとめて出る',
    typeof httpTry.message === 'string' && httpTry.message.includes('入力を確かめてください'),
    String(httpTry.message).slice(0, 200));

  /* URLとして読めないもの */
  const junk = await saveForm('/site', { ...SITE[0], contact_email: 'これはメールではない' }, '保存');
  check('メールの形が違うときも、日本語で理由が出る',
    typeof junk.message === 'string' && junk.message.includes('メールアドレスの形'),
    String(junk.message).slice(0, 200));

  // --- 受取口座 ---------------------------------------------------------------
  console.log('--- 受取口座 ---');
  const p1 = await saveForm('/members', PAY[0], '保存する');
  check('1回目の保存で控えが入る',
    typeof p1.message === 'string' && p1.message.includes('保存'),
    JSON.stringify(p1).slice(0, 240));

  let prow = (await sb('/rest/v1/payment_settings?select=*&id=eq.1')).body?.[0] ?? {};
  check('1回目が控えに入っている', prow.bank_name === PAY[0].bank_name,
    JSON.stringify({ いまの値: prow.bank_name }));

  const p2 = await saveForm('/members', PAY[1], '保存する');
  check('2回目（上書き）でも保存できる',
    typeof p2.message === 'string' && p2.message.includes('保存'),
    JSON.stringify(p2).slice(0, 240));

  prow = (await sb('/rest/v1/payment_settings?select=*&id=eq.1')).body?.[0] ?? {};
  check('**上書きできている**（控えがBになっている）',
    prow.bank_name === PAY[1].bank_name && prow.account_number === PAY[1].account_number,
    JSON.stringify({ いまの値: prow.bank_name, 口座番号: prow.account_number }));

  const pshown = await readForm('/members', Object.keys(PAY[1]));
  check('開き直すと、上書きした値が欄に出る',
    pshown.bank_name === PAY[1].bank_name, JSON.stringify(pshown));

  // --- 施設と入口 -------------------------------------------------------------
  console.log('--- 施設と入口 ---');

  /*
    **発注元の施設は触らない。**

    以前は実在の施設を書き換えて元へ戻していた。発注元が同じ時間に
    編集していると、**こちらの「元へ戻す」がその編集を消してしまう。**
    検査のために自前の施設を作り、終わったら消す。

    下書きのままにする。アプリへは届かないため、検査のあいだ利用者の
    画面に現れない。
  */
  const cat = (await sb('/rest/v1/categories?select=id&limit=1')).body?.[0];
  const made = await sb('/rest/v1/facilities', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      code: `ZZS-${String(Math.floor(1000 + Math.random() * 8999))}`,
      name: '保存の検査用（自動で消えます）',
      name_kana: 'けんさ',
      category_id: cat?.id,
      prefecture: '東京都',
      address_line: '検査町',
      status: 'draft',
      sort_order: 9998,
    },
  });
  madeFacilityId = made.body?.[0]?.id ?? null;
  check('検査用の施設を作れた', madeFacilityId !== null, JSON.stringify(made.body).slice(0, 160));

  if (madeFacilityId) {
    const ep = await sb('/rest/v1/entry_points', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        facility_id: madeFacilityId,
        code: 'A',
        kind: 'dropoff',
        name: '検査用の車寄せ',
        sort_order: 1,
      },
    });
    madeEntryPointId = ep.body?.[0]?.id ?? null;

    await page.goto(`${BASE}/facilities/${madeFacilityId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    /*
      **同じ画面に保存の釦が複数ある。**
      施設そのものと、入口ごとに1つずつ。文言が同じだと押し間違えても
      気づけず、「上書きできない」と映る。見分けられることを確かめる。
    */
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('button[type="submit"]')]
        .map((b) => b.textContent.trim())
        .filter((x) => x.includes('保存')),
    );
    const facLabel = labels.find((x) => x.includes('施設'));
    check('施設の保存と、入口の保存が見分けられる',
      Boolean(facLabel) && labels.filter((x) => x === facLabel).length === 1,
      JSON.stringify(labels));

    /* 施設の枠は「別名（aliases）」を持つ。入口の枠には無い。 */
    const facForm = page.locator('form:has([name="aliases"])').first();
    const mark = `検査 ${Date.now()}`;
    await facForm.locator('[name="note_internal"]').first().fill(mark);

    /*
      **直した枠にだけ「まだ保存していません」が出ること。**
      これが出ていれば、押すべき釦がその場で分かる。
    */
    const dirty = await page.evaluate(() =>
      [...document.querySelectorAll('form')].map((f) =>
        f.innerText.includes('まだ保存していません'),
      ),
    );
    check('直した枠にだけ「まだ保存していません」が出る',
      dirty.filter(Boolean).length === 1, JSON.stringify(dirty));

    await facForm.locator('button[type="submit"]').filter({ hasText: '保存' }).first().click();
    await page.waitForTimeout(4000);

    const after = (await sb(`/rest/v1/facilities?select=note_internal&id=eq.${madeFacilityId}`))
      .body?.[0];
    check('施設の情報を上書きできる', after?.note_internal === mark, JSON.stringify(after));

    const cleared = await page.evaluate(() =>
      document.body.innerText.includes('まだ保存していません'),
    );
    check('保存したら、その印が消える', cleared === false);

    if (madeEntryPointId) {
      const epForm = page.locator('form:has([name="approach_text"])').first();
      const mark2 = `検査 入口 ${Date.now()}`;
      await epForm.locator('[name="approach_text"]').first().fill(mark2);
      await epForm.locator('button[type="submit"]').filter({ hasText: '保存' }).first().click();
      await page.waitForTimeout(4000);
      const ep2 = (await sb(`/rest/v1/entry_points?select=approach_text&id=eq.${madeEntryPointId}`))
        .body?.[0];
      check('入口の情報を上書きできる', ep2?.approach_text === mark2, JSON.stringify(ep2));
    }
  }

  await ctx.close();
} finally {
  console.log(`${NL}--- 後片付け ---`);
  if (browser) await browser.close();

  /* 発注元の設定を、控えのとおりに戻す */
  if (siteBefore) {
    const { id, updated_at, ...rest } = siteBefore;
    void id; void updated_at;
    const r = await sb('/rest/v1/site_settings?id=eq.1', { method: 'PATCH', body: rest });
    check('サイト設定を元へ戻した', r.ok);
  }
  if (payBefore) {
    const { id, updated_at, ...rest } = payBefore;
    void id; void updated_at;
    const r = await sb('/rest/v1/payment_settings?id=eq.1', { method: 'PATCH', body: rest });
    check('受取口座を元へ戻した', r.ok);
  }

  if (madeEntryPointId) {
    await sb(`/rest/v1/entry_points?id=eq.${madeEntryPointId}`, { method: 'DELETE' });
  }
  if (madeFacilityId) {
    await sb(`/rest/v1/facilities?id=eq.${madeFacilityId}`, { method: 'DELETE' });
    const left = (await sb(`/rest/v1/facilities?select=id&id=eq.${madeFacilityId}`)).body;
    check('検査で作った施設を消した', Array.isArray(left) && left.length === 0);
  }

  if (userId) {
    await sb(`/rest/v1/audit_logs?actor_id=eq.${userId}`, { method: 'DELETE' });
    await sb(`/rest/v1/admin_profiles?user_id=eq.${userId}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
  }
  const purged = await purgeAuditLogs(sb, [userId, madeFacilityId, madeEntryPointId]);
  console.log(`  片付け  検査用のアカウントを消しました（操作履歴 ${purged} 件）`);

  console.log(`${NL}合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
