/**
 * 起動時の入口まわりを見る。
 *
 *   node tools/test-login.mjs                        手元の書き出し (4173)
 *   node tools/test-login.mjs http://localhost:4180
 *
 * ご指示（2026-09-09）で入れたもの:
 *   * 起動したら、まずログインの窓を出す
 *   * メールアドレスとパスワードを記憶し、次は押すだけで入れる
 *   * 登録にはパスワードの確認欄を置く
 *   * 足りていなかったところ（停止・退会・他の端末からログアウト）
 *
 * 見るのは8点。
 *   1. ログインしていなければ、入口が出る
 *   2. 記憶する印を付けて入ると、次は両方入っている
 *   3. その状態で、押すだけで入れる
 *   4. 印を外して入ると、パスワードは残らない
 *   5. 登録のとき、確認が食い違えば断る
 *   6. 停止した方は、ログインしても中へ通さない
 *   7. 停止を解けば、そのまま使える
 *   8. 退会するとアカウントも顔写真も消える
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, skipIntro } from './lib/member.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
const conn = connect();

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

const setStatus = (userId, status) =>
  fetch(`${conn.url}/rest/v1/driver_profiles?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: conn.svc,
    body: JSON.stringify({ status }),
  });

const stillThere = async (email) => {
  const r = await fetch(`${conn.url}/auth/v1/admin/users?per_page=200`, { headers: conn.svc });
  const j = await r.json();
  return (j.users ?? []).some((u) => u.email === email);
};

let browser = null;
let member = null;

try {
  console.log(`起動時の入口の検査: ${BASE}\n`);
  member = await createMember(conn, 'login');
  browser = await chromium.launch();

  /*
    ひとつの入れ物（localStorage を共有するブラウザ）で通す。

    「次に開いたとき」を確かめるには、同じ入れ物で開き直す必要がある。
    別の入れ物にすると、記憶したものが読めるはずもない。
  */
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();

  const open = async (path = '/') => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    await skipIntro(page);
  };

  const emailField = () => page.getByLabel('メールアドレス');
  const passwordField = () => page.getByLabel('パスワード', { exact: true });
  const loginButton = () => page.getByRole('button', { name: 'ログイン' }).last();
  const rememberBox = () => page.getByRole('checkbox', { name: 'この端末に記憶する' });

  // --- 1. 入口が出る ----------------------------------------------------------
  console.log('--- 起動したとき ---');
  await open();
  const first = await page.locator('body').innerText();
  check('ログインしていなければ入口が出る', first.includes('ようこそ'), first.slice(0, 70));
  check('記憶する印がある', (await rememberBox().count()) === 1);

  // --- 2〜3. 記憶して、押すだけで入る ------------------------------------------
  console.log('\n--- 記憶する ---');
  await emailField().fill(member.email);
  await passwordField().fill(member.password);
  // 既定で入っている。念のため確かめてから進む。
  check('記憶する印が既定で入っている', await rememberBox().isChecked());
  await loginButton().click();
  await page.waitForTimeout(6000);
  check('ログインできる', (await page.locator('body').innerText()).includes('案内できる範囲'));

  /*
    入り終えたら、探す画面へ渡されること（ご報告 2026-09-12）。

    ログアウトはアカウントの画面から行うため、入り直すとアカウントの
    画面がそのまま出ていた。入り直した方の用事は施設を探すこと。
  */
  check('入ると探す画面へ渡される', new URL(page.url()).pathname === '/', page.url());

  // いったん出る
  await open('/account');
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByTestId('confirm-accept').click();
  await page.waitForTimeout(4000);

  /*
    出た場所で入り直しても、探す画面へ渡されること。

    ログアウトはアカウントの画面から行うため、以前はここで入り直すと
    アカウントの画面がそのまま出ていた（ご報告 2026-09-12）。
  */
  check('ログアウト直後はアカウントの画面', page.url().includes('/account'), page.url());
  await loginButton().click();
  await page.waitForTimeout(7000);
  await skipIntro(page);
  check(
    '出た場所で入り直しても探す画面へ',
    new URL(page.url()).pathname === '/',
    page.url(),
  );

  // もう一度出て、記憶の確認へ進む
  await open('/account');
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByTestId('confirm-accept').click();
  await page.waitForTimeout(4000);

  await open();
  check(
    '次に開くとメールアドレスが入っている',
    (await emailField().inputValue()) === member.email,
    await emailField().inputValue(),
  );
  check(
    '次に開くとパスワードも入っている',
    (await passwordField().inputValue()).length > 0,
    '空',
  );

  // 打たずに押すだけ
  await loginButton().click();
  await page.waitForTimeout(6000);
  check(
    '押すだけで入れる',
    (await page.locator('body').innerText()).includes('案内できる範囲'),
  );

  // --- 4. 印を外すと、パスワードは残らない -------------------------------------
  console.log('\n--- 記憶しない ---');
  await open('/account');
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByTestId('confirm-accept').click();
  await page.waitForTimeout(4000);

  await open();
  await rememberBox().click();
  check('印を外せる', !(await rememberBox().isChecked()));
  await passwordField().fill(member.password);
  await loginButton().click();
  await page.waitForTimeout(6000);

  await open('/account');
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByTestId('confirm-accept').click();
  await page.waitForTimeout(4000);
  await open();
  check(
    '印を外すとパスワードは残らない',
    (await passwordField().inputValue()) === '',
    await passwordField().inputValue(),
  );
  check(
    'メールアドレスは残る',
    (await emailField().inputValue()) === member.email,
    'メールは打ち直しの手数が多く、知られて困る度合いが低い',
  );

  // --- 5. 登録の確認欄 ---------------------------------------------------------
  console.log('\n--- 登録の確認欄 ---');
  await page.getByRole('tab', { name: '新規登録' }).click();
  await page.waitForTimeout(600);
  const again = page.getByLabel('パスワード（確認）');
  check('確認の欄がある', (await again.count()) === 1);
  await emailField().fill(`kn-x-${Date.now()}@example.com`);
  await passwordField().fill('kn-test-password-2026');
  await again.fill('kn-test-password-9999');
  await page.getByRole('button', { name: '登録する' }).click();
  await page.waitForTimeout(2500);
  const said = (await page.locator('[role="alert"]').allInnerTexts()).join(' ');
  check('食い違えば断る', said.includes('パスワードが一致しません'), said || '何も出ない');

  // --- 6〜7. 停止 --------------------------------------------------------------
  console.log('\n--- ご利用の停止 ---');
  await setStatus(member.userId, 'blocked');

  await open();
  await emailField().fill(member.email);
  await passwordField().fill(member.password);
  await loginButton().click();
  await page.waitForTimeout(6000);
  const wall = await page.locator('body').innerText();
  check(
    '停止した方は中へ通さない',
    wall.includes('ご利用を停止しています'),
    wall.slice(0, 80).replace(/\n/g, ' / '),
  );
  check('中身は出さない', !wall.includes('案内できる範囲'), wall.slice(0, 60));
  check(
    '止まったままログアウトはできる',
    (await page.getByRole('button', { name: 'ログアウト' }).count()) > 0,
  );

  // 解けば、そのまま使える（入り直しは要らない）
  await setStatus(member.userId, 'trial');
  await open();
  check(
    '停止を解けばそのまま使える',
    (await page.locator('body').innerText()).includes('案内できる範囲'),
  );

  // --- 8. 退会 -----------------------------------------------------------------
  console.log('\n--- 退会 ---');

  /*
    顔写真を1枚置いておく。

    置き場所の表を直に消すことは Supabase が禁じており、データベース側の
    関数からは触れない。アプリ側が先に消す作りになっているかを見る。
    ここを取りこぼすと、持ち主の分からない画像が溜まり続ける。
  */
  await fetch(`${conn.url}/storage/v1/object/avatars/${member.userId}/probe.jpg`, {
    method: 'POST',
    headers: { ...conn.svc, 'Content-Type': 'image/jpeg' },
    body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  const listAvatars = async () => {
    const r = await fetch(`${conn.url}/storage/v1/object/list/avatars`, {
      method: 'POST',
      headers: conn.svc,
      body: JSON.stringify({ prefix: `${member.userId}/`, limit: 50 }),
    });
    const j = await r.json();
    return Array.isArray(j) ? j.length : 0;
  };
  check('顔写真を置けた', (await listAvatars()) > 0);

  await open('/account');
  const leave = page.getByRole('button', { name: '退会する' }).first();
  check('退会の入口がある', (await leave.count()) === 1);
  if ((await leave.count()) === 1) {
    await leave.click();
    await page.waitForTimeout(800);
    await page.getByTestId('confirm-accept').click();
    await page.waitForTimeout(6000);
    check('退会するとアカウントが消える', !(await stillThere(member.email)));
    check('顔写真も一緒に消える', (await listAvatars()) === 0, `${await listAvatars()} 枚残っている`);
  }
} finally {
  console.log('\n--- 後片付け ---');
  check('検査で作った会員が残っていない', await removeMember(conn, member));

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
