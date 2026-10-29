/**
 * パスワードを忘れた方が、戻れるかを見る。
 *
 *   node tools/test-password-reset.mjs                        手元の書き出し
 *   node tools/test-password-reset.mjs http://localhost:4190
 *
 * **なぜ要るか**
 *   無料期間が切れたあと、設定より先へ進めない作りにした。パスワードを
 *   忘れた方がここで詰まると、**入れないまま、お支払いもできない。**
 *   それでいて、この道筋の検査が一つも無かった。
 *
 *   実際、**6回中5回、新しいパスワードを決めずにそのまま中へ通して
 *   いた**（URL の後片付けが、再設定の印を読む前に走っていた）。
 *   忘れた方が入れたつもりで帰り、次にまた入れない。
 *
 * **メールは送らない**
 *   実在の方へ検査のメールを送るわけにいかない。
 *     * 送った後の案内 … 送信の呼び出しだけ横取りして 200 を返す
 *     * 届いた後のこと … 管理の口から同じリンクを発行する
 *   **利用者が受け取るのと同じリンク**なので、届いた後は全部確かめられる。
 *
 * **確かめられないのは1つだけ**
 *   「メールが実際に届くか」。送信元をどうするか次第で、こちらでは
 *   決められない。それ以外は全部見る。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { connect, createMember, removeMember, skipIntro } from './lib/member.mjs';

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

let browser = null;
let member = null;

try {
  console.log(`パスワード再設定の検査: ${BASE}\n`);
  member = await createMember(conn, 'reset');
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  const page = await ctx.newPage();

  const open = async (path = '/') => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(6000);
    await skipIntro(page);
  };

  // --- 入口から「お忘れの方」へ -------------------------------------------------
  console.log('--- 入口から ---');
  await open();
  const forgot = page.getByRole('button', { name: 'パスワードをお忘れの方' });
  check('入口に「お忘れの方」がある', (await forgot.count()) > 0);

  await forgot.first().click();
  await page.waitForTimeout(1200);
  let text = await page.locator('body').innerText();
  check('再設定の画面が出る', text.includes('パスワードの再設定'), text.slice(0, 100));
  check('何をするか書いてある', text.includes('再設定のご案内をお送りします'));
  check('この端末に記憶する印は出さない', !text.includes('この端末に記憶する'), text.slice(0, 120));

  /*
    送信の呼び出しだけ横取りする。

    検査に使える宛先（example.com など）は、実在の利用者に対しては
    Supabase 側が受け付けない。押した後の案内が出るかどうかは、
    それとは別の話なので、答えだけ差し替えて見る。
  */
  await page.route('**/auth/v1/recover*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );

  check(
    '再設定のあいだは「ようこそ」を下げる',
    !text.includes('ご登録のメールアドレスでログインしてください'),
    text.slice(0, 120),
  );

  const send = async (email) => {
    await page.getByLabel(/メールアドレス|Email/).fill(email);
    await page.getByRole('button', { name: '再設定のメールを送る' }).last().click();
    await page.waitForTimeout(2500);
    return page.locator('body').innerText();
  };

  // --- 送った後の画面（2026-10-29）----------------------------------------------
  console.log('\n--- 送った後の画面 ---');
  text = await send(member.email);
  check('送った後の画面に替わる', text.includes('メールをお送りしました'), text.slice(0, 160));
  check('送り先をそのまま出す（打ち間違いに気づける）', text.includes(member.email));
  check(
    'このあとの手順が3つ並ぶ',
    ['メールを開く', 'メールのボタンを押す', '「パスワードを再設定する」と書かれた緑のボタン', '新しいパスワードを決める'].every((x) =>
      text.includes(x),
    ),
  );
  // 届くメール（supabase/templates/reset-password.html と Supabase の設定）と同じ名前か
  const mail = readFileSync(new URL('../supabase/templates/reset-password.html', import.meta.url), 'utf8');
  check(
    'メールのボタンの名前が、手順2の案内と同じ',
    mail.includes('>パスワードを再設定する</a>') && mail.includes('{{ .ConfirmationURL }}'),
  );
  check(
    '件名と差出人を書いてある（届くメールと同じ名前）',
    text.includes('【車寄せナビ】パスワードの再設定') && text.includes('差出人「車寄せナビ」'),
  );

  const resend = page.getByRole('button', { name: /もう一度送る/ });
  check(
    '送り直しは60秒あける（押せない・残りを出す）',
    /もう一度送る（\d+秒後）/.test(text) && (await resend.isDisabled()),
    text.slice(-160),
  );
  check(
    'よく使われるメールでない宛先には、受信箱のボタンを出さない',
    !/(Gmail|Outlook|Yahoo!メール|iCloud メール)を開く/.test(text),
  );

  await page.getByRole('button', { name: 'メールが届かないときは' }).click();
  await page.waitForTimeout(300);
  text = await page.locator('body').innerText();
  check('届かないときの案内を開ける', text.includes('迷惑メールに入っていませんか'));

  await page.getByRole('button', { name: 'メールアドレスを変える' }).click();
  await page.waitForTimeout(600);
  check(
    '「変更」で入力へ戻り、打ったアドレスは残る',
    (await page.getByLabel(/メールアドレス|Email/).inputValue()) === member.email,
  );

  text = await send('kn-reset-check@gmail.com');
  check('Gmail の宛先には「Gmailを開く」を出す', text.includes('Gmailを開く'), text.slice(0, 200));

  await page.getByRole('button', { name: 'メールアドレスを変える' }).click();
  await page.waitForTimeout(600);
  text = await send('kn-reset-check@docomo.ne.jp');
  await page.getByRole('button', { name: 'メールが届かないときは' }).click();
  await page.waitForTimeout(300);
  text = await page.locator('body').innerText();
  check(
    '携帯会社の宛先には、受け取れるようにするドメインまで案内する',
    text.includes('携帯会社のメール') && text.includes('kurumayosenavi.com'),
  );

  await page.getByRole('button', { name: 'ログインへ戻る' }).click();
  await page.waitForTimeout(800);
  text = await page.locator('body').innerText();
  check(
    '「ログインへ戻る」でログインの画面へ（「ようこそ」も戻る）',
    text.includes('ご登録のメールアドレスでログインしてください'),
    text.slice(0, 120),
  );
  await page.unroute('**/auth/v1/recover*');

  // --- 届いたリンクを開く -------------------------------------------------------
  console.log('\n--- 届いたリンクを開く ---');
  const gen = await fetch(`${conn.url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: conn.svc,
    body: JSON.stringify({ type: 'recovery', email: member.email }),
  });
  const link = await gen.json();
  check('再設定のリンクを発行できる', !!link.action_link, JSON.stringify(link).slice(0, 160));

  await page.goto(link.action_link, { waitUntil: 'networkidle' });
  await page.waitForTimeout(9000);
  await skipIntro(page);
  text = await page.locator('body').innerText();

  check('新しいパスワードを決める画面が出る', text.includes('新しいパスワードを決める'), text.slice(0, 140));
  check(
    '決める前に中へ通さない',
    !text.includes('行きたい場所を見つけよう') && !text.includes('カテゴリから探す'),
    text.slice(0, 120),
  );
  check('確認の欄がある（打ち間違いを防ぐ）', text.includes('パスワード（確認）'));

  /*
    決めずに開き直しても、通してはいけない（ご報告 2026-09-11）。

    リンクを開いた時点で、Supabase はもうログイン済みの状態にする。
    URL の印は一度きりで後片付けで消えるため、以前はここで**古い
    パスワードのまま中へ入れて**いた。リンクが転送された場合や
    共用のパソコンを考えると、決めるまで通してはいけない。
  */
  console.log(`
--- 決めずに開き直したとき ---`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await skipIntro(page);
  text = await page.locator('body').innerText();
  check('開き直しても決める画面のまま', text.includes('新しいパスワードを決める'), text.slice(0, 140));
  check(
    '開き直しても中へ通さない',
    !text.includes('行きたい場所を見つけよう') && !text.includes('カテゴリから探す'),
    text.slice(0, 120),
  );
  check('やめる道がある', text.includes('やめて、ログイン画面へ戻る'), text.slice(0, 160));

  // --- 新しいパスワードを決める -------------------------------------------------
  const NEW = 'kn-reset-new-2026';
  await page.getByLabel('新しいパスワード', { exact: true }).fill(NEW);
  await page.getByLabel('パスワード（確認）').fill(NEW);
  await page.getByRole('button', { name: 'パスワードを変える' }).last().click();
  await page.waitForTimeout(8000);
  text = await page.locator('body').innerText();
  /*
    決めた後は中へ入れる。着く先は画面の流れで変わる（探す画面・
    アカウントの画面）ので、**どこに着いたか**ではなく
    **決める画面から出られたか**を見る。
  */
  check('決める画面から出られる', !text.includes('新しいパスワードを決める'), text.slice(0, 140));
  check(
    '中へ入れている（入口ではない）',
    !text.includes('ご登録のメールアドレスでログインしてください'),
    text.slice(0, 140),
  );

  // --- 新しいパスワードで入り直せるか -------------------------------------------
  console.log('\n--- 新しいパスワードで ---');
  const signIn = async (password) => {
    const r = await fetch(`${conn.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: member.email, password }),
    });
    return r.ok;
  };

  check('新しいパスワードで入れる', await signIn(NEW));
  check('古いパスワードでは入れない', !(await signIn(member.password)));

  // --- 登録の無いアドレスのとき -------------------------------------------------
  console.log('\n--- 登録の無いアドレスのとき ---');
  const unknown = await fetch(`${conn.url}/auth/v1/recover`, {
    method: 'POST',
    headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `kn-nobody-${Date.now()}@example.com` }),
  });
  check(
    '登録が無くても同じ答えを返す（在籍を漏らさない）',
    unknown.status === 200,
    String(unknown.status),
  );
} finally {
  console.log('\n--- 後片付け ---');
  check('検査で作った会員を消した', await removeMember(conn, member));

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
