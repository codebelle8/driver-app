/**
 * 料金の刻みが、画面と控えの両方で正しいかを確かめる。
 *
 *   node tools/test-plans.mjs                          手元の書き出し
 *   node tools/test-plans.mjs https://kurumayose-navi.vercel.app
 *
 * **何を見るか**
 *   1. 4つの刻みが、短い順に並んでいる
 *   2. それぞれの金額が合っている
 *   3. 選ぶと、その刻みが控えに残る
 *   4. 選んだ刻みが、お支払いの画面に出る
 *
 * **金額は、こちらでも別に持って突き合わせる。**
 *   画面が出した文字を、画面の元にした表と比べても意味がない。
 *   ご指示の数字をここへ書き写し、それと比べる。
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const raw = process.argv[2] ?? 'http://localhost:4190';
const BASE = raw.endsWith('/') ? raw.slice(0, -1) : raw;
const NL = String.fromCharCode(10);

const conn = connect();

/** ご指示の金額（2026-09-14）。画面の実装とは別に持つ。 */
const WANT = [
  { id: 'monthly', name: '1か月', yen: '4,000' },
  { id: 'quarterly', name: '3か月', yen: '11,000' },
  { id: 'half', name: '6か月', yen: '21,000' },
  { id: 'yearly', name: '1年', yen: '40,000' },
];

/** 選んでみる刻み。**今回増やしたほう**を選ぶ。前からある2つでは、 */
/** 制約を張り替えていなくても通ってしまい、確かめたことにならない。 */
const PICK = { id: 'quarterly', name: '3か月' };

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

let browser = null;
let member = null;

try {
  console.log(`料金の刻みの検査: ${BASE}${NL}`);
  member = await createMember(conn, 'plans');
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();

  await signInOn(page, BASE, member, { goto: '/' });
  await page.waitForTimeout(3000);
  await page.goto(`${BASE}/plan`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await skipIntro(page);
  await page.waitForTimeout(600);

  /* 選ぶところを開く */
  const opener = page.locator('text=/お選びいただく|料金を選ぶ|変更する|選ぶ/').first();
  if (await opener.count()) {
    await opener.click().catch(() => undefined);
    await page.waitForTimeout(900);
  }

  const choices = await page.evaluate(() => {
    const group = document.querySelector('[role="radiogroup"]');
    if (!group) return null;
    return [...group.querySelectorAll('[role="radio"]')].map((el) =>
      el.innerText.replace(/\s+/g, ' ').trim(),
    );
  });

  check('4つの刻みが出ている', Array.isArray(choices) && choices.length === 4,
    JSON.stringify(choices));

  if (Array.isArray(choices) && choices.length === 4) {
    WANT.forEach((w, i) => {
      const got = choices[i] ?? '';
      check(
        `${i + 1}番目が「${w.name}　${w.yen} 円」`,
        got.includes(w.name) && got.includes(w.yen),
        `画面には「${got}」`,
      );
    });
  }

  /* 選んで、控えに残るか */
  const target = page.locator('[role="radio"]', { hasText: PICK.name }).first();
  await target.click();
  await page.waitForTimeout(500);

  /* 決める釦。辞書の文言（plan.choose）で探す。 */
  await page.getByRole('button', { name: 'この内容で申し込む' }).click();
  await page.waitForTimeout(3000);

  const row = await fetch(
    `${conn.url}/rest/v1/driver_profiles?select=plan,plan_chosen_at&user_id=eq.${member.userId}`,
    { headers: conn.svc },
  ).then((r) => r.json());

  check(
    `「${PICK.name}」を選ぶと控えに ${PICK.id} が残る`,
    Array.isArray(row) && row[0]?.plan === PICK.id,
    JSON.stringify(row),
  );
  check('選んだ時刻も残る', Array.isArray(row) && Boolean(row[0]?.plan_chosen_at));

  /* お支払いの画面に、選んだ刻みが出るか */
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await skipIntro(page);
  await page.waitForTimeout(600);
  /*
    **「ご希望の料金」の欄だけを読む。**

    画面全体の文字を探すと、選ぶところの一覧にも「3か月」が並んでいる
    ため、控えに残っていなくても見つかってしまう。実際に、保存に
    失敗しているのにこの行だけ合格していた。
  */
  const shown = await page.evaluate((label) => {
    const hit = [...document.querySelectorAll('div')].find(
      (el) => el.childElementCount >= 2 && el.children[0]?.textContent?.trim() === label,
    );
    return hit ? hit.innerText.replace(/\s+/g, ' ').trim() : null;
  }, 'ご希望の料金');
  check(`「ご希望の料金」の欄に「${PICK.name}」と出る`,
    typeof shown === 'string' && shown.includes(PICK.name), String(shown));

  await ctx.close();
} finally {
  console.log(`${NL}--- 後片付け ---`);
  check('検査で作った会員を消した', await removeMember(conn, member));
  if (browser) await browser.close();
  console.log(`${NL}合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
