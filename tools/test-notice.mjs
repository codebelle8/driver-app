/**
 * 「複製しました」などの短い知らせが、画面の中の帯で出るかを見る。
 *
 *   node tools/test-notice.mjs                        手元の書き出し (4173)
 *   node tools/test-notice.mjs https://app.kurumayosenavi.com
 *
 * 見るのは4点。
 *   1. ブラウザの alert を使っていないこと
 *   2. 画面の中に帯が出て、写した中身が読めること
 *   3. 押さなくても消えること（伝えるだけの内容に、閉じる操作を求めない）
 *   4. 押せば早く消えること
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn } from './lib/member.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:4190').replace(/\/$/, '');
const conn = connect();

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

let browser = null;
let member = null;

try {
  console.log(`短い知らせの検査: ${BASE}\n`);

  /*
    先にログインする。

    起動したときにログインを求める作りへ変えた（P-10）以降、
    ログインせずに施設の画面を開いても入口が出るだけになっていた。
    この検査はそこで止まったまま気づかれずにいた。
  */
  member = await createMember(conn, 'notice');
  browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 1280, height: 900 },
    // 「複製しました」を出すには、書き込みの許可が要る
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();

  let nativeDialogs = [];
  page.on('dialog', async (d) => {
    nativeDialogs.push(`${d.type()}: ${d.message()}`);
    await d.dismiss();
  });

  const skipIntro = async () => {
    const skip = page.getByRole('button', { name: '導入を飛ばす' });
    if (await skip.count()) {
      await skip.first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
  };

  await signInOn(page, BASE, member, { goto: '/' });
  await page.waitForTimeout(4000);
  await skipIntro();

  // 座標のある施設を探す。無い施設では複製のボタンが出ない。
  const id = await page.evaluate(() => {
    const cat = JSON.parse(localStorage.getItem('kn_catalog') ?? '{}');
    const eps = cat.entryPoints ?? [];
    const withNav = eps.find((e) => e.nav_lat !== null && e.nav_lat !== undefined);
    if (!withNav) return null;
    return withNav.facility_id;
  });
  check('座標のある施設がある', !!id, String(id));
  if (!id) throw new Error('座標のある施設が無いため中止');

  await page.goto(`${BASE}/facility/${id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await skipIntro();
  nativeDialogs = [];

  // --- 座標を複製する ---------------------------------------------------------
  const copy = page.getByRole('button', { name: /の座標を複製$/ });
  check('座標を複製するボタンが出ている', (await copy.count()) > 0, `${await copy.count()}個`);
  await copy.first().click();
  await page.waitForTimeout(900);

  check(
    'ブラウザの alert を使っていない',
    nativeDialogs.length === 0,
    nativeDialogs.join(' / '),
  );

  const toast = page.getByRole('button', { name: /複製しました。閉じる$/ });
  check('画面の中に帯が出る', (await toast.count()) === 1, `${await toast.count()}個`);

  const text = (await toast.count()) ? await toast.first().innerText() : '';
  check('何をしたかが書かれている', text.includes('座標を複製しました'), text);
  check(
    '写した中身が読める',
    /\d+\.\d+/.test(text),
    text,
  );

  // --- 押さなくても消える -------------------------------------------------------
  await page.waitForTimeout(4200);
  check('押さなくても消える', (await toast.count()) === 0, `${await toast.count()}個`);

  // --- 押せば早く消える ---------------------------------------------------------
  await copy.first().click();
  await page.waitForTimeout(700);
  check('もう一度出せる', (await toast.count()) === 1);
  await toast.first().click();
  await page.waitForTimeout(400);
  check('押すと消える', (await toast.count()) === 0);

  // --- 共有 ---------------------------------------------------------------------
  //
  // navigator.share が無い環境では複製に落ちる。落ちた側も
  // 帯で伝わることを見る。
  const share = page.getByRole('button', { name: /共有/ });
  if (await share.count()) {
    nativeDialogs = [];
    await share.first().click();
    await page.waitForTimeout(1200);
    check(
      '共有でもブラウザの alert を使っていない',
      nativeDialogs.length === 0,
      nativeDialogs.join(' / '),
    );
  }
} finally {
  if (member) check('検査で作った会員を消した', await removeMember(conn, member));
  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
