/**
 * 管理画面で直した内容が、アプリのお知らせに出るかを確かめる。
 *
 *   node tools/test-change-notice.mjs                        手元の書き出し
 *   node tools/test-change-notice.mjs https://kurumayose-navi.vercel.app
 *
 * **なぜ要るか**
 *   ご指示（2026-09-14）「新しく追加したときだけでなく、既存の内容を
 *   修正したときにもお知らせが出るように」。
 *
 * **いちばん大事なのは、出ないことの確認**
 *   「更新されました」は一度入れて、**取り下げた経緯がある**
 *   （2026-09-04）。更新日時で判じていたため、データを一括で入れ直すと
 *   全件の更新日時が同じになり、**一度も見たことのない施設について
 *   30件が並んだ。**
 *
 *   いまは中身そのものを突き合わせている。**値を変えずに取り込み直して
 *   も、お知らせが出ないこと**を必ず確かめる。ここを見ないと、同じ事故を
 *   繰り返す。
 *
 * **発注元の施設を書き換えるため、必ず元へ戻す。**
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const raw = process.argv[2] ?? 'http://localhost:4190';
const BASE = raw.endsWith('/') ? raw.slice(0, -1) : raw;
const NL = String.fromCharCode(10);

const conn = connect();

const rest = async (path, { method = 'GET', body } = {}) => {
  const r = await fetch(`${conn.url}/rest/v1/${path}`, {
    method,
    headers: conn.svc,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let b = null;
  try { b = t ? JSON.parse(t) : null; } catch { b = t; }
  return { ok: r.ok, body: b };
};

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

/** お知らせの画面から、いま出ている知らせを読む */
const READ_NOTICES = () =>
  [...document.querySelectorAll('a[href*="/facility/"]')]
    .map((a) => a.innerText.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

let browser = null;
let member = null;
let epBefore = null;

try {
  console.log(`直した内容がお知らせに出るかの検査: ${BASE}${NL}`);
  member = await createMember(conn, 'change');

  /* 直す相手。入口を持つ施設から1件。 */
  const eps = await rest('entry_points?select=*&limit=1&order=sort_order.asc');
  epBefore = eps.body?.[0] ?? null;
  if (!epBefore) throw new Error('入口が1件も取れません');
  const fac = (await rest(`facilities?select=name&id=eq.${epBefore.facility_id}`)).body?.[0];
  console.log(`  対象  ${fac?.name}（入口 ${epBefore.code}）${NL}`);

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();

  // --- 1回目の取り込み。ここで端末が今の中身を覚える -------------------------
  await signInOn(page, BASE, member, { goto: '/' });
  await page.waitForTimeout(5000);
  await skipIntro(page);

  await page.goto(`${BASE}/notices`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const first = await page.evaluate(READ_NOTICES);
  check('はじめは、変更のお知らせが出ていない',
    !first.some((x) => x.includes('変わりました')), JSON.stringify(first).slice(0, 200));

  // --- 何も変えずに取り込み直す。出てはいけない -------------------------------
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await skipIntro(page);
  await page.goto(`${BASE}/notices`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const again = await page.evaluate(READ_NOTICES);
  check('**何も変えずに取り込み直しても、お知らせは出ない**',
    !again.some((x) => x.includes('変わりました')), JSON.stringify(again).slice(0, 200));

  // --- 進入方法を直す ---------------------------------------------------------
  const mark = `検査：進入方法を直しました ${Date.now()}`;
  await rest(`entry_points?id=eq.${epBefore.id}`, {
    method: 'PATCH',
    body: { approach_text: mark },
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await skipIntro(page);
  await page.goto(`${BASE}/notices`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const afterEdit = await page.evaluate(READ_NOTICES);
  const hit = afterEdit.find((x) => x.includes('変わりました'));
  check('進入方法を直すと、お知らせが出る', Boolean(hit),
    JSON.stringify(afterEdit).slice(0, 240));
  check('施設の名前が出ている', Boolean(hit && fac?.name && hit.includes(fac.name)),
    String(hit).slice(0, 160));
  check('**何が変わったかまで出ている**（進入方法）',
    Boolean(hit && hit.includes('進入方法')), String(hit).slice(0, 160));

  const section = await page.evaluate(() =>
    document.body.innerText.includes('案内が変わった施設'),
  );
  check('「案内が変わった施設」の見出しが出る', section);

  // --- 高さ制限も直してみる ---------------------------------------------------
  await rest(`entry_points?id=eq.${epBefore.id}`, {
    method: 'PATCH',
    body: { height_limit_cm: (epBefore.height_limit_cm ?? 0) + 210 },
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await skipIntro(page);
  await page.goto(`${BASE}/notices`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const afterHeight = await page.evaluate(READ_NOTICES);
  const hit2 = afterHeight.find((x) => x.includes('変わりました'));
  check('高さ制限を直すと、そのことが出る',
    Boolean(hit2 && hit2.includes('高さ制限')), String(hit2).slice(0, 160));
  check('同じ施設が二重に並ばない',
    afterHeight.filter((x) => x.includes('変わりました')).length === 1,
    JSON.stringify(afterHeight).slice(0, 240));

  await ctx.close();
} finally {
  console.log(`${NL}--- 後片付け ---`);
  if (browser) await browser.close();

  if (epBefore) {
    const { id, created_at, updated_at, ...restCols } = epBefore;
    void created_at; void updated_at;
    const r = await rest(`entry_points?id=eq.${id}`, { method: 'PATCH', body: restCols });
    const back = (await rest(`entry_points?select=approach_text,height_limit_cm&id=eq.${id}`))
      .body?.[0];
    check('入口を元へ戻した',
      r.ok && back?.approach_text === epBefore.approach_text
        && back?.height_limit_cm === epBefore.height_limit_cm,
      JSON.stringify(back));
  }
  check('検査で作った会員を消した', await removeMember(conn, member));

  console.log(`${NL}合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
