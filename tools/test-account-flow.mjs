/**
 * 会員登録からログアウトまでを、実際の画面で通す。
 *
 *   node tools/test-account-flow.mjs                        手元の書き出し (4173)
 *   node tools/test-account-flow.mjs http://localhost:4180
 *
 * **後片付けまでが検査**
 *   発注元の本番に、検査で作った会員を残さない。最後に必ず消し、
 *   名簿からも消えたことを確かめる。以前、検査で作った操作履歴を
 *   190件ほど残してしまったことがある。同じことを繰り返さない。
 *
 * **登録が閉じていても止まらない**
 *   Supabase 側で新規登録を閉じていると、画面からは作れない。
 *   そこで打ち切ると、ログインも無料期間も表示も何ひとつ確かめられない。
 *   その場合だけ鍵で相手を作り、ログインから先を通す。
 *   「登録が開いているか」は不合格のまま残す。ごまかさない。
 *
 * 見るのは8点。
 *   1. Supabase 側の設定（新規登録が開いているか、確認メールを求めるか）
 *   2. 画面から新規登録できること
 *   3. 名簿に行ができ、無料期間が「1か月後」になっていること
 *   4. 開き直しても無料期間が延びないこと
 *   5. マイページに残り日数が出ること
 *   6. ログアウトできること
 *   7. ログインし直せること／誤ったパスワードは断ること
 *   8. 消すと名簿からも消えること
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');

function env(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const appEnv = env('app/.env.local');
const adminEnv = env('admin/.env.local');
const URL_ = appEnv.EXPO_PUBLIC_SUPABASE_URL;
const ANON = appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = adminEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) throw new Error('接続先または鍵がありません');

/** RLS を迂回する鍵。後片付けと突き合わせにだけ使う。 */
const svc = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
};

/*
  検査用の相手。

  example.com は規格で予約された、誰にも届かない領域。
  万一メールが飛んでも、実在の誰かへは届かない。
*/
const EMAIL = `kn-test-${Date.now()}@example.com`;
const PASSWORD = 'kn-test-password-2026';

let pass = 0;
const failures = [];
function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label} ${detail}`);
  }
}

const profileOf = async (userId) => {
  const r = await fetch(`${URL_}/rest/v1/driver_profiles?user_id=eq.${userId}&select=*`, {
    headers: svc,
  });
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
};

const findUser = async (email) => {
  const r = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: svc });
  const j = await r.json();
  return (j.users ?? []).find((u) => u.email === email) ?? null;
};

let browser = null;
let userId = null;

try {
  console.log(`会員登録の通しの検査: ${BASE}\n`);

  // --- 1. Supabase 側の設定 ---------------------------------------------------
  const settings = await (
    await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: ANON } })
  ).json();

  console.log('--- Supabase の設定 ---');
  const signupOpen = settings.disable_signup !== true;
  check(
    '新規登録が開いている',
    signupOpen,
    'Authentication → Sign In / Providers → Email の「Allow new users to sign up」が入っていない',
  );
  console.log(
    `  （参考）確認メール: ${settings.mailer_autoconfirm ? '求めない（自動で確認済み）' : '求める'}`,
  );

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const goAccount = async () => {
    await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const skip = page.getByRole('button', { name: /導入を飛ばす|Skip the intro/ });
    if (await skip.count()) await skip.first().click().catch(() => {});
    await page.waitForTimeout(800);
  };

  const signedInNow = async () => (await page.getByText('無料期間').count()) > 0;

  const fillIn = async (p, pass_) => {
    await p.getByLabel('メールアドレス').fill(EMAIL);
    await p.getByLabel('パスワード', { exact: true }).fill(pass_);
  };

  // --- 2. 画面から新規登録 -----------------------------------------------------
  console.log('\n--- 新規登録 ---');
  await goAccount();
  await page.getByRole('tab', { name: /新規登録/ }).click();
  await fillIn(page, PASSWORD);
  await page.getByRole('button', { name: '登録する' }).click();
  await page.waitForTimeout(4000);

  let inside = await signedInNow();
  check(
    '画面から新規登録できる',
    inside,
    (await page.locator('[role="alert"]').allInnerTexts()).join(' / ') || '登録後の画面にならない',
  );

  /*
    登録が閉じている場合の回り道。

    鍵で相手を作り、ログインから先を通す。ここを通しておかないと、
    設定を開けたあとに何が動くのか誰にも分からない。
  */
  if (!inside && !signupOpen) {
    console.log('\n  登録が閉じているため、鍵で相手を作ってログインから確かめます。');
    const made = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: 'POST',
      headers: svc,
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
    });
    check('（回り道）鍵で相手を作れた', made.ok, `${made.status}`);

    await goAccount();
    await fillIn(page, PASSWORD);
    await page.getByRole('button', { name: 'ログイン' }).last().click();
    await page.waitForTimeout(4000);
    inside = await signedInNow();
    check('（回り道）作った相手でログインできる', inside);
  }

  if (inside) {
    // --- 3. 名簿の行と無料期間 -------------------------------------------------
    console.log('\n--- 名簿 ---');
    userId = (await findUser(EMAIL))?.id ?? null;
    check('利用者ができている', !!userId);

    const row = userId ? await profileOf(userId) : null;
    check('名簿に行ができている', !!row);

    if (row) {
      check('状態は trial', row.status === 'trial', row.status);

      /*
        無料期間が「登録から1か月」か。

        月の長さは 28〜31 日で揺れる。日数を決め打ちにすると、
        2月に走らせたときだけ落ちる検査になる。幅を持たせる。
      */
      const days = (new Date(row.trial_ends_at) - new Date(row.created_at)) / 86_400_000;
      check('無料期間が登録から1か月', days >= 27.5 && days <= 31.5, `${days.toFixed(2)} 日`);

      // --- 4. 何度開いても延びないこと ----------------------------------------
      const before = row.trial_ends_at;
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(3500);
      const again = await profileOf(userId);
      check(
        '開き直しても無料期間が延びない',
        again?.trial_ends_at === before,
        `${before} → ${again?.trial_ends_at}`,
      );
    }

    // --- 5. マイページの表示 ---------------------------------------------------
    console.log('\n--- マイページ ---');
    await page.goto(`${BASE}/mypage`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const mypage = await page.locator('body').innerText();
    check('マイページにメールアドレスが出ている', mypage.includes(EMAIL));
    check(
      'マイページに残り日数が出ている',
      /無料期間 残り \d+ 日/.test(mypage),
      (mypage.match(/無料期間[^\n]*/) ?? ['なし'])[0],
    );

    // --- 6. ログアウト ---------------------------------------------------------
    console.log('\n--- ログアウト ---');
    await goAccount();
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await page.waitForTimeout(800);
    await page.getByTestId('confirm-accept').click();
    await page.waitForTimeout(3000);
    check(
      'ログアウトすると入力の画面へ戻る',
      (await page.getByRole('tab', { name: /新規登録/ }).count()) === 1,
    );

    // --- 7. ログインし直す -----------------------------------------------------
    console.log('\n--- ログインし直す ---');
    await fillIn(page, PASSWORD);
    await page.getByRole('button', { name: 'ログイン' }).last().click();
    await page.waitForTimeout(4000);
    check('同じ相手でログインし直せる', await signedInNow());

    console.log('\n--- 誤ったパスワード ---');
    const other = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await other.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
    await other.waitForTimeout(3000);
    const sk = other.getByRole('button', { name: /導入を飛ばす|Skip the intro/ });
    if (await sk.count()) await sk.first().click().catch(() => {});
    await other.waitForTimeout(600);
    await fillIn(other, 'まちがったぱすわーど');
    await other.getByRole('button', { name: 'ログイン' }).last().click();
    await other.waitForTimeout(3500);
    const alert = (await other.locator('[role="alert"]').allInnerTexts()).join(' ');
    check(
      '誤ったパスワードは断り、理由を日本語で出す',
      alert.includes('メールアドレスかパスワードが違います'),
      alert || '何も出ない',
    );
    await other.close();
  }
} finally {
  // --- 8. 後片付け -------------------------------------------------------------
  console.log('\n--- 後片付け ---');
  if (!userId) userId = (await findUser(EMAIL))?.id ?? null;
  if (userId) {
    await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svc });
  }

  check('検査で作った利用者を消した', !(await findUser(EMAIL)));
  if (userId) {
    const row = await profileOf(userId);
    check('名簿の行も一緒に消えた', !row, row ? JSON.stringify(row) : '');
  }

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
