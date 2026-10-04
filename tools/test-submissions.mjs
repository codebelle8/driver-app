/**
 * 情報提供（会員が施設の情報を送り、管理画面で審査する）を通しで確かめる。
 *
 *   node tools/test-submissions.mjs                                     手元（アプリ 4291・管理画面 3100）
 *   node tools/test-submissions.mjs https://kurumayose-navi.vercel.app https://kurumayose-navi-admin.vercel.app
 *
 * ご依頼（2026-10-05）。毎月の上位の方を翌月無料にする、その件数の元になる。
 * 件数に数えるのは「採用」だけなので、会員が自分で採用にできないこと、
 * 審査した人と日時が残ることを、画面と鍵（REST）の両方で見る。
 *
 * 見るもの
 *   アプリ
 *     1. 施設の画面に「情報を送る」があり、押すと送る画面が開く
 *     2. 施設の画面で選んでいた入口（B）が、初めから選ばれている
 *     3. 種類と内容がそろうまで「送る」を押せない
 *     4. 写真・いまいる場所を添えて送れる。送ると施設の画面へ戻る
 *     5. 送った行が「審査待ち」で残り、写真が置き場所にある
 *   鍵（会員の権限）
 *     6. 会員は自分の情報を「採用」に書き換えられない
 *     7. 会員は職員の覚え書きを読めない
 *     8. ほかの会員からは見えない
 *   管理画面
 *     9. 編集者の左の柱に「情報提供」と審査待ちの数が出る
 *    10. 一覧に、送った内容・写真・位置が出る
 *    11. 覚え書きを添えて「採用」できる。審査した人と日時が残り、操作履歴に載る
 *    12. 調査員には「情報提供」が出ず、開こうとしても入れない
 *
 * **検査用の会員・職員・情報を作り、最後に消す**（操作履歴も消す）。
 */
import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const APP = (process.argv[2] ?? 'http://localhost:4291').replace(/\/$/, '');
const ADMIN = (process.argv[3] ?? 'http://localhost:3100').replace(/\/$/, '');
const conn = connect();

/** 帝国ホテル東京（入口 A・B） */
const TWO = '8e1f2039-8b2d-4728-9ee1-6704ebbef86e';
/** 送ったときの位置（帝国ホテル東京の前の道） */
const HERE = { latitude: 35.67265, longitude: 139.75855 };
const STAMP = Date.now();
const BODY = `検査 ${STAMP}：B の入口は一本南の道から入るようになっています。`;
const NOTE = `検査の覚え書き ${STAMP}`;
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

/** service_role で REST を叩く */
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

/** 会員本人の鍵（ログインして得る） */
async function tokenOf(member) {
  const r = await fetch(`${conn.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: member.email, password: member.password }),
  });
  return (await r.json()).access_token;
}

/** 会員の鍵で REST を叩く */
async function asMember(token, path, { method = 'GET', body } = {}) {
  const r = await fetch(`${conn.url}${path}`, {
    method,
    headers: {
      apikey: conn.anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
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

/** 職員を作る */
async function makeStaff(role) {
  const email = `sub-${role}-${STAMP}@kurumayose.invalid`;
  const r = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email, password: PASSWORD, email_confirm: true },
  });
  const id = r.body?.id;
  if (!id) throw new Error(`職員を作れません: ${JSON.stringify(r.body).slice(0, 160)}`);
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: id, display_name: `情報提供検査・${role}`, role },
  });
  return { id, email };
}

/** 管理画面に入る */
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

let browser = null;
let member = null;
let other = null;
const staff = [];
const madeIds = [];

try {
  console.log(`情報提供の検査: アプリ ${APP} ／ 管理画面 ${ADMIN}\n`);
  member = await createMember(conn, 'submit');
  other = await createMember(conn, 'submit2');
  browser = await chromium.launch({ channel: 'msedge' });

  /* B の入口の id（照らし合わせ用） */
  const eps = await sb(`/rest/v1/entry_points?select=id,code&facility_id=eq.${TWO}&order=code`);
  const entryB = (eps.body ?? []).find((e) => e.code === 'B')?.id;

  /* =================================================================== */
  console.log('--- アプリ：送る ---');
  /* =================================================================== */
  {
    const ctx = await browser.newContext({
      viewport: { width: 420, height: 900 },
      geolocation: HERE,
      permissions: ['geolocation'],
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await signInOn(page, APP, member);
    await page.goto(`${APP}/facility/${TWO}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await skipIntro(page);
    await page.waitForTimeout(1500);

    /* 入口 B を選んでから開く */
    await page.getByRole('button', { name: /^B「/ }).click();
    await page.waitForTimeout(800);
    const link = page.getByRole('button', { name: '現地と違うところがあれば、情報を送る' });
    check('施設の画面に「情報を送る」がある', (await link.count()) === 1);
    await link.click();
    await page.waitForTimeout(2500);
    check('押すと送る画面が開く', page.url().includes('/submit'), page.url());
    check('どの施設かが出る', (await page.locator('body').innerText()).includes('帝国ホテル'));

    const chipB = page.getByRole('radio', { name: /^B / });
    check('施設の画面で選んでいた入口（B）が、初めから選ばれている',
      (await chipB.getAttribute('aria-checked')) === 'true',
      String(await chipB.getAttribute('aria-checked')));

    const send = page.getByRole('button', { name: '送る', exact: true });
    const disabled = async () => (await send.getAttribute('aria-disabled')) === 'true';
    check('種類も内容も無いうちは送れない', await disabled());
    await page.getByRole('radio', { name: '入口の位置が違う' }).click();
    check('種類だけでは送れない', await disabled());
    await page.getByLabel('内容').fill(BODY);
    check('種類と内容がそろうと送れる', !(await disabled()));

    /* 写真。ブラウザの中で小さな jpeg を作って渡す */
    const jpeg = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 480;
      const g = c.getContext('2d');
      g.fillStyle = '#2b6';
      g.fillRect(0, 0, 640, 480);
      g.fillStyle = '#fff';
      g.font = '48px sans-serif';
      g.fillText('ENTRANCE B', 140, 260);
      return c.toDataURL('image/jpeg', 0.8).split(',')[1];
    });
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      page.getByRole('button', { name: '写真を選ぶ' }).click(),
    ]);
    await chooser.setFiles({ name: 'entrance.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') });
    await page.waitForTimeout(1500);
    check('選んだ写真が並ぶ', (await page.getByRole('button', { name: '1枚目の写真を外す' }).count()) === 1);

    await page.getByRole('switch', { name: 'いまいる場所を添える' }).click();
    await page.waitForTimeout(2500);
    check('いまいる場所を添えられる', (await page.locator('body').innerText()).includes('位置を添えます'));

    await send.click();
    await page.waitForTimeout(5000);
    check('送ると施設の画面へ戻る', page.url().includes(`/facility/${TWO}`), page.url());
    check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
    await ctx.close();
  }

  /* 送った行 */
  const rows = await sb(
    `/rest/v1/submissions?select=*&user_id=eq.${member.userId}&order=created_at.desc`,
  );
  const row = Array.isArray(rows.body) ? rows.body[0] : null;
  if (row) madeIds.push(row.id);
  check('送った行が残る', !!row && row.body === BODY, JSON.stringify(rows.body).slice(0, 200));
  check('状態は「審査待ち」', row?.status === 'pending', String(row?.status));
  check('種類と入口が合っている', row?.kind === 'wrong_place' && row?.entry_point_id === entryB,
    JSON.stringify({ kind: row?.kind, entry: row?.entry_point_id, want: entryB }));
  check('位置が添えられている',
    row && Math.abs(row.lat - HERE.latitude) < 0.001 && Math.abs(row.lng - HERE.longitude) < 0.001,
    JSON.stringify({ lat: row?.lat, lng: row?.lng }));
  check('写真が1枚、本人の置き場所にある',
    row?.photo_paths?.length === 1 && row.photo_paths[0].startsWith(`${member.userId}/${row.id}_`),
    JSON.stringify(row?.photo_paths));
  const listed = await sb(`/storage/v1/object/list/submissions`, {
    method: 'POST',
    body: { prefix: member.userId, limit: 10 },
  });
  check('写真が置き場所に上がっている', Array.isArray(listed.body) && listed.body.length === 1,
    JSON.stringify(listed.body).slice(0, 200));

  /* =================================================================== */
  console.log('\n--- 鍵（会員の権限） ---');
  /* =================================================================== */
  {
    const token = await tokenOf(member);
    await asMember(token, `/rest/v1/submissions?id=eq.${row?.id}`, {
      method: 'PATCH',
      body: { status: 'accepted' },
    });
    const after = await sb(`/rest/v1/submissions?select=status&id=eq.${row?.id}`);
    check('会員は自分の情報を「採用」に書き換えられない', after.body?.[0]?.status === 'pending',
      JSON.stringify(after.body));

    const note = await asMember(token, `/rest/v1/submissions?select=review_note&id=eq.${row?.id}`);
    check('会員は職員の覚え書きを読めない', !note.ok, `${note.status} ${JSON.stringify(note.body).slice(0, 120)}`);

    const own = await asMember(token, `/rest/v1/submissions?select=id,status&id=eq.${row?.id}`);
    check('本人は自分の送ったものを読める', Array.isArray(own.body) && own.body.length === 1);

    const otherToken = await tokenOf(other);
    const peek = await asMember(otherToken, `/rest/v1/submissions?select=id&id=eq.${row?.id}`);
    check('ほかの会員からは見えない', Array.isArray(peek.body) && peek.body.length === 0, JSON.stringify(peek.body));
  }

  /* =================================================================== */
  console.log('\n--- 管理画面：審査 ---');
  /* =================================================================== */
  const editor = await makeStaff('editor');
  const surveyor = await makeStaff('surveyor');
  staff.push(editor, surveyor);
  {
    const { ctx, page } = await adminSignIn(browser, editor);
    const nav = page.getByRole('link', { name: /情報提供/ });
    check('編集者の左の柱に「情報提供」がある', (await nav.count()) >= 1);
    const navText = (await nav.first().innerText()).replace(/\s+/g, ' ');
    check('審査待ちの数が添えてある', /情報提供\s*\d+/.test(navText), navText);

    await page.goto(`${ADMIN}/submissions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const card = page.locator('div', { hasText: BODY }).filter({ has: page.locator('form') }).last();
    check('一覧に、送った内容が出る', (await card.count()) === 1);
    const img = card.locator('img').first();
    const loaded = (await img.count())
      ? await img.evaluate((el) => el.complete && el.naturalWidth > 0)
      : false;
    check('送られた写真が見える（非公開の置き場所から、期限付きの鍵で）', loaded);
    check('位置を地図で開ける', (await card.getByRole('link', { name: '送ったときの位置を地図で見る' }).count()) === 1);
    check('施設と入口が出る', (await card.innerText()).includes('帝国ホテル') && (await card.innerText()).includes('B'));

    await card.locator('textarea[name="review_note"]').fill(NOTE);
    await card.getByRole('button', { name: '採用', exact: true }).click();
    await page.waitForTimeout(3000);

    const reviewed = await sb(`/rest/v1/submissions?select=status,reviewed_by,reviewed_at,review_note&id=eq.${row?.id}`);
    const rv = reviewed.body?.[0];
    check('「採用」になる', rv?.status === 'accepted', JSON.stringify(rv));
    check('審査した人（編集者）と日時が残る', rv?.reviewed_by === editor.id && !!rv?.reviewed_at, JSON.stringify(rv));
    check('覚え書きが残る', rv?.review_note === NOTE, JSON.stringify(rv));
    const audit = await sb(
      `/rest/v1/audit_logs?select=action,actor_id&table_name=eq.submissions&record_id=eq.${row?.id}`,
    );
    check('審査が操作履歴に残る（操作した人つき）',
      Array.isArray(audit.body) && audit.body.some((a) => a.actor_id === editor.id),
      JSON.stringify(audit.body).slice(0, 200));

    await page.goto(`${ADMIN}/submissions?status=accepted`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    check('「採用」の一覧に移る', (await page.locator('body').innerText()).includes(BODY));
    await ctx.close();
  }
  {
    const { ctx, page } = await adminSignIn(browser, surveyor);
    check('調査員の左の柱には「情報提供」が無い', (await page.getByRole('link', { name: /情報提供/ }).count()) === 0);
    await page.goto(`${ADMIN}/submissions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    check('調査員は情報提供の画面に入れない', !new URL(page.url()).pathname.startsWith('/submissions'), page.url());
    await ctx.close();
  }
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);

  /* 写真 → 行 → 職員 → 会員 → 操作履歴（最後） */
  for (const m of [member, other].filter(Boolean)) {
    const listed = await sb(`/storage/v1/object/list/submissions`, {
      method: 'POST',
      body: { prefix: m.userId, limit: 100 },
    });
    const names = Array.isArray(listed.body) ? listed.body.map((f) => `${m.userId}/${f.name}`) : [];
    if (names.length) {
      await sb(`/storage/v1/object/submissions`, { method: 'DELETE', body: { prefixes: names } });
    }
    const mine = await sb(`/rest/v1/submissions?select=id&user_id=eq.${m.userId}`);
    for (const r of mine.body ?? []) madeIds.push(r.id);
    await sb(`/rest/v1/submissions?user_id=eq.${m.userId}`, { method: 'DELETE' });
  }
  for (const s of staff) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${s.id}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${s.id}`, { method: 'DELETE' });
  }
  const goneA = await removeMember(conn, member);
  const goneB = await removeMember(conn, other);
  const purged = await purgeAuditLogs(sb, [...madeIds, ...staff.map((s) => s.id)]);
  console.log(`\n検査用の会員・職員・情報を消した: ${goneA && goneB ? 'はい' : 'いいえ（要確認）'}（操作履歴 ${purged} 件）`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
