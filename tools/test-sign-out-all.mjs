/**
 * 「ほかの端末からもログアウト」が、本当に効いているかを見る。
 *
 *   node tools/test-sign-out-all.mjs                        手元の書き出し
 *   node tools/test-sign-out-all.mjs http://localhost:4190
 *
 * **なぜ要るか**
 *   この釦は、端末を失くしたときのためのもの。押したのに前の端末が
 *   使えたままなら、**無いより悪い**（安心して捜すのをやめる）。
 *   それでいて、一度も確かめていなかった。
 *
 * **1台までの決まりとは別の話**
 *   1台までの決まりは、アプリが名簿の符号を見て自分から出ていく
 *   仕組み。**サーバー側の鍵はそのまま生きている。** 端末が手元に
 *   無い以上、アプリの善意には頼れない。ここで見るのは、
 *   サーバー側の鍵が本当に使えなくなるか。
 *
 * **鍵は画面からは取れない**
 *   ブラウザの中にしかない。同じ利用者で API から2つ鍵を取り、
 *   それが使えなくなるかを見る。人が2台持っているのと同じこと。
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:4190').replace(/\/$/, '');
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

/** 利用者として入り、鍵の組を受け取る（1台ぶん）。 */
const getSession = async (email, password) => {
  const r = await fetch(`${conn.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  return j.refresh_token ?? null;
};

/** その鍵がまだ使えるか。使えれば新しい鍵が返る。 */
const stillUsable = async (refreshToken) => {
  const r = await fetch(`${conn.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return r.ok;
};

let browser = null;
let member = null;

try {
  console.log(`ほかの端末からのログアウトの検査: ${BASE}\n`);
  member = await createMember(conn, 'soall');

  // --- 2台ぶんの鍵を用意する ---------------------------------------------------
  console.log('--- 2台ぶんの鍵 ---');
  const a = await getSession(member.email, member.password);
  const b = await getSession(member.email, member.password);
  check('1台目の鍵を取れた', !!a);
  check('2台目の鍵を取れた', !!b && b !== a, String(b === a));
  check('1台目の鍵はまだ使える', await stillUsable(a));
  check('2台目の鍵はまだ使える', await stillUsable(b));

  // --- 3台目（画面）から「ほかの端末からもログアウト」 -------------------------
  console.log('\n--- 画面から押す ---');
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  const page = await ctx.newPage();
  await signInOn(page, BASE, member, { goto: '/account' });
  await page.waitForTimeout(3000);
  await skipIntro(page);

  let text = await page.locator('body').innerText();
  check('入れている', text.includes('パスワードの変更') || text.includes('顔写真'), text.slice(0, 100));

  const button = page.getByRole('button', { name: 'ほかの端末からもログアウト' });
  check('入口がある', (await button.count()) > 0);
  check('何が起きるか書いてある', text.includes('この端末を含め、すべてのログインを切ります'));

  await button.first().click();
  await page.waitForTimeout(900);
  await page.getByTestId('confirm-accept').click();
  await page.waitForTimeout(7000);

  text = await page.locator('body').innerText();
  check(
    'この端末も出る',
    text.includes('ようこそ') || text.includes('ご登録のメールアドレスでログイン'),
    text.slice(0, 120),
  );

  // --- ほかの端末の鍵が死んだか -------------------------------------------------
  console.log('\n--- ほかの端末の鍵 ---');
  check('1台目の鍵が使えなくなった', !(await stillUsable(a)));
  check('2台目の鍵が使えなくなった', !(await stillUsable(b)));

  // --- 圏外でも戻れないこと -----------------------------------------------------
  console.log('\n--- 圏外で開き直しても ---');
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(6000);
  text = await page.locator('body').innerText().catch(() => '');
  check(
    '圏外でも中へ戻れない（控えも捨てている）',
    !text.includes('カテゴリから探す') && !text.includes('行きたい場所を見つけよう'),
    text.slice(0, 120),
  );
  await ctx.setOffline(false);

  // --- 入り直せること -----------------------------------------------------------
  console.log('\n--- 入り直す ---');
  check('同じパスワードで入り直せる', !!(await getSession(member.email, member.password)));
} finally {
  console.log('\n--- 後片付け ---');
  check('検査で作った会員を消した', await removeMember(conn, member));

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
