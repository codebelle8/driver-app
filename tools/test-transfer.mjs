/**
 * 銀行振込のご案内を見る。
 *
 *   node tools/test-transfer.mjs                        手元の書き出し (4173)
 *   node tools/test-transfer.mjs http://localhost:4180
 *
 * **発注元の受取口座を壊さない**
 *   まだ空であれば、検査用の値を入れて、終わったら空へ戻す。
 *   既に入っていれば**書き換えない**。入っているものを使って確かめる。
 *   検査のために本番の振込先を書き換えるのは、桁が違う事故になる。
 *
 * 見るのは7点。
 *   1. 料金を選ぶ前は、振込先を出さないこと
 *   2. 選ぶと、金融機関・口座・名義・金額が出ること
 *   3. 会員番号が出て、振込名義に添える案内があること
 *   4. どの銀行からでも振り込める旨が書いてあること
 *   5. 受取口座が空のときは「準備中」と出ること
 *   6. 会員は受取口座を書き換えられないこと
 *   7. 後片付け
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');

const env = (p) => {
  const o = {};
  for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return o;
};
const appEnv = env('app/.env.local');
const adminEnv = env('admin/.env.local');
const URL_ = appEnv.EXPO_PUBLIC_SUPABASE_URL;
const ANON = appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = adminEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) throw new Error('接続先または鍵がありません');

const svc = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
};

const EMAIL = `kn-tr-${Date.now()}@example.com`;
const PASSWORD = 'kn-tr-password-2026';

const TEST_BANK = {
  bank_name: '検査銀行',
  branch_name: '検査支店',
  account_type: 'futsu',
  account_number: '1234567',
  account_holder: '検査 太郎',
  account_holder_kana: 'ケンサ タロウ',
  note: null,
};

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label} ${detail}`);
  }
};

const readSettings = async () => {
  const r = await fetch(`${URL_}/rest/v1/payment_settings?id=eq.1&select=*`, { headers: svc });
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
};

const writeSettings = (patch) =>
  fetch(`${URL_}/rest/v1/payment_settings?id=eq.1`, {
    method: 'PATCH',
    headers: svc,
    body: JSON.stringify(patch),
  });

let browser = null;
let userId = null;
let wasEmpty = false;

try {
  console.log(`銀行振込のご案内の検査: ${BASE}\n`);

  const before = await readSettings();
  if (!before) {
    check('受取口座の置き場所がある', false, 'payment_settings が無い（SQL 未適用）');
    throw new Error('中止');
  }
  check('受取口座の置き場所がある', true);

  wasEmpty = !before.bank_name;
  console.log(
    wasEmpty
      ? '  （受取口座は空。検査用の値を入れ、終わったら空へ戻します）'
      : '  （受取口座は入力済み。書き換えず、そのまま確かめます）',
  );

  const made = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svc,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  userId = (await made.json()).id ?? null;
  check('検査用の会員を作れた', !!userId);
  if (!userId) throw new Error('中止');

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const skip = async () => {
    const s = page.getByRole('button', { name: /導入を飛ばす/ });
    if (await s.count()) await s.first().click().catch(() => {});
    await page.waitForTimeout(1000);
  };

  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await skip();
  await page.getByLabel('メールアドレス').fill(EMAIL);
  await page.getByLabel('パスワード', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'ログイン' }).last().click();
  await page.waitForTimeout(5000);

  const openPayment = async () => {
    await page.goto(`${BASE}/plan`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await skip();
    return page.locator('body').innerText();
  };

  // --- 1. 選ぶ前は出さない ----------------------------------------------------
  console.log('\n--- 料金を選ぶ前 ---');
  const beforePick = await openPayment();
  check('選ぶ前は振込先を出さない', !beforePick.includes('お振込先'), beforePick.slice(0, 90));

  // --- 5. 受取口座が空のとき ---------------------------------------------------
  if (wasEmpty) {
    console.log('\n--- 受取口座が空のとき ---');
    await page.getByRole('radio', { name: '1か月' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'この内容で申し込む' }).click();
    await page.waitForTimeout(4000);
    const empty = await openPayment();
    check('口座が空なら準備中と出す', empty.includes('準備中'), empty.slice(0, 120));
    check('空の振込先を出さない', !empty.includes('お振込金額'), '');

    await writeSettings(TEST_BANK);
  } else {
    // 既に入っている場合は、料金だけ選んでおく
    await page.getByRole('radio', { name: '1か月' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'この内容で申し込む' }).click();
    await page.waitForTimeout(4000);
  }

  // --- 2〜4. 振込先が出る ------------------------------------------------------
  console.log('\n--- 振込先 ---');
  const now = wasEmpty ? TEST_BANK : before;
  const shown = await openPayment();

  check('お振込先が出る', shown.includes('お振込先'), shown.slice(0, 90));
  check('金融機関が出る', shown.includes(now.bank_name), now.bank_name);
  check('口座番号が出る', shown.includes(now.account_number), now.account_number);
  check(
    '口座名義が出る',
    shown.includes(now.account_holder_kana ?? now.account_holder ?? ''),
    String(now.account_holder_kana ?? now.account_holder),
  );
  /* 1か月は 600円（2026-10-04）。金額と期間を別に出す。 */
  check('お振込金額が出る', shown.includes('600 円'), shown.slice(0, 120));
  check('何か月ぶんかが出る', shown.includes('1か月'), shown.slice(0, 120));
  check(
    'どの銀行からでも振り込める旨がある',
    shown.includes('どの銀行からでも'),
    '',
  );

  const row = await (
    await fetch(`${URL_}/rest/v1/driver_profiles?user_id=eq.${userId}&select=member_no`, {
      headers: svc,
    })
  ).json();
  const memberNo = Array.isArray(row) && row.length ? row[0].member_no : null;
  const code = memberNo != null && memberNo < 10000 ? String(memberNo).padStart(4, '0') : String(memberNo);
  check('会員番号が出る', memberNo != null && shown.includes(code), `会員番号=${memberNo}`);
  check('名義の前に付ける案内がある', shown.includes('お名前の前に'), '');

  // --- 6. 会員は受取口座を書き換えられない ------------------------------------
  console.log('\n--- 受取口座の守り ---');
  const signed = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const jwt = (await signed.json()).access_token;
  if (jwt) {
    const me = { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
    await fetch(`${URL_}/rest/v1/payment_settings?id=eq.1`, {
      method: 'PATCH',
      headers: me,
      body: JSON.stringify({ account_number: '9999999' }),
    });
    const after = await readSettings();
    check(
      '会員は受取口座を書き換えられない',
      after?.account_number !== '9999999',
      String(after?.account_number),
    );

    /* 読めることは確かめておく。読めないと振込先が出ない。 */
    const read = await fetch(`${URL_}/rest/v1/payment_settings?id=eq.1&select=bank_name`, {
      headers: me,
    });
    check('会員は受取口座を読める', read.ok, `${read.status}`);
  }
} catch (e) {
  if (String(e.message) !== '中止') throw e;
} finally {
  console.log('\n--- 後片付け ---');
  if (wasEmpty) {
    await writeSettings({
      bank_name: null,
      branch_name: null,
      account_type: null,
      account_number: null,
      account_holder: null,
      account_holder_kana: null,
      note: null,
    });
    const back = await readSettings();
    check('受取口座を元の空へ戻した', !back?.bank_name, String(back?.bank_name));
  }
  if (userId) {
    await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svc });
    const r = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: svc });
    const j = await r.json();
    check('検査で作った会員を消した', !(j.users ?? []).some((u) => u.email === EMAIL));
  }

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
