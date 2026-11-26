/**
 * 申込みの最後の画面（/checkout）と、そこへ進むお支払いの画面を、ブラウザで確かめる。
 *
 *   node tools/serve-web.mjs app/dist/web 4190   （別の窓で）
 *   node tools/test-checkout-screen.mjs                    手元の書き出し
 *   node tools/test-checkout-screen.mjs https://app.kurumayosenavi.com
 *
 * 日付の計算そのものは tools/test-checkout.mjs で見る。ここで見るのは、画面に
 * 法律が求める項目が並ぶか、押せてはいけない釦が押せないか。
 *
 * **何を見るか**
 *   1. 試験提供の期間中：見本と分かる。釦は押せない。項目（内容・お支払い・開始・
 *      解約と返金）と、金額・自動更新・返金の決まりが出る
 *   2. 料金と支払方法の組み合わせで、出し分けが変わる（12か月・銀行振込）
 *   3. 取り扱っていない料金・支払方法を渡されたら、選び直しを案内する
 *   4. お支払いの画面は、試験提供の期間中はこれまでどおり（ご希望を控える形）
 *   5. 有料での提供を始めたあと（サイト設定の答えを差し替えて再現する）：
 *      支払方法を選んで「確認へ進む」で最後の画面へ。見本の札は出ず、
 *      つないでいない支払方法は「準備中」で押せない
 *
 * **本番のサイト設定は触らない。** 5 は、ブラウザに届く答えだけを差し替える
 * （page.route）。検査用の会員は終わったら消す。
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const raw = process.argv[2] ?? 'http://localhost:4190';
const BASE = raw.endsWith('/') ? raw.slice(0, -1) : raw;
const SHOTS = process.env.SHOTS_DIR ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const conn = connect();

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

const textOf = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));

async function open(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await skipIntro(page);
  await page.waitForTimeout(500);
}

/*
  画面の中だけが流れる作り（ScrollView）のため、ページ全体を撮っても下は写らない。
  上を撮ったあと、流れる箱をいちばん下まで送って、もう一枚撮る。
*/
async function shot(page, name) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  const moved = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('div')].filter(
      (el) => el.scrollHeight > el.clientHeight + 40 && getComputedStyle(el).overflowY !== 'visible',
    );
    const box = boxes.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (!box) return false;
    box.scrollTop = box.scrollHeight;
    return true;
  });
  if (moved) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/${name}-bottom.png` });
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach((el) => {
        if (el.scrollTop) el.scrollTop = 0;
      });
    });
  }
}

/** 釦が押せない状態か（aria-disabled） */
const disabled = (page, name) =>
  page
    .getByRole('button', { name })
    .first()
    .evaluate((el) => el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled'));

let browser = null;
let member = null;

try {
  console.log(`申込みの最後の画面の検査: ${BASE}\n`);
  member = await createMember(conn, 'checkout');
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  await signInOn(page, BASE, member, { goto: '/' });

  // ---------------------------------------------------------------------------
  console.log('1. 試験提供の期間中（1か月・カード）');
  await open(page, '/checkout?plan=monthly&method=card');
  let text = await textOf(page);
  await shot(page, 'checkout-sample-monthly-card');
  check('見出しは「お申し込みの確認」', text.includes('お申し込みの確認'));
  check('見本と分かる', text.includes('この画面は、有料での提供を始めたあとの見本です'));
  for (const h of ['お申し込みの内容', 'お支払い', 'ご利用の開始', '解約・返金']) {
    check(`項目「${h}」がある`, text.includes(h));
  }
  check('料金プラン：1か月', text.includes('1か月'));
  check('支払方法：カード（Apple Pay・Google Pay も）', text.includes('クレジットカード・デビットカード') && text.includes('Apple Pay'));
  check('金額：600円（1か月ごと）', text.includes('600円（1か月ごと）'), text.slice(0, 400));
  check('自動更新：あり', /自動更新\s*あり/.test(text));
  check('最初のお支払いは無料期間が終わる日（検査の会員は無料期間中）', text.includes('無料期間が終わる') && text.includes('最初のお支払い（600円）'));
  check('以後の更新日が出る', /以後、毎月\d+日/.test(text));
  check('自動更新の止め方が出る', text.includes('自動更新は、お支払いの画面からいつでも止められます'));
  check('1か月は返金しない', text.includes('1か月の料金は、返金いたしません'));
  check('次の画面（Stripe）で完了すること、カード番号が届かないこと', text.includes('Stripe') && text.includes('カード番号は、当方には届きません'));
  check('釦は押せない', await disabled(page, 'この内容で、カードの登録へ進む'));
  check('年まで書いた日付', /\d{4}年\d+月\d+日/.test(text));

  // ---------------------------------------------------------------------------
  console.log('2. 12か月・銀行振込');
  await open(page, '/checkout?plan=yearly&method=transfer');
  text = await textOf(page);
  await shot(page, 'checkout-sample-yearly-transfer');
  check('金額：5,000円', text.includes('5,000円'));
  check('自動更新：なし（あらためて申し込む）', text.includes('なし。期間が終わったあとも続けるときは'));
  check('振込手数料はご負担', text.includes('振込手数料'));
  check('12か月の返金の決まり', text.includes('2か月を引いた月数×500円'));
  check('お振込みの確認の日から数えることが分かる', text.includes('お振込みの確認が'));
  check('釦は押せない', await disabled(page, 'この内容で申し込む'));

  console.log('   12か月・PayPay');
  await open(page, '/checkout?plan=yearly&method=paypay');
  text = await textOf(page);
  check('PayPay：すぐにお支払い', text.includes('この後の画面で、すぐにお支払いいただきます'));
  check('PayPay：期間の終わりまで出る', /から\d{4}年\d+月\d+日まで（12か月）/.test(text), text.slice(0, 500));

  // ---------------------------------------------------------------------------
  console.log('3. 取り扱っていないもの');
  await open(page, '/checkout?plan=half&method=card');
  text = await textOf(page);
  check('取り扱いを終えた刻み（6か月）：選び直しを案内', text.includes('この料金プランはお選びいただけません'));
  await open(page, '/checkout?plan=monthly&method=cash');
  text = await textOf(page);
  check('知らない支払方法：選び直しを案内', text.includes('この料金プランはお選びいただけません'));

  // ---------------------------------------------------------------------------
  console.log('4. お支払いの画面（試験提供の期間中）');
  await open(page, '/plan');
  text = await textOf(page);
  await shot(page, 'plan-trial');
  check('これまでどおり「ご希望」を控える形', text.includes('ご希望の料金をお選びください') && text.includes('この内容で申し込む'));
  check('支払方法の選択は出ない', !text.includes('料金プランとお支払い方法をお選びください'));

  // ---------------------------------------------------------------------------
  console.log('5. 有料での提供を始めたあと（サイト設定の答えだけ差し替える）');
  await ctx.route('**/rest/v1/site_settings?select=trial_open*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trial_open: false }) }),
  );
  await open(page, '/plan');
  text = await textOf(page);
  check('料金と支払方法を選ぶ形に変わる', text.includes('料金プランとお支払い方法をお選びください'));
  check('期間が終わると一部が使えなくなることを書く', text.includes('一部の機能がお使いいただけなくなります'));
  const next = page.getByRole('button', { name: '確認へ進む' });
  check('選ぶまでは「確認へ進む」は押せない', await disabled(page, '確認へ進む'));
  await page.locator('[role="radio"]', { hasText: '12か月（一括払い）' }).first().click();
  await page.locator('[role="radio"]', { hasText: 'クレジットカード・デビットカード' }).first().click();
  await page.waitForTimeout(400);
  await shot(page, 'plan-paid');
  await next.click();
  await page.waitForTimeout(3500);
  check('最後の画面へ進む（選んだ料金と支払方法を渡す）', /\/checkout\?.*plan=yearly.*method=card|\/checkout\?.*method=card.*plan=yearly/.test(page.url()), page.url());
  text = await textOf(page);
  await shot(page, 'checkout-paid-yearly-card');
  check('見本の札は出ない', !text.includes('見本です'));
  check('金額：5,000円（12か月ごと）', text.includes('5,000円（12か月ごと）'));
  check('以後、毎年の更新日', /以後、毎年\d+月\d+日/.test(text));
  check('つないでいない支払方法は「準備中」', text.includes('この支払方法は、ただいま準備中です'));
  check('釦は押せない', await disabled(page, 'この内容で、カードの登録へ進む'));
  await ctx.unroute('**/rest/v1/site_settings?select=trial_open*');

  /* 控えは何も変わっていない（最後の画面へ進んだだけでは何も書かない） */
  const row = await fetch(`${conn.url}/rest/v1/driver_profiles?select=plan&user_id=eq.${member.userId}`, {
    headers: conn.svc,
  }).then((r) => r.json());
  check('進んだだけでは、料金の控えは書かれない', Array.isArray(row) && row[0]?.plan === null, JSON.stringify(row));
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close();
  const gone = await removeMember(conn, member);
  check('検査用の会員を消した', gone);
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} 件が不合格（合格 ${pass} 件）`);
  process.exit(1);
}
console.log(`全 ${pass} 件に合格しました。`);
