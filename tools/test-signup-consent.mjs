/**
 * 登録の画面の「利用規約とプライバシーポリシーに同意する」を確かめる（2026-10-12）。
 *
 *   node tools/test-signup-consent.mjs                                 手元（4291）
 *   node tools/test-signup-consent.mjs https://kurumayose-navi.vercel.app
 *
 * ご回答（2026-10-08）「登録の画面に『利用規約とプライバシーポリシーに同意して
 * 登録』を置く」。
 *
 *   掲載先が無いとき
 *     1. 同意の欄を出さない（読めない規約に同意を求めない）
 *   掲載先があるとき
 *     2. 同意の欄が出る。「利用規約」「プライバシーポリシー」が掲載先へのリンク
 *     3. 印を付けずに登録すると「同意の欄に印を…」と出て、登録されない
 *     4. 印を付けて登録すると、登録される
 *     5. 同意した日時と、そのときの掲載先が、登録情報に残る
 *     6. 画面に誤りが出ない
 *
 * **本番の掲載先には触れない。** まだ掲載先が入っていないため、ブラウザが受け取る
 * サイト設定の中身だけを、この検査の中で差し替えて「入っている」状態を作る。
 *
 * **検査用の会員を作り、最後に消す。**
 */
import { chromium } from 'playwright';

import { connect, removeMember, skipIntro } from './lib/member.mjs';

const APP = (process.argv[2] ?? 'http://localhost:4291').replace(/\/$/, '');
const conn = connect();
const STAMP = Date.now();
const EMAIL = `kn-consent-${STAMP}@example.com`;
const PASSWORD = 'kn-consent-password-2026';
const TERMS = 'https://example.com/kn-terms';
const PRIVACY = 'https://example.com/kn-privacy';

let pass = 0;
const failures = [];
function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}`);
    if (detail) console.error(`        ${detail}`);
  }
}

async function findUser(email) {
  const r = await fetch(`${conn.url}/auth/v1/admin/users?per_page=200`, { headers: conn.svc });
  const j = await r.json();
  return (j.users ?? []).find((u) => u.email === email) ?? null;
}

/**
 * ブラウザが受け取るサイト設定の中身を差し替える（掲載先あり・なし）。
 * 元の答えが誤り（データベースの更新前で、ログイン前は読めない）でも、
 * 掲示のための項目だけを入れて返す。
 */
async function withLinks(ctx, links) {
  await ctx.route(`${conn.url}/rest/v1/site_settings*`, async (route) => {
    let body = null;
    try {
      body = await (await route.fetch()).json();
    } catch {
      body = null;
    }
    const base = body && !body.code ? (Array.isArray(body) ? body[0] : body) : {};
    const patched = {
      id: 1,
      operator_name: null,
      contact_email: null,
      law_url: null,
      ...base,
      terms_url: links ? TERMS : null,
      privacy_url: links ? PRIVACY : null,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(Array.isArray(body) ? [patched] : patched),
    });
  });
}

async function openSignup(page) {
  await page.goto(`${APP}/account`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await skipIntro(page);
  await page.getByRole('tab', { name: /新規登録/ }).first().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByRole('tab', { name: /新規登録/ }).first().click();
  await page.waitForTimeout(800);
}

let browser = null;
let created = null;

try {
  console.log(`登録の同意の検査: ${APP}\n`);
  browser = await chromium.launch({ channel: 'msedge' });

  /* ---- 掲載先が無いとき ---- */
  {
    const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } });
    await withLinks(ctx, false);
    const page = await ctx.newPage();
    await openSignup(page);
    check('掲載先が無いときは、同意の欄を出さない', (await page.getByTestId('signup-consent').count()) === 0);
    await ctx.close();
  }

  /* ---- 掲載先があるとき ---- */
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } });
  await withLinks(ctx, true);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openSignup(page);

  const consent = page.getByTestId('signup-consent');
  check('掲載先があるときは、同意の欄が出る', (await consent.count()) === 1);
  const terms = consent.getByRole('link', { name: '利用規約' });
  const privacy = consent.getByRole('link', { name: 'プライバシーポリシー' });
  check('「利用規約」が掲載先へのリンク', (await terms.getAttribute('href')) === TERMS, String(await terms.getAttribute('href')));
  check('「プライバシーポリシー」が掲載先へのリンク',
    (await privacy.getAttribute('href')) === PRIVACY, String(await privacy.getAttribute('href')));
  check('リンクは新しいタブで開く', (await terms.getAttribute('target')) === '_blank');

  await page.getByLabel('メールアドレス').fill(EMAIL);
  await page.getByLabel('パスワード', { exact: true }).fill(PASSWORD);
  await page.getByLabel('パスワード（確認）').fill(PASSWORD);

  await page.getByRole('button', { name: '登録する' }).click();
  await page.waitForTimeout(2500);
  const alert = (await page.locator('[role="alert"]').allInnerTexts()).join(' / ');
  check('印を付けずに登録すると、同意を求める', alert.includes('同意の欄に印を付けてください'), alert);
  check('印を付けずに登録しても、登録されない', (await findUser(EMAIL)) === null);

  const box = page.getByRole('checkbox', { name: '利用規約とプライバシーポリシーに同意する' });
  await box.click();
  check('印が付く', (await box.getAttribute('aria-checked')) === 'true');
  const before = Date.now();
  await page.getByRole('button', { name: '登録する' }).click();
  await page.waitForTimeout(5000);
  created = await findUser(EMAIL);
  check('印を付けて登録すると、登録される', !!created,
    (await page.locator('[role="alert"]').allInnerTexts()).join(' / '));

  const meta = created?.user_metadata ?? {};
  const at = meta.terms_agreed_at ? new Date(meta.terms_agreed_at).getTime() : NaN;
  check('同意した日時が、登録情報に残る', Number.isFinite(at) && at >= before - 60_000 && at <= Date.now() + 60_000,
    JSON.stringify(meta));
  check('同意したときの掲載先が、登録情報に残る', meta.terms_url === TERMS && meta.privacy_url === PRIVACY,
    JSON.stringify(meta));
  check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
  await ctx.close();
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  const user = created ?? (await findUser(EMAIL).catch(() => null));
  const gone = user ? await removeMember(conn, { userId: user.id, email: EMAIL }) : true;
  console.log(`\n検査用の会員を消した: ${gone ? 'はい' : 'いいえ（要確認）'}`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
