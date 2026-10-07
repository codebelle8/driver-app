/**
 * チャットの「情報提供ランキング」と「送った情報」を確かめる（2026-10-05）。
 *
 *   node tools/test-ranking.mjs                                 手元（4291）
 *   node tools/test-ranking.mjs https://kurumayose-navi.vercel.app
 *
 * 決まったこと（2026-10-05）
 *   * 順位は採用件数。送った件数は本人にだけ見せる
 *   * 順位には表示名。出したくない方は設定で「匿名」を選べる
 *   * 無料期間が切れて締め出されている方も、このチャンネルは見られる
 *
 * 見るもの
 *   1. 下の帯に「チャット」がある。一覧に「情報提供ランキング」と、今月の自分の件数・順位
 *   2. チャンネルに、今月のあなた（採用・送った件数・順位）が出る
 *   3. 今月の順位に、ほかの方の表示名・匿名の方・自分（あなた）が並び、採用件数の順
 *   4. 「送った情報を見る」で、審査待ち・採用が施設名つきで並ぶ
 *   5. 設定で「ランキングで名前を出さない」を入れると、ほかの方から名前が見えなくなる
 *   6. 無料期間が切れて締め出されても、チャットとランキングは開ける
 *
 * **検査用の会員・情報を作り、最後に消す。**
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';
import { paidModeForTest } from './lib/trial.mjs';

const APP = (process.argv[2] ?? 'http://localhost:4291').replace(/\/$/, '');
const conn = connect();
const STAMP = String(Date.now()).slice(-5);
/** 帝国ホテル東京 */
const TWO = '8e1f2039-8b2d-4728-9ee1-6704ebbef86e';
const NAME_A = `検査エー${STAMP}`;
const NAME_B = `検査ビー${STAMP}`;
const NAME_C = `検査シー${STAMP}`;

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

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${conn.url}${path}`, {
    method,
    headers: { ...conn.svc, ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: r.ok, status: r.status, body: json };
}

async function tokenOf(member) {
  const r = await fetch(`${conn.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: member.email, password: member.password }),
  });
  return (await r.json()).access_token;
}

async function rankingAs(member) {
  const token = await tokenOf(member);
  const r = await fetch(`${conn.url}/rest/v1/rpc/submission_ranking`, {
    method: 'POST',
    headers: { apikey: conn.anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return r.json();
}

/** 会員の行を用意する（アプリで入っていない方の分） */
async function profile(member, display_name, rank_anonymous = false) {
  await sb('/rest/v1/driver_profiles', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: {
      user_id: member.userId,
      trial_ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      display_name,
      rank_anonymous,
    },
  });
}

/** 採用済み・審査待ちの情報を入れる（service_role。審査の日時はいま） */
async function seed(member, accepted, pending = 0) {
  const now = new Date().toISOString();
  const rows = [
    ...Array.from({ length: accepted }, (_, i) => ({
      user_id: member.userId, facility_id: TWO, kind: 'other', body: `検査 採用 ${i + 1}`,
      status: 'accepted', reviewed_at: now,
    })),
    ...Array.from({ length: pending }, (_, i) => ({
      /* まとめて入れるときは、どの行も同じ列をそろえる（そろわないと全体が断られる） */
      user_id: member.userId, facility_id: TWO, kind: 'caution', body: `検査 審査待ち ${i + 1}`,
      status: 'pending', reviewed_at: null,
    })),
  ];
  const r = await sb('/rest/v1/submissions', { method: 'POST', body: rows });
  if (!r.ok) throw new Error(`情報を入れられません: ${JSON.stringify(r.body).slice(0, 200)}`);
}

let browser = null;
const members = [];

/* 締め出しを確かめるため、検査のあいだだけ有料の提供のときの姿にする（試験提供を外す） */
let restoreTrial = async () => {};

try {
  restoreTrial = await paidModeForTest(conn);
  console.log(`情報提供ランキングの検査: ${APP}\n`);
  const a = await createMember(conn, 'rank-a');
  const b = await createMember(conn, 'rank-b');
  const c = await createMember(conn, 'rank-c');
  members.push(a, b, c);
  await profile(b, NAME_B);
  await profile(c, NAME_C, true);
  await seed(b, 3);
  await seed(c, 1);

  browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  /* A はアプリで入る（行はそのとき作られる）。そのあと表示名と情報を入れる */
  await signInOn(page, APP, a);
  await sb(`/rest/v1/driver_profiles?user_id=eq.${a.userId}`, { method: 'PATCH', body: { display_name: NAME_A } });
  await seed(a, 2, 1);

  const before = await rankingAs(a);
  const rankOf = (j, name) => j.top.find((r) => r.name === name)?.rank;
  const rankB = rankOf(before, NAME_B);
  const rankA = rankOf(before, NAME_A);

  /* =================================================================== */
  console.log('--- チャットの一覧 ---');
  /* =================================================================== */
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await skipIntro(page);
  check('下の帯に「チャット」がある', (await page.getByText('チャット', { exact: true }).count()) >= 1);
  await page.goto(`${APP}/chat`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const list = await page.locator('body').innerText();
  check('「情報提供ランキング」のチャンネルがある', list.includes('情報提供ランキング'));
  check('今月の自分の採用件数と順位が添えてある',
    list.includes(`今月のあなた：採用 2件・${rankA}位`), list.slice(0, 300));

  /* =================================================================== */
  console.log('\n--- 情報提供ランキング ---');
  /* =================================================================== */
  await page.getByRole('button', { name: '情報提供ランキング' }).click();
  await page.waitForTimeout(3500);
  check('チャンネルが開く', page.url().includes('/ranking'), page.url());
  const me = (await page.getByTestId('ranking-me').innerText()).replace(/\s+/g, ' ');
  check('今月のあなた: 採用 2件', /採用 2件/.test(me), me);
  check('今月のあなた: 送った件数 3件（審査待ちも含む）', /送った件数 3件/.test(me), me);
  check(`今月のあなた: 順位 ${rankA}位`, me.includes(`${rankA}位`), me);
  const body = await page.locator('body').innerText();
  check('今月の順位に、ほかの方の表示名が出る', body.includes(NAME_B));
  check('匿名を選んだ方は「匿名の会員」と出る', body.includes('匿名の会員') && !body.includes(NAME_C));
  check('自分の行に「（あなた）」が付く', body.includes(`${NAME_A}（あなた）`));
  check('採用件数の多い方が上（B が A より上）', rankB < rankA, JSON.stringify({ rankB, rankA }));

  await page.getByRole('button', { name: '送った情報を見る' }).click();
  await page.waitForTimeout(3000);
  check('「送った情報」が開く', page.url().includes('/my-submissions'), page.url());
  const cards = page.getByTestId('my-submission');
  const texts = await cards.allInnerTexts();
  check('送った3件が並ぶ', texts.length === 3, String(texts.length));
  check('状態（採用・審査待ち）が出る',
    texts.filter((x) => x.includes('採用')).length === 2 && texts.filter((x) => x.includes('審査待ち')).length === 1,
    JSON.stringify(texts.map((x) => x.split('\n')[0])));
  check('施設名が出る', texts.every((x) => x.includes('帝国ホテル')));

  /* =================================================================== */
  console.log('\n--- 匿名にする ---');
  /* =================================================================== */
  await page.goto(`${APP}/mypage`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const toggle = page.getByRole('switch', { name: 'ランキングで名前を出さない' });
  check('設定に「ランキングで名前を出さない」がある', (await toggle.count()) === 1);
  await toggle.click();
  await page.waitForTimeout(2500);
  const row = await sb(`/rest/v1/driver_profiles?select=rank_anonymous&user_id=eq.${a.userId}`);
  check('入れると、匿名として控えられる', row.body?.[0]?.rank_anonymous === true, JSON.stringify(row.body));
  const seenByB = await rankingAs(b);
  check('ほかの方からは、名前が見えなくなる', !JSON.stringify(seenByB.top).includes(NAME_A),
    JSON.stringify(seenByB.top).slice(0, 200));
  check('送った件数は、本人にだけ返る（B から見た B の分）', seenByB.me.sent === 3 && !('sent' in (seenByB.top[0] ?? {})));

  /* =================================================================== */
  console.log('\n--- 締め出されていても見られる ---');
  /* =================================================================== */
  await sb(`/rest/v1/driver_profiles?user_id=eq.${a.userId}`, {
    method: 'PATCH',
    body: { trial_ends_at: '2026-01-01T00:00:00Z' },
  });
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  check('無料期間が切れると締め出される（設定へ移る）', page.url().includes('/mypage'), page.url());
  check('締め出されていても、下の帯に「チャット」が残る', (await page.getByText('チャット', { exact: true }).count()) >= 1);
  await page.goto(`${APP}/ranking`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  check('締め出されていても、ランキングを開ける', page.url().includes('/ranking'), page.url());
  check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
  await ctx.close();
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  await restoreTrial();
  if (browser) await browser.close().catch(() => undefined);
  for (const m of members) {
    await sb(`/rest/v1/submissions?user_id=eq.${m.userId}`, { method: 'DELETE' });
  }
  let gone = true;
  for (const m of members) gone = (await removeMember(conn, m)) && gone;
  console.log(`\n検査用の会員・情報を消した: ${gone ? 'はい' : 'いいえ（要確認）'}`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
