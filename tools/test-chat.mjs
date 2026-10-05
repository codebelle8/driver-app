/**
 * チャット「情報交換」（会員どうしの書き込み）と、管理画面の見張りを確かめる（2026-10-05）。
 *
 *   node tools/test-chat.mjs                                     手元（アプリ 4291・管理画面 3100）
 *   node tools/test-chat.mjs https://kurumayose-navi.vercel.app https://kurumayose-navi-admin.vercel.app
 *
 * 見るもの
 *   アプリ
 *     1. チャットの一覧に「情報交換」があり、開くとルールが出ている
 *     2. 書き込める。自分の書き込みは「あなた」と出る
 *     3. ほかの会員の書き込みが、開いたまま届く（読み直しの操作なしで）
 *     4. 他人の書き込みを通報できる（確認の小窓を通す）
 *     5. 自分の書き込みを消せる
 *     6. 締め出されていても読み書きできる
 *   管理画面
 *     7. 編集者の左の柱に「チャット」と未対応の通報の数
 *     8. 通報のあった書き込みが出て、非表示にできる（人と日時・操作履歴が残る・通報は片付く）
 *     9. 非表示にした書き込みは、会員の画面から消える
 *    10. 会員の書き込みを止められる。止められた会員は書けず、その旨が出る
 *    11. 調査員は入れない
 *
 * **検査用の会員・職員・書き込みを作り、最後に消す**（操作履歴も消す）。
 */
import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const APP = (process.argv[2] ?? 'http://localhost:4291').replace(/\/$/, '');
const ADMIN = (process.argv[3] ?? 'http://localhost:3100').replace(/\/$/, '');
const conn = connect();
const STAMP = String(Date.now()).slice(-6);
const NAME_A = `検査チャットA${STAMP}`;
const POST_A = `検査 ${STAMP}：B 入口は今日は工事中でした`;
const POST_A2 = `検査 ${STAMP}：消す予定の書き込み`;
const POST_B = `検査 ${STAMP}：情報ありがとうございます`;
const PASSWORD = 'Hq7wTz3nRv9xLm';

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

async function makeStaff(role) {
  const email = `chat-${role}-${STAMP}@kurumayose.invalid`;
  const r = await sb('/auth/v1/admin/users', { method: 'POST', body: { email, password: PASSWORD, email_confirm: true } });
  const id = r.body?.id;
  if (!id) throw new Error(`職員を作れません: ${JSON.stringify(r.body).slice(0, 160)}`);
  await sb('/rest/v1/admin_profiles', { method: 'POST', body: { user_id: id, display_name: `チャット検査・${role}`, role } });
  return { id, email };
}

async function adminSignIn(browser, staff) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1360, height: 1000 } });
  await ctx.addCookies([{ name: 'kn_locale', value: 'ja', domain: new URL(ADMIN).hostname, path: '/' }]);
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', staff.email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  return { ctx, page };
}

const messageId = async (body) =>
  (await sb(`/rest/v1/chat_messages?select=id,hidden_at,hidden_by&body=eq.${encodeURIComponent(body)}`)).body?.[0];

async function openRoom(page) {
  await page.goto(`${APP}/chat-room`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await skipIntro(page);
  await page.waitForTimeout(500);
}

let browser = null;
const members = [];
const staff = [];
const touched = [];

try {
  console.log(`チャットの検査: アプリ ${APP} ／ 管理画面 ${ADMIN}\n`);
  const a = await createMember(conn, 'chat-a');
  const b = await createMember(conn, 'chat-b');
  members.push(a, b);
  browser = await chromium.launch({ channel: 'msedge' });

  /* =================================================================== */
  console.log('--- アプリ：書く ---');
  /* =================================================================== */
  const aCtx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const aPage = await aCtx.newPage();
  const errors = [];
  aPage.on('pageerror', (e) => errors.push(e.message));
  await signInOn(aPage, APP, a);
  await sb(`/rest/v1/driver_profiles?user_id=eq.${a.userId}`, { method: 'PATCH', body: { display_name: NAME_A } });

  await aPage.goto(`${APP}/chat`, { waitUntil: 'networkidle' });
  await aPage.waitForTimeout(2500);
  const talk = aPage.getByRole('button', { name: '情報交換' });
  check('チャットの一覧に「情報交換」がある', (await talk.count()) === 1);
  await talk.click();
  await aPage.waitForTimeout(3000);
  check('開くと「情報交換」の画面になる', aPage.url().includes('/chat-room'), aPage.url());
  check('ルールが出ている', (await aPage.locator('body').innerText()).includes('人を傷つける書き込みはしないでください'));

  const input = aPage.getByLabel('書き込む（500字まで）');
  await input.fill(POST_A);
  await aPage.getByRole('button', { name: '送る', exact: true }).click();
  await aPage.waitForTimeout(2500);
  const mine = aPage.getByTestId('chat-message').filter({ hasText: POST_A });
  check('書き込める', (await mine.count()) === 1);
  check('自分の書き込みは「あなた」と出る', (await mine.innerText()).includes('あなた'));
  const rowA = await messageId(POST_A);
  if (rowA) touched.push(rowA.id);
  check('書き込みが本人の名前で残る', !!rowA);

  /* =================================================================== */
  console.log('\n--- アプリ：ほかの会員 ---');
  /* =================================================================== */
  const bCtx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const bPage = await bCtx.newPage();
  await signInOn(bPage, APP, b);
  await openRoom(bPage);
  const seen = bPage.getByTestId('chat-message').filter({ hasText: POST_A });
  check('ほかの会員の書き込みが、表示名つきで見える',
    (await seen.count()) === 1 && (await seen.innerText()).includes(NAME_A));

  /* B が書く → A の画面へ、開いたまま届く */
  await bPage.getByLabel('書き込む（500字まで）').fill(POST_B);
  await bPage.getByRole('button', { name: '送る', exact: true }).click();
  let arrived = false;
  for (let i = 0; i < 30 && !arrived; i++) {
    await aPage.waitForTimeout(1000);
    arrived = (await aPage.getByTestId('chat-message').filter({ hasText: POST_B }).count()) === 1;
  }
  check('ほかの会員の書き込みが、開いたままの画面に届く（30秒以内）', arrived);
  check('表示名の無い会員は「名前未設定の会員」と出る',
    arrived && (await aPage.getByTestId('chat-message').filter({ hasText: POST_B }).innerText()).includes('名前未設定の会員'));
  const rowB = await messageId(POST_B);
  if (rowB) touched.push(rowB.id);

  /* B が A の書き込みを通報する */
  await seen.getByRole('button', { name: '通報' }).click();
  await bPage.waitForTimeout(800);
  check('通報の前に確認の小窓が出る', (await bPage.getByTestId('confirm-dialog').count()) === 1);
  await bPage.getByTestId('confirm-accept').click();
  await bPage.waitForTimeout(2000);
  const rep = await sb(`/rest/v1/chat_reports?select=reporter_id,state&message_id=eq.${rowA?.id}`);
  check('通報が届く（通報した人つき・未対応）',
    rep.body?.length === 1 && rep.body[0].reporter_id === b.userId && rep.body[0].state === 'open', JSON.stringify(rep.body));

  /* A が自分の書き込みを消す */
  await aPage.getByLabel('書き込む（500字まで）').fill(POST_A2);
  await aPage.getByRole('button', { name: '送る', exact: true }).click();
  await aPage.waitForTimeout(2500);
  const toDelete = aPage.getByTestId('chat-message').filter({ hasText: POST_A2 });
  await toDelete.getByRole('button', { name: '削除' }).click();
  await aPage.waitForTimeout(800);
  await aPage.getByTestId('confirm-accept').click();
  await aPage.waitForTimeout(2500);
  check('自分の書き込みを消せる',
    (await aPage.getByTestId('chat-message').filter({ hasText: POST_A2 }).count()) === 0 && !(await messageId(POST_A2)));

  /* =================================================================== */
  console.log('\n--- 管理画面：見張り ---');
  /* =================================================================== */
  const editor = await makeStaff('editor');
  const surveyor = await makeStaff('surveyor');
  staff.push(editor, surveyor);
  {
    const { ctx, page } = await adminSignIn(browser, editor);
    const nav = page.getByRole('link', { name: /チャット/ });
    const navText = (await nav.first().innerText()).replace(/\s+/g, ' ');
    check('編集者の左の柱に「チャット」と未対応の通報の数', /チャット\s*\d+/.test(navText), navText);
    await page.goto(`${ADMIN}/chat`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const card = page.locator('div', { hasText: POST_A }).filter({ has: page.locator('form') }).last();
    check('通報のあった書き込みが出る（通報の件数つき）',
      (await card.count()) === 1 && (await card.innerText()).includes('通報 1 件'));
    check('誰が通報したかは出さない', !(await card.innerText()).includes(b.email));
    await card.getByRole('button', { name: '非表示にする' }).click();
    await page.waitForTimeout(3000);
    const hidden = await messageId(POST_A);
    check('非表示にでき、人と日時が残る', !!hidden?.hidden_at && hidden.hidden_by === editor.id, JSON.stringify(hidden));
    const rep2 = await sb(`/rest/v1/chat_reports?select=state&message_id=eq.${rowA?.id}`);
    check('非表示にすると、通報も片付く', rep2.body?.[0]?.state === 'done', JSON.stringify(rep2.body));
    const audit = await sb(`/rest/v1/audit_logs?select=actor_id&table_name=eq.chat_messages&record_id=eq.${rowA?.id}`);
    check('非表示が操作履歴に残る', (audit.body ?? []).some((x) => x.actor_id === editor.id), JSON.stringify(audit.body));

    /* B の書き込みを止める（すべての書き込みから） */
    await page.goto(`${ADMIN}/chat?tab=all`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const bCard = page.locator('div', { hasText: POST_B }).filter({ has: page.locator('form') }).last();
    await bCard.getByRole('button', { name: 'この会員の書き込みを止める' }).click();
    await page.waitForTimeout(3000);
    const prof = await sb(`/rest/v1/driver_profiles?select=chat_muted&user_id=eq.${b.userId}`);
    check('会員の書き込みを止められる', prof.body?.[0]?.chat_muted === true, JSON.stringify(prof.body));
    await ctx.close();
  }

  /* 会員の画面から消える／止められた会員は書けない */
  await openRoom(aPage);
  check('非表示にした書き込みは、会員の画面から消える',
    (await aPage.getByTestId('chat-message').filter({ hasText: POST_A }).count()) === 0);
  await openRoom(bPage);
  check('止められた会員には、その旨が出る',
    (await bPage.locator('body').innerText()).includes('書き込みは運営により止められています'));
  check('止められた会員には、書く欄を出さない', (await bPage.getByLabel('書き込む（500字まで）').count()) === 0);
  const tokenB = await tokenOf(b);
  const tryPost = await fetch(`${conn.url}/rest/v1/chat_messages`, {
    method: 'POST',
    headers: { apikey: conn.anon, Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: b.userId, body: '止められても書けるか' }),
  });
  check('止められた会員は、鍵を使っても書けない', !tryPost.ok, String(tryPost.status));

  {
    const { ctx, page } = await adminSignIn(browser, surveyor);
    check('調査員の左の柱には「チャット」が無い', (await page.getByRole('link', { name: /^チャット/ }).count()) === 0);
    await page.goto(`${ADMIN}/chat`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    check('調査員はチャットの見張りに入れない', !new URL(page.url()).pathname.startsWith('/chat'), page.url());
    await ctx.close();
  }

  /* 締め出されていても読み書きできる */
  await sb(`/rest/v1/driver_profiles?user_id=eq.${a.userId}`, { method: 'PATCH', body: { trial_ends_at: '2026-01-01T00:00:00Z' } });
  await openRoom(aPage);
  check('締め出されていても「情報交換」を開ける', aPage.url().includes('/chat-room'), aPage.url());
  check('締め出されていても書く欄が出る', (await aPage.getByLabel('書き込む（500字まで）').count()) === 1);
  check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
  await aCtx.close();
  await bCtx.close();
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  for (const m of members) {
    const mine = await sb(`/rest/v1/chat_messages?select=id&user_id=eq.${m.userId}`);
    for (const r of mine.body ?? []) touched.push(r.id);
    await sb(`/rest/v1/chat_messages?user_id=eq.${m.userId}`, { method: 'DELETE' });
  }
  for (const s of staff) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${s.id}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${s.id}`, { method: 'DELETE' });
  }
  let gone = true;
  for (const m of members) gone = (await removeMember(conn, m)) && gone;
  const purged = await purgeAuditLogs(sb, [...touched, ...staff.map((s) => s.id), ...members.map((m) => m.userId)]);
  console.log(`\n検査用の会員・職員・書き込みを消した: ${gone ? 'はい' : 'いいえ（要確認）'}（操作履歴 ${purged} 件）`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
