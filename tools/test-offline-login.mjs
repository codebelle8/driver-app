/**
 * 圏外で開いたときのログインを見る。
 *
 *   node tools/test-offline-login.mjs                          手元の書き出し (4173)
 *   node tools/test-offline-login.mjs https://kurumayose-navi.vercel.app
 *
 * ご指摘（2026-09-23）「圏外で使えると言っていたのに、圏外ではログインできない」。
 * ログインの鍵は1時間で切れ、開くたびにサーバーで取り替える。圏外ではこれが
 * できず、入口へ戻されていた（圏外ではログインもできないので、行き止まり）。
 *
 * 見るのは7点。
 *   1. 電波のある場所でログインすると、控え（確かめた日時・圏外で使える日数）が残る
 *   2. **圏外で、鍵の期限が切れた状態で開き直しても、中に入れる**（この件の本体）
 *   3. そのとき長く待たせない（supabase は取り替えを30秒ほどやり直すため）
 *   4. 圏外ではログアウトを断る（出ると、電波が戻るまで入り直せない）
 *   5. 最後に確かめてから日数を過ぎると、ログインの画面ではなく
 *      「電波の届く場所で開いてください」を出す
 *   6. 電波が戻ると、自動で確かめて中へ通す（何も打たずに）
 *   7. 電波のある場所では、これまでどおりログアウトできる
 *
 * **本物の圏外で見る。** ブラウザを切り離し（setOffline）、アプリ本体は常駐処理
 * （sw.js）の控えから開く。ホーム画面に追加したアプリを地下で開くのと同じ。
 * 鍵の期限切れは、端末に残っている控えの期限を過去へ書き換えて作る
 * （1時間待つ代わり）。
 *
 * **検査用の会員を作り、最後に消す。**
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
const conn = connect();

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

const SEARCH = '施設名・よみがな・住所';
const LIMIT = '電波の届く場所で開いてください';

/** いま出ているのは、中（探す画面）か・ログインの画面か・日数切れの知らせか */
const where = (page) =>
  page.evaluate(
    ({ search, limit }) => {
      const text = document.body.innerText;
      if (document.querySelector(`input[placeholder="${search}"]`)) return 'app';
      if (text.includes(limit)) return 'limit';
      if ([...document.querySelectorAll('input')].some((i) => i.type === 'password')) return 'login';
      return 'blank';
    },
    { search: SEARCH, limit: LIMIT },
  );

/** 中・ログイン・知らせのどれかが出るまで待ち、かかった時間も返す */
async function settle(page, ms = 45000) {
  const t0 = Date.now();
  let w = 'blank';
  while (Date.now() - t0 < ms) {
    w = await where(page);
    if (w !== 'blank') break;
    await page.waitForTimeout(250);
  }
  return { where: w, took: Date.now() - t0 };
}

/** 端末に残っているログインの控えの期限を、1時間前にする（1時間たった状態） */
const expireSession = (page) =>
  page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    if (!key) return false;
    const s = JSON.parse(localStorage.getItem(key));
    s.expires_at = Math.floor(Date.now() / 1000) - 3600;
    localStorage.setItem(key, JSON.stringify(s));
    return true;
  });

const snapshot = (page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('kn_account_snapshot');
    return raw ? JSON.parse(raw) : null;
  });

let browser = null;
let member = null;

try {
  console.log(`圏外で開いたときのログインの検査: ${BASE}\n`);
  member = await createMember(conn, 'offline');
  browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  const page = await ctx.newPage();

  /* =================================================================== */
  console.log('--- 電波のある場所 ---');
  /* =================================================================== */
  await signInOn(page, BASE, member);
  /* もう一度開く。常駐処理（sw.js）がアプリ本体を控え、圏外でも開けるようになる */
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await skipIntro(page);
  let s = await settle(page);
  check('電波のある場所で、ログインして中に入れる', s.where === 'app', s.where);

  const kept = await snapshot(page);
  check(
    '控えに、確かめた日時と「圏外で使える日数」が残る',
    kept && typeof kept.verifiedAt === 'number' && Math.abs(Date.now() - kept.verifiedAt) < 120000 && kept.graceDays >= 1,
    JSON.stringify(kept && { verifiedAt: kept.verifiedAt, graceDays: kept.graceDays }),
  );
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller));
  check('アプリ本体が端末に控えてある（圏外でも開ける）', controlled);

  /* =================================================================== */
  console.log('\n--- 圏外（鍵の期限が切れた状態で開き直す） ---');
  /* =================================================================== */
  await ctx.setOffline(true);
  check('鍵の期限を切らした（1時間たった状態）', await expireSession(page));
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  s = await settle(page);
  check('圏外で、鍵の期限が切れていても中に入れる（入口へ戻されない）', s.where === 'app', `${s.where}（${s.took}ms）`);
  check('長く待たせない（10秒以内に中が出る）', s.where === 'app' && s.took < 10000, `${s.took}ms`);

  /* 圏外ではログアウトを断る。出ると、電波が戻るまで入り直せないため */
  await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2500);
  await skipIntro(page);
  const out = page.getByRole('button', { name: /^ログアウト$/ });
  const opened = (await out.count()) > 0;
  check('圏外でも、アカウントの画面を開ける', opened);
  let refused = false;
  if (opened) {
    await out.first().click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /^ログアウト$/ }).last().click();
    /* 知らせは数秒で消える。押した直後から見張る */
    for (let i = 0; i < 40 && !refused; i++) {
      refused = await page.evaluate(() => document.body.innerText.includes('電波の届く場所でログアウトしてください'));
      if (!refused) await page.waitForTimeout(200);
    }
  }
  const stillIn = await page.evaluate(
    () =>
      Boolean(localStorage.getItem('kn_account_snapshot')) &&
      Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)),
  );
  check('圏外ではログアウトを断り、理由を出す', refused);
  check('断ったあとも、ログインの控えは残っている', stillIn);

  /* =================================================================== */
  console.log('\n--- 圏外で使える日数を過ぎた ---');
  /* =================================================================== */
  const before = await snapshot(page);
  await page.evaluate(() => {
    const k = JSON.parse(localStorage.getItem('kn_account_snapshot'));
    k.verifiedAt = Date.now() - (k.graceDays + 1) * 24 * 60 * 60 * 1000;
    localStorage.setItem('kn_account_snapshot', JSON.stringify(k));
  });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  s = await settle(page);
  check(
    `最後に確かめてから ${before?.graceDays ?? '?'} 日を過ぎると、「${LIMIT}」を出す`,
    s.where === 'limit',
    s.where,
  );
  check('そのとき、ログインの画面は出さない（圏外では入れないため）', s.where !== 'login', s.where);

  /* =================================================================== */
  console.log('\n--- 電波が戻った ---');
  /* =================================================================== */
  await ctx.setOffline(false);
  const t0 = Date.now();
  let back = await where(page);
  while (back !== 'app' && Date.now() - t0 < 40000) {
    await page.waitForTimeout(500);
    back = await where(page);
  }
  check('電波が戻ると、自動で確かめて中へ通す（何も打たずに）', back === 'app', `${back}（${Date.now() - t0}ms）`);
  const fresh = await snapshot(page);
  check(
    '確かめ直した日時で、控えが書き換わる',
    fresh && Math.abs(Date.now() - fresh.verifiedAt) < 60000,
    JSON.stringify(fresh && { verifiedAt: fresh.verifiedAt }),
  );

  /* 電波のある場所では、これまでどおりログアウトできる */
  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await skipIntro(page);
  await page.getByRole('button', { name: /^ログアウト$/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^ログアウト$/ }).last().click();
  await page.waitForTimeout(5000);
  s = await settle(page, 15000);
  check('電波のある場所では、ログアウトできる', s.where === 'login', s.where);
  check('ログアウトすると、控えも消える', (await snapshot(page)) === null);
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close();
  const gone = await removeMember(conn, member);
  console.log(`\n検査用の会員を消した: ${gone ? 'はい' : 'いいえ（要確認）'}`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
