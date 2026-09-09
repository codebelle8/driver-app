/**
 * 1つのアカウントが1台までであることを見る。
 *
 *   node tools/test-one-device.mjs                        手元の書き出し (4173)
 *   node tools/test-one-device.mjs http://localhost:4180
 *
 * **なぜ別の入れ物で確かめるか**
 *   同じブラウザで開き直しても、同じ端末として扱われる。2台目を
 *   名乗るには、保存領域を共有しない入れ物が要る。
 *
 * **後勝ちであることも確かめる**
 *   2台目を断る作りにすると、機種変更や故障のたびに入れなくなる。
 *   新しく入った端末を通し、前の端末が出ていく形にしている。
 *
 * 見るのは6点。
 *   1. 1台目で入れること
 *   2. 2台目でも入れること（断らない）
 *   3. 名簿の控えが2台目の符号に変わること
 *   4. 1台目が開き直すと、出ていること
 *   5. 出された理由が画面に出ること
 *   6. 後片付け
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

const deviceOf = async (userId) => {
  const r = await fetch(
    `${conn.url}/rest/v1/driver_profiles?user_id=eq.${userId}&select=device_id`,
    { headers: conn.svc },
  );
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0].device_id : undefined;
};

let browser = null;
let member = null;

try {
  console.log(`1つのアカウントは1台までの検査: ${BASE}\n`);
  member = await createMember(conn, 'onedev');
  browser = await chromium.launch();

  /** 1台ぶんの入れ物。保存領域は共有しない。 */
  const openDevice = async (label) => {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(6000);
    await skipIntro(page);

    await page.getByLabel('メールアドレス').fill(member.email);
    await page.getByLabel('パスワード', { exact: true }).fill(member.password);
    await page.getByRole('button', { name: 'ログイン' }).last().click();
    await page.waitForTimeout(7000);
    console.log(`  （${label}）`);
    return page;
  };

  const inside = async (page) => (await page.locator('body').innerText()).includes('案内できる範囲');

  // --- 1台目 -------------------------------------------------------------------
  console.log('--- 1台目 ---');
  const a = await openDevice('1台目でログイン');
  check('1台目で入れる', await inside(a));

  const first = await deviceOf(member.userId);
  check('名簿に1台目の符号が入る', typeof first === 'string' && first.length > 0, String(first));

  // --- 2台目 -------------------------------------------------------------------
  console.log('\n--- 2台目 ---');
  const b = await openDevice('2台目でログイン');
  check('2台目でも入れる（断らない）', await inside(b));

  const second = await deviceOf(member.userId);
  check(
    '控えが2台目の符号に変わる',
    typeof second === 'string' && second.length > 0 && second !== first,
    `${first} → ${second}`,
  );

  // --- 1台目が開き直す ---------------------------------------------------------
  console.log('\n--- 1台目が開き直す ---');
  await a.reload({ waitUntil: 'networkidle' });
  await a.waitForTimeout(8000);
  await skipIntro(a);

  const body = await a.locator('body').innerText();
  check('1台目は出されている', body.includes('ようこそ'), body.slice(0, 80).replace(/\n/g, ' / '));
  check('中身は出さない', !body.includes('案内できる範囲'), body.slice(0, 60));
  check(
    '出された理由が出る',
    body.includes('ほかの端末でログインされました'),
    body.slice(0, 120).replace(/\n/g, ' / '),
  );

  // 2台目はそのまま使える
  await b.reload({ waitUntil: 'networkidle' });
  await b.waitForTimeout(6000);
  await skipIntro(b);
  check('2台目はそのまま使える', await inside(b));
} finally {
  console.log('\n--- 後片付け ---');
  check('検査で作った会員を消した', await removeMember(conn, member));

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
