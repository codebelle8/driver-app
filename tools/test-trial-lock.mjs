/**
 * 無料期間の知らせ（2日前・1日前）と、終わったあとの締めを見る。
 *
 *   node tools/test-trial-lock.mjs                        手元の書き出し
 *   node tools/test-trial-lock.mjs http://localhost:4180
 *
 * **なぜ日付を動かして見るか**
 *   「2日前に出る」は、2日前にならないと確かめられない。待てないので、
 *   名簿の期限のほうを動かす。利用者から見えるものは同じ。
 *
 * **1日前が「また出る」ことを確かめる**
 *   2日前と1日前を同じ知らせにすると、一度読んだきり二度と出ない。
 *   別の知らせとして、未読で出ることを見る。
 *
 * **締めたあとも設定へは入れることを確かめる**
 *   ログインまで断つと、お支払いの手続きにもたどり着けない。
 *   入れること・設定だけであること・払えば戻ることの3つを見る。
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:4180').replace(/\/$/, '');
const conn = connect();
const DAY = 86_400_000;

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

/** 名簿の期限と状態を差し替える。管理画面から入金済みにするのと同じ結果。 */
const setTrial = async (userId, { days, status = 'trial' }) => {
  const r = await fetch(`${conn.url}/rest/v1/driver_profiles?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: conn.svc,
    body: JSON.stringify({
      trial_ends_at: new Date(Date.now() + days * DAY).toISOString(),
      status,
    }),
  });
  if (!r.ok) throw new Error(`名簿を直せません: ${r.status} ${await r.text()}`);
};

let browser = null;
let member = null;

try {
  console.log(`無料期間の知らせと締めの検査: ${BASE}\n`);
  member = await createMember(conn, 'trial');
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  const page = await ctx.newPage();

  await signInOn(page, BASE, member, { goto: '/mypage' });
  await page.waitForTimeout(2500);

  const body = async () => page.locator('body').innerText();
  const reload = async (path = '/notices') => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(6000);
    /* 開き直すたびに導入が流れる。かぶせたままだと下の帯が読めない。 */
    await skipIntro(page);
  };

  /*
    行先の並びを、役割で読む。

    画面の文言で見ると、導入の映像や案内文にある「探す」まで拾う。
    実際に押せる行先がいくつあるかを数える。
  */
  const tabs = async () => {
    /*
      文字は「含むか」で見る。等号では通らない。

      記号（Ionicons）は字を1つ描く扱いで、読み取った文字列の頭に
      混じる。以前ここで、押せる釦を取り違えたことがある。
    */
    const names = await page.getByRole('tab').allInnerTexts();
    return names.map((n) => n.replace(/\s+/g, ''));
  };

  // --- まだ先のとき（3日前）------------------------------------------------
  console.log('--- 期限まで3日 ---');
  await setTrial(member.userId, { days: 2.5 });
  await reload();
  let text = await body();
  check('まだ知らせは出ない', !text.includes('無料期間が、あと'), text.slice(0, 90).replace(/\n/g, ' / '));

  // --- 2日前 ----------------------------------------------------------------
  console.log('\n--- 期限まで2日 ---');
  await setTrial(member.userId, { days: 1.5 });
  await reload();
  text = await body();
  check('2日前の知らせが出る', text.includes('あと 2 日で終わります'), text.slice(0, 120).replace(/\n/g, ' / '));
  check('お支払いのことだと分かる', text.includes('お支払いのご案内'));
  check('設定より先へ進めなくなると書いてある', text.includes('設定より先へ進めなくなります'));

  // 読んだことにする（押すと既読になる）
  await page.getByText('あと 2 日で終わります').first().click();
  await page.waitForTimeout(3000);
  check('押すとお支払いの画面へ行く', page.url().includes('/plan'), page.url());

  // --- 1日前（別の知らせとして、また出る）-----------------------------------
  console.log('\n--- 期限まで1日 ---');
  await setTrial(member.userId, { days: 0.5 });
  await reload();
  text = await body();
  check('1日前の知らせが出る', text.includes('あと 1 日で終わります'), text.slice(0, 120).replace(/\n/g, ' / '));
  check('2日前のものは出ていない', !text.includes('あと 2 日で終わります'));

  // 鐘の脇の数
  const badge = await page
    .locator('text=/^[1-9][0-9]*$/')
    .first()
    .innerText()
    .catch(() => '');
  check('未読として数えられている', badge !== '', `鐘の脇: ${badge}`);

  // --- お支払い済みの方には出さない -----------------------------------------
  console.log('\n--- お支払い済みのとき ---');
  await setTrial(member.userId, { days: 0.5, status: 'active' });
  await reload();
  text = await body();
  check('払った方には出さない', !text.includes('無料期間が、あと'), text.slice(0, 90).replace(/\n/g, ' / '));

  // --- 期限が切れたとき ------------------------------------------------------
  console.log('\n--- 期限が切れたとき ---');
  await setTrial(member.userId, { days: -1 });
  await reload('/');
  text = await body();

  check('中へは入れる（入口へ戻されない）', !text.includes('ようこそ'), text.slice(0, 80).replace(/\n/g, ' / '));
  check('設定へ移されている', page.url().includes('/mypage'), page.url());
  check('終わったことが書いてある', text.includes('無料期間が終了しました'));
  check('手続きの入口がある', text.includes('お支払いの手続きへ'));
  check('振込済みの方の逃げ道がある', text.includes('お振込みが済んだ方はこちら'));

  const shown = await tabs();
  check('行先は1つだけ', shown.length === 1, shown.join(' / '));
  check('残るのは設定だけ', shown.some((n) => n.includes('マイページ')), shown.join(' / '));
  for (const gone of ['探す', 'お気に入り', '履歴']) {
    check(`「${gone}」は出さない`, !shown.some((n) => n.includes(gone)), shown.join(' / '));
  }

  // 施設の詳細へ直に入ろうとしても通さない
  const fac = await (
    await fetch(`${conn.url}/rest/v1/facilities?select=id&limit=1`, { headers: conn.svc })
  ).json();
  await reload(`/facility/${fac[0].id}`);
  check('施設の画面へ直に入れない', page.url().includes('/mypage'), page.url());

  // お支払いの画面へは入れる
  await reload('/plan');
  check('お支払いの画面へは入れる', page.url().includes('/plan'), page.url());

  // --- 払ったら戻る ----------------------------------------------------------
  console.log('\n--- お支払いのあと ---');
  await setTrial(member.userId, { days: -1, status: 'active' });
  await reload('/');
  text = await body();
  check('探す画面へ戻れる', !page.url().includes('/mypage'), page.url());
  const back = await tabs();
  check('行先が4つとも戻る', back.length === 4, back.join(' / '));
  for (const name of ['探す', 'お気に入り', '履歴', 'マイページ']) {
    check(`「${name}」が戻る`, back.some((n) => n.includes(name)), back.join(' / '));
  }
  check('締めの説明は消える', !text.includes('無料期間が終了しました'));
} finally {
  console.log('\n--- 後片付け ---');
  check('検査で作った会員を消した', await removeMember(conn, member));

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
