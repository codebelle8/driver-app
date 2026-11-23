/**
 * 規約類を載せたあとのアプリを、本番のサイト設定のまま確かめる（2026-11-23）。
 *
 *   node tools/test-legal-live.mjs                                   本番（app.kurumayosenavi.com）
 *   node tools/test-legal-live.mjs http://localhost:4190             手元の書き出し（本番のデータベースを読む）
 *
 * **サイト設定には触れない（読むだけ）。** test-about.mjs は設定を書き換えて最後に空へ
 * 戻す作りのため、掲載先を入れた本番では回さないこと（入れた掲載先が消える）。
 * test-signup-consent.mjs は登録まで進むため、確認のメールが出るおそれがある。
 *
 * **登録は最後まで進めない。** 登録の通信（/auth/v1/signup）は届く前に止め、
 * 止めた数を数える。会員は作られず、メールも出ない。
 *
 * 見るもの
 *   登録の画面 … 同意の欄が出る。「利用規約」「プライバシーポリシー」が紹介サイトの
 *               ページへのリンクで、新しいタブで開く。印を付けずに押すと同意を求め、
 *               登録の通信を出さない。印を付けて押すと、同意した日時と規約の住所が
 *               登録の通信に載る（その通信は届く前に止める）
 *   マイページ … 「このアプリについて」に3つの規約とお問い合わせ。宛先が正しい
 *               （検査用の会員を作って入り、最後に消す。作るときもメールは出ない）
 *   ページ     … アプリが指す3つの住所が開き、題が合っている
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const APP = (process.argv[2] ?? 'https://app.kurumayosenavi.com').replace(/\/$/, '');
const SITE = 'https://kurumayosenavi.com';
const EXPECT = {
  terms: `${SITE}/terms`,
  privacy: `${SITE}/privacy`,
  law: `${SITE}/law`,
  email: 'kurumayose@levelsurface.net',
};

const conn = connect();
let pass = 0;
const failures = [];
function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}`);
    if (detail) console.log(`        ${String(detail).slice(0, 300)}`);
  }
}

let browser = null;
let member = null;
try {
  console.log(`規約類を載せたあとのアプリの検査: ${APP}\n`);
  browser = await chromium.launch({ channel: 'msedge' });

  /* ------------------------------------------------------------------------ */
  console.log('--- 登録の画面 ---');
  {
    const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } });
    let signupCalls = 0;
    let signupBody = null;
    await ctx.route('**/auth/v1/signup**', (route) => {
      signupCalls++;
      try {
        signupBody = route.request().postDataJSON();
      } catch {
        signupBody = null;
      }
      return route.abort();
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${APP}/account`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await skipIntro(page);
    const tab = page.getByRole('tab', { name: /新規登録/ }).first();
    await tab.waitFor({ state: 'visible', timeout: 20_000 });
    await tab.click();
    await page.waitForTimeout(1500);

    const consent = page.getByTestId('signup-consent');
    check('同意の欄が出る', (await consent.count()) === 1);
    const terms = consent.getByRole('link', { name: '利用規約' });
    const privacy = consent.getByRole('link', { name: 'プライバシーポリシー' });
    check('「利用規約」が紹介サイトの利用規約へ', (await terms.getAttribute('href')) === EXPECT.terms, await terms.getAttribute('href'));
    check(
      '「プライバシーポリシー」が紹介サイトのプライバシーポリシーへ',
      (await privacy.getAttribute('href')) === EXPECT.privacy,
      await privacy.getAttribute('href'),
    );
    check('リンクは新しいタブで開く', (await terms.getAttribute('target')) === '_blank');

    await page.getByLabel('メールアドレス').fill(`kn-legal-live-${Date.now()}@example.com`);
    await page.getByLabel('パスワード', { exact: true }).fill('kn-legal-live-2026');
    await page.getByLabel('パスワード（確認）').fill('kn-legal-live-2026');
    await page.getByRole('button', { name: '登録する' }).click();
    await page.waitForTimeout(2500);
    const alert = (await page.locator('[role="alert"]').allInnerTexts()).join(' / ');
    check('印を付けずに押すと、同意を求める', alert.includes('同意の欄に印を付けてください'), alert);
    check('印を付けずに押しても、登録の通信を出さない', signupCalls === 0, `${signupCalls} 回`);

    /* 印を付けて押す。通信は届く前に止める（会員は作られず、メールも出ない） */
    const box = page.getByRole('checkbox', { name: '利用規約とプライバシーポリシーに同意する' });
    await box.click();
    const before = Date.now();
    await page.getByRole('button', { name: '登録する' }).click();
    await page.waitForTimeout(2500);
    const meta = signupBody?.data ?? {};
    const at = meta.terms_agreed_at ? new Date(meta.terms_agreed_at).getTime() : NaN;
    check('印を付けて押すと、登録の通信が出る（届く前に止めた）', signupCalls === 1, `${signupCalls} 回`);
    check('同意した日時が、登録の通信に載る', Number.isFinite(at) && Math.abs(at - before) < 60_000, JSON.stringify(meta));
    check(
      '同意したときの規約の住所（紹介サイト）が、登録の通信に載る',
      meta.terms_url === EXPECT.terms && meta.privacy_url === EXPECT.privacy,
      JSON.stringify(meta),
    );
    check('画面に誤りが出ない（登録の画面）', errors.length === 0, errors.join(' / '));
    await ctx.close();
  }

  /* ------------------------------------------------------------------------ */
  console.log('\n--- マイページ「このアプリについて」 ---');
  {
    member = await createMember(conn, 'legallive');
    const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await signInOn(page, APP, member, { goto: '/mypage' });
    await page.goto(`${APP}/mypage`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    await skipIntro(page);

    const href = async (name) => page.getByRole('link', { name, exact: false }).first().getAttribute('href').catch(() => null);
    check('利用規約 → 紹介サイトの利用規約', (await href('利用規約')) === EXPECT.terms, await href('利用規約'));
    check('プライバシーポリシー → 紹介サイトのプライバシーポリシー', (await href('プライバシーポリシー')) === EXPECT.privacy, await href('プライバシーポリシー'));
    check('特定商取引法に基づく表記 → 紹介サイトの表記', (await href('特定商取引法に基づく表記')) === EXPECT.law, await href('特定商取引法に基づく表記'));
    check('お問い合わせ → メールが開く', (await href('お問い合わせ')) === `mailto:${EXPECT.email}`, await href('お問い合わせ'));
    check('お問い合わせの宛先が読める', (await page.locator('body').innerText()).includes(EXPECT.email));
    check('画面に誤りが出ない（マイページ）', errors.length === 0, errors.join(' / '));
    await ctx.close();
  }

  /* ------------------------------------------------------------------------ */
  console.log('\n--- アプリが指すページ ---');
  for (const [url, heading] of [
    [EXPECT.terms, '利用規約'],
    [EXPECT.privacy, 'プライバシーポリシー'],
    [EXPECT.law, '特定商取引法に基づく表記'],
  ]) {
    const res = await fetch(url);
    const html = await res.text();
    check(`${url} が開き、題が「${heading}」`, res.status === 200 && html.includes(`<h1>${heading}</h1>`), String(res.status));
  }
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (member) console.log(`\n検査用の会員を消した: ${(await removeMember(conn, member)) ? 'はい' : 'いいえ（要確認）'}`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
