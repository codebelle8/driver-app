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
 * 見るのは12点。
 *   1. Supabase 側の設定（新規登録が開いているか、確認メールを求めるか）
 *   2. 画面から新規登録できること
 *   3. 名簿に行ができ、無料期間が「1か月後」になっていること
 *   4. 開き直しても無料期間が延びないこと
 *   5. マイページに残り日数が出ること
 *   6. ログアウトできること
 *   7. ログインし直せること／誤ったパスワードは断ること
 *   8. 顔写真は、選んだだけでは変わらず、OK を押して初めて変わること
 *   9. 顔写真を押すと、プロフィール・設定・ログアウトが出ること
 *  10. 無料期間が切れると料金の案内が出て、1つ選んで申し込めること
 *  11. ログインしたままパスワードを変えられること（いまのを間違えたら断る）
 *  12. 消すと名簿からも消えること
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

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

/** 顔写真の検査に使う、その場で作った小さな画像 */
const workDir = mkdtempSync(join(tmpdir(), 'kn-avatar-'));
const TEST_IMAGE = join(workDir, 'face.jpg');
await sharp({
  create: { width: 240, height: 320, channels: 3, background: '#3b6ea5' },
})
  .jpeg()
  .toFile(TEST_IMAGE);

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

    /*
      時間ではなく、出るのを待つ。

      3.5秒の決め打ちにしていたところ、手元の込み具合によって間に
      合わず、ときどき落ちていた。落ちたり通ったりする検査は、
      直すべきものが出たときに信じてもらえなくなる。
    */
    await other
      .locator('[role="alert"]')
      .first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => {});
    const alert = (await other.locator('[role="alert"]').allInnerTexts()).join(' ');
    check(
      '誤ったパスワードは断り、理由を日本語で出す',
      alert.includes('メールアドレスかパスワードが違います'),
      alert || '何も出ない',
    );
    await other.close();

    // --- 8. 顔写真 -------------------------------------------------------------
    console.log('\n--- 顔写真 ---');
    await goAccount();

    const pickButton = page.getByRole('button', { name: '写真を選ぶ' });
    if ((await pickButton.count()) === 0) {
      check('顔写真の欄が出ている', false, 'ボタンが無い（列がまだ無い可能性）');
    } else {
      check('顔写真の欄が出ている', true);
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        pickButton.click(),
      ]);

      /*
        本物の枠に近づける。

        ブラウザは「窓へ戻る（focus）」を先に出し、「選ばれた（change）」を
        後から出す。以前これを 500ms しか待たずに片付けており、
        **写真を選んでも何も起きなかった。** 検査は setFiles で change を
        すぐ起こしていたため、素通りしていた。

        窓へ戻ったことを先に知らせ、少し置いてから選ぶ。
      */
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(1200);
      await chooser.setFiles(TEST_IMAGE);
      await page.waitForTimeout(5000);

      /*
        **選んだだけでは変えない。**

        選んだ時点で変えてしまうと、間違えて選んだときに元へ戻せない
        （前のものは消してある）。見てから決めていただく。
      */
      const beforeOk = await profileOf(userId);
      check('選んだだけでは、まだ変わらない', !beforeOk?.avatar_path, String(beforeOk?.avatar_path));
      check('OK が出ている', (await page.getByRole('button', { name: 'OK' }).count()) === 1);
      check('やめるが出ている', (await page.getByRole('button', { name: 'やめる' }).count()) === 1);

      // やめれば、何も起きない
      await page.getByRole('button', { name: 'やめる' }).click();
      await page.waitForTimeout(2000);
      const afterCancel = await profileOf(userId);
      check('やめると元のまま', !afterCancel?.avatar_path, String(afterCancel?.avatar_path));
      check(
        'やめると選び直せる',
        (await page.getByRole('button', { name: '写真を選ぶ' }).count()) === 1,
      );

      // 選び直して、OK を押す
      const [again] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: '写真を選ぶ' }).click(),
      ]);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(1200);
      await again.setFiles(TEST_IMAGE);
      await page.waitForTimeout(5000);
      await page.getByRole('button', { name: 'OK' }).click();
      await page.waitForTimeout(6000);

      const withPhoto = userId ? await profileOf(userId) : null;
      check(
        '名簿に顔写真の置き場所が入る',
        typeof withPhoto?.avatar_path === 'string' && withPhoto.avatar_path.startsWith(userId),
        String(withPhoto?.avatar_path),
      );

      /*
        置いた実体が読めるか。

        名簿だけ書き換わって実体が無い、という壊れ方をここで捕まえる。
      */
      if (withPhoto?.avatar_path) {
        const url = `${URL_}/storage/v1/object/public/avatars/${withPhoto.avatar_path}`;
        const got = await fetch(url);
        check('置いた顔写真が読み出せる', got.ok, `${got.status}`);
      }

      /*
        **画面に出ているか。**

        名簿と置き場所だけを見ていたため、画面が変わらない不具合を
        見逃していた。実際に「顔写真を変えても画面が変わらない」と
        ご指摘をいただいた。画面まで見る。
      */
      const shownOnScreen = async () =>
        page.evaluate(() => {
          for (const el of document.querySelectorAll('img')) {
            if ((el.getAttribute('src') ?? '').includes('/avatars/')) return true;
          }
          for (const el of document.querySelectorAll('*')) {
            const bg = getComputedStyle(el).backgroundImage;
            if (bg && bg.includes('/avatars/')) return true;
          }
          return false;
        });

      check('アカウントの画面に顔写真が出る', await shownOnScreen());

      // 上部の帯にも出ているか
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(4000);
      check('上部の帯にも顔写真が出る', await shownOnScreen());
      await goAccount();

      // 正方形へ縮めてから送っているか（元は 240x320）
      if (withPhoto?.avatar_path) {
        const url = `${URL_}/storage/v1/object/public/avatars/${withPhoto.avatar_path}`;
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        const meta = await sharp(buf).metadata();
        check(
          '送る前に正方形へ縮めている',
          meta.width === meta.height && meta.width <= 256,
          `${meta.width}x${meta.height}`,
        );
      }
    }

    // --- 9. 顔写真の品書き -----------------------------------------------------
    console.log('\n--- 顔写真の品書き ---');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    const menuButton = page.getByRole('button', { name: 'アカウントのメニュー' });
    check('上部の帯に顔写真が出ている', (await menuButton.count()) === 1);
    if ((await menuButton.count()) === 1) {
      await menuButton.click();
      await page.waitForTimeout(700);
      for (const label of ['プロフィール', '設定', 'ログアウト']) {
        check(`品書きに「${label}」がある`, (await page.getByText(label, { exact: true }).count()) > 0);
      }
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(400);
    }

    // --- 10. 料金の案内 --------------------------------------------------------
    console.log('\n--- 料金の案内 ---');

    /*
      置き場所はアカウントではなく設定。ご指示による。

      アカウントは「その人が誰か」、お支払いは「いくら払うか」で、
      見に行く理由が違う。
    */
    await goAccount();
    check(
      'アカウントの画面には料金を出さない',
      (await page.getByRole('button', { name: '料金プランを見る' }).count()) === 0,
    );
    await page.goto(`${BASE}/mypage`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const settings = await page.locator('body').innerText();
    check('設定に「お支払い」がある', settings.includes('お支払い'), settings.slice(0, 80));

    /* 設定では中身を広げない。押した方にだけ開く。ご指示による。 */
    check('設定では料金の中身をまだ出さない', !settings.includes('円 / 月'), settings.slice(0, 80));

    await page.getByRole('button', { name: 'お支払い' }).click();
    await page.waitForTimeout(3500);
    const paid = await page.locator('body').innerText();
    check('押すとお支払いの画面が開く', paid.includes('いまのご利用状況'), paid.slice(0, 100));
    check('その画面に月額 800 円がある', paid.includes('800 円 / 月'));
    check('その画面に年額 8,000 円がある', paid.includes('8,000 円 / 年'));
    check('請求が起きないことを書いてある', paid.includes('まだお支払いは発生しません'));
    check('期間後どうなるかを書いてある', paid.includes('引き続きお使いいただけます'));

    // 無料期間を切らせる（鍵で過去日にする）
    await fetch(`${URL_}/rest/v1/driver_profiles?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: svc,
      body: JSON.stringify({ trial_ends_at: '2026-01-01T00:00:00Z' }),
    });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    const banner = page.getByText('無料期間が終了しました');
    check('切れると探す画面に案内が出る', (await banner.count()) > 0);

    const openPlans = page.getByRole('button', { name: '料金プランを見る' });
    if ((await openPlans.count()) > 0) {
      await openPlans.first().click();
      await page.waitForTimeout(600);
      const body = await page.locator('body').innerText();
      check('月額 800 円が出ている', body.includes('800 円 / 月'), body.slice(0, 80));
      check('年額 8,000 円が出ている', body.includes('8,000 円 / 年'));

      // 選ばないうちは申し込めない
      const submit = page.getByRole('button', { name: 'この内容で申し込む' });
      check('選ぶまで申し込めない', await submit.isDisabled());

      await page.getByRole('radio', { name: '年額' }).click();
      await page.waitForTimeout(400);
      await submit.click();
      await page.waitForTimeout(4000);

      const chosen = await profileOf(userId);
      check('選んだ料金が名簿に入る', chosen?.plan === 'yearly', String(chosen?.plan));
      check(
        '選んだだけでは有料の扱いにしない',
        chosen?.status === 'trial',
        String(chosen?.status),
      );
    } else {
      check('料金プランを開ける', false, '釦が無い');
    }

    // --- 11. パスワードの変更 --------------------------------------------------
    console.log('\n--- パスワードの変更 ---');
    const NEXT_PASSWORD = 'kn-test-password-2027';
    await goAccount();

    const changeButton = page.getByRole('button', { name: 'パスワードを変える' });
    check('変更の欄が出ている', (await changeButton.count()) > 0);

    if ((await changeButton.count()) > 0) {
      // いまのパスワードを間違えたら断ること
      await page.getByLabel('いまのパスワード').fill('でたらめ');
      await page.getByLabel('新しいパスワード').fill(NEXT_PASSWORD);
      await changeButton.click();
      await page.waitForTimeout(3500);
      const said = (await page.locator('[role="alert"]').allInnerTexts()).join(' ');
      check('いまのパスワードが違えば断る', said.includes('いまのパスワードが違います'), said);

      // 正しく変えられること
      await page.getByLabel('いまのパスワード').fill(PASSWORD);
      await page.getByLabel('新しいパスワード').fill(NEXT_PASSWORD);
      await changeButton.click();
      await page.waitForTimeout(4500);

      const signedIn = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: NEXT_PASSWORD }),
      });
      check('新しいパスワードでログインできる', signedIn.ok, `${signedIn.status}`);
    }
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
  rmSync(workDir, { recursive: true, force: true });
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
