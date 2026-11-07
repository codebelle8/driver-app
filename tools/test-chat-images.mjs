/**
 * チャットの画像（書き込みに1枚添える。2026-11-08）を確かめる。
 *
 *   node tools/test-chat-images.mjs                                     手元（アプリ 4190・管理画面 3000）
 *   node tools/test-chat-images.mjs https://app.kurumayosenavi.com https://admin.kurumayosenavi.com
 *
 * 見るもの
 *   アプリ
 *     1. 書く欄の左に「画像を添える」。選ぶと見本が出て、× で外せる
 *     2. 文と画像・画像だけ、を書ける。画像は長いほうの辺 1280px の jpeg に縮まり、
 *        写真に埋め込まれた付帯情報（撮影位置など）は落ちる
 *     3. ほかの会員にも画像が見え、押すと画面いっぱいに広がる
 *     4. スマホの幅でも、画像が画面からはみ出さない
 *     5. 自分の書き込みを消すと、画像も置き場所から消える
 *   置き場所（非公開）
 *     6. ログインしていない人は読めない。運営が隠すと、ほかの会員も読めなくなる
 *   管理画面
 *     7. 画像の書き込みが「要確認」に「画像（目で確認）」の旗つきで出て、画像が見える
 *     8. 非表示にすると、会員の画面から消える
 *     9. 開いたときに、消えた書き込みの画像の控えを片付ける
 *
 * **データベースの更新（20261108000001_chat_images.sql）のあとで回す。**
 * 検査用の会員・職員・書き込み・画像を作り、最後に消す（操作履歴も消す）。
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright';
import sharp from 'sharp';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const APP = (process.argv[2] ?? 'http://localhost:4190').replace(/\/$/, '');
const ADMIN = (process.argv[3] ?? 'http://localhost:3000').replace(/\/$/, '');
const conn = connect();
const STAMP = String(Date.now()).slice(-6);
const NAME_A = `検査画像A${STAMP}`;
const POST_WITH = `検査 ${STAMP}：B 入口の写真です`;
const PASSWORD = 'Hq7wTz3nRv9xLm';
const BUCKET = 'chat-images';

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

/** その鍵で、画像の期限つき URL をもらえるか */
async function canSign(path, token) {
  const r = await fetch(`${conn.url}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: conn.anon, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  return r.ok;
}

/** 置き場所の画像を service_role で読む（無ければ null） */
async function download(path) {
  const r = await fetch(`${conn.url}/storage/v1/object/${BUCKET}/${path}`, { headers: conn.svc });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}

async function makeStaff(role) {
  const email = `chatimg-${role}-${STAMP}@kurumayose.invalid`;
  const r = await sb('/auth/v1/admin/users', { method: 'POST', body: { email, password: PASSWORD, email_confirm: true } });
  const id = r.body?.id;
  if (!id) throw new Error(`職員を作れません: ${JSON.stringify(r.body).slice(0, 160)}`);
  await sb('/rest/v1/admin_profiles', { method: 'POST', body: { user_id: id, display_name: `画像検査・${role}`, role } });
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

async function openRoom(page) {
  await page.goto(`${APP}/chat-room`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await skipIntro(page);
  await page.waitForTimeout(500);
}

/** 画像を選ぶ（ファイルを選ぶ枠に、用意した画像を渡す） */
async function attach(page, file) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '画像を添える' }).click(),
  ]);
  await chooser.setFiles(file);
  await page.waitForTimeout(1500);
}

/** 画面の中の画像が、読み込まれて描かれているか */
const loaded = (loc) =>
  loc.evaluate((el) => {
    const img = el.querySelector('img') ?? (el.tagName === 'IMG' ? el : null);
    return !!img && img.complete && img.naturalWidth > 0;
  });

const rowsOf = async (userId) =>
  (await sb(`/rest/v1/chat_messages?select=id,body,image_path,image_width,image_height,flags,hidden_at&user_id=eq.${userId}&order=created_at`))
    .body ?? [];

let browser = null;
const members = [];
const staff = [];
const touched = [];

try {
  console.log(`チャットの画像の検査: アプリ ${APP} ／ 管理画面 ${ADMIN}\n`);

  /* 検査用の画像。横長 2000×1500 の jpeg に、撮影位置などの付帯情報（EXIF）を入れておく */
  const dir = mkdtempSync(join(tmpdir(), 'kn-chatimg-'));
  const photo = join(dir, 'entrance.jpg');
  writeFileSync(
    photo,
    await sharp({ create: { width: 2000, height: 1500, channels: 3, background: { r: 40, g: 120, b: 90 } } })
      .composite([{ input: Buffer.from('<svg width="2000" height="1500"><rect x="300" y="300" width="1400" height="900" fill="#fff"/></svg>'), top: 0, left: 0 }])
      .withExif({ IFD0: { Copyright: 'kurumayose-test', ImageDescription: 'secret-location-35.6,139.7' } })
      .jpeg()
      .toBuffer(),
  );
  const tall = join(dir, 'tall.png');
  writeFileSync(tall, await sharp({ create: { width: 600, height: 1200, channels: 3, background: { r: 200, g: 80, b: 40 } } }).png().toBuffer());

  const a = await createMember(conn, 'chatimg-a');
  const b = await createMember(conn, 'chatimg-b');
  members.push(a, b);
  await sb(`/rest/v1/driver_profiles?user_id=eq.${a.userId}`, { method: 'PATCH', body: { display_name: NAME_A } });
  browser = await chromium.launch({ channel: 'msedge' });

  /* =================================================================== */
  console.log('--- アプリ：画像を添えて書く ---');
  /* =================================================================== */
  const aCtx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const aPage = await aCtx.newPage();
  const errors = [];
  aPage.on('pageerror', (e) => errors.push(e.message));
  await signInOn(aPage, APP, a);
  await openRoom(aPage);

  check('ルールに「顔や車のナンバーが写った画像」が入っている',
    (await aPage.locator('body').innerText()).includes('顔や車のナンバーが写った画像'));
  check('書く欄の左に「画像を添える」がある', (await aPage.getByRole('button', { name: '画像を添える' }).count()) === 1);

  const send = aPage.getByRole('button', { name: '送る', exact: true });
  await attach(aPage, photo);
  check('選ぶと、送る前の見本が出る', (await aPage.getByTestId('chat-image-preview').count()) === 1);
  await aPage.getByRole('button', { name: '添えた画像を外す' }).click();
  await aPage.waitForTimeout(500);
  check('× で見本を外せる', (await aPage.getByTestId('chat-image-preview').count()) === 0);
  check('文も画像も無いときは送れない', await send.isDisabled());

  await attach(aPage, photo);
  await aPage.getByLabel('書き込む（500字まで）').fill(POST_WITH);
  await send.click();
  await aPage.waitForTimeout(5000);
  const withMsg = aPage.getByTestId('chat-message').filter({ hasText: POST_WITH });
  check('文と画像を書ける（自分の画面に画像が出る）',
    (await withMsg.count()) === 1 && (await withMsg.getByTestId('chat-image').count()) === 1 && (await loaded(withMsg.getByTestId('chat-image'))));
  check('送ると見本が消える', (await aPage.getByTestId('chat-image-preview').count()) === 0);

  let rows = await rowsOf(a.userId);
  const rowWith = rows.find((r) => r.body === POST_WITH);
  if (rowWith) touched.push(rowWith.id);
  check('道筋は <自分のid>/<書き込みのid>.jpg', rowWith?.image_path === `${a.userId}/${rowWith?.id}.jpg`, JSON.stringify(rowWith));
  check('長いほうの辺を 1280px に縮め、縦横の比は保つ（2000×1500 → 1280×960）',
    rowWith?.image_width === 1280 && rowWith?.image_height === 960, JSON.stringify(rowWith));
  check('画像には「要確認」の旗（image）が立つ', (rowWith?.flags ?? []).includes('image'), JSON.stringify(rowWith?.flags));
  const file = rowWith ? await download(rowWith.image_path) : null;
  const meta = file ? await sharp(file).metadata() : null;
  check('置き場所には jpeg で入り、300KB に収まる',
    !!file && meta?.format === 'jpeg' && file.length < 300 * 1024, `${file?.length} bytes ${meta?.format}`);
  check('写真に埋め込まれた付帯情報（EXIF）は落ちる',
    !!file && !meta?.exif && !file.includes(Buffer.from('secret-location')), meta?.exif ? 'exif あり' : '');

  /* 画像だけ（縦長の png） */
  await attach(aPage, tall);
  await send.click();
  await aPage.waitForTimeout(5000);
  rows = await rowsOf(a.userId);
  const rowOnly = rows.find((r) => r.body === '' && r.image_path);
  if (rowOnly) touched.push(rowOnly.id);
  check('画像だけ（文が空）でも書ける。png も jpeg にそろう（600×1200 はそのまま）',
    rowOnly?.image_width === 600 && rowOnly?.image_height === 1200 && rowOnly.image_path.endsWith('.jpg'), JSON.stringify(rowOnly));

  /* チャットの一覧で、最後の書き込みが画像だけなら「（画像）」 */
  await aPage.goto(`${APP}/chat`, { waitUntil: 'networkidle' });
  await aPage.waitForTimeout(3000);
  check('チャットの一覧で、画像だけの書き込みは「（画像）」と出る',
    (await aPage.locator('body').innerText()).includes('あなた：（画像）'));

  /* =================================================================== */
  console.log('\n--- アプリ：ほかの会員 ---');
  /* =================================================================== */
  const bCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const bPage = await bCtx.newPage();
  await signInOn(bPage, APP, b);
  await openRoom(bPage);
  await bPage.waitForTimeout(2000);
  const seen = bPage.getByTestId('chat-message').filter({ hasText: POST_WITH });
  check('ほかの会員にも、画像が見える', (await seen.count()) === 1 && (await loaded(seen.getByTestId('chat-image'))));
  const images = bPage.getByTestId('chat-image');
  let inside = (await images.count()) >= 2;
  for (let i = 0; i < (await images.count()); i++) {
    const box = await images.nth(i).boundingBox();
    if (!box || box.x < 0 || box.x + box.width > 375) inside = false;
  }
  check('スマホの幅（375px）でも、画像が画面からはみ出さない', inside);

  await seen.getByTestId('chat-image').click();
  await bPage.waitForTimeout(1200);
  const close = bPage.getByRole('button', { name: '閉じる' });
  check('押すと画面いっぱいに広がり、「閉じる」がある', (await close.count()) >= 1);
  await close.last().click();
  await bPage.waitForTimeout(800);
  check('「閉じる」で元の画面に戻る', (await bPage.getByLabel('書き込む（500字まで）').count()) === 1);

  /* =================================================================== */
  console.log('\n--- 置き場所（非公開） ---');
  /* =================================================================== */
  const tokenB = await tokenOf(b);
  check('ほかの会員は、書き込みの画像の URL をもらえる', !!rowWith && (await canSign(rowWith.image_path, tokenB)));
  check('ログインしていない人は、もらえない', !!rowWith && !(await canSign(rowWith.image_path, null)));
  const pub = await fetch(`${conn.url}/storage/v1/object/public/${BUCKET}/${rowWith?.image_path}`);
  check('公開の URL では開けない', !pub.ok, String(pub.status));

  /* =================================================================== */
  console.log('\n--- 管理画面 ---');
  /* =================================================================== */
  const editor = await makeStaff('editor');
  staff.push(editor);
  {
    const { ctx, page } = await adminSignIn(browser, editor);
    await page.goto(`${ADMIN}/chat?tab=flags`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const card = page.getByTestId('admin-chat-message').filter({ hasText: POST_WITH });
    check('「要確認」に、画像の旗つきで出る',
      (await card.count()) === 1 && (await card.innerText()).includes('画像（目で確認）'));
    check('職員には画像が見える', (await card.getByTestId('admin-chat-image').count()) === 1 && (await loaded(card.getByTestId('admin-chat-image'))));
    await card.getByRole('button', { name: '非表示にする' }).click();
    await page.waitForTimeout(3000);
    const after = (await rowsOf(a.userId)).find((r) => r.id === rowWith?.id);
    check('非表示にできる', !!after?.hidden_at, JSON.stringify(after));
    check('隠した書き込みの画像は、ほかの会員には URL が出ない', !!rowWith && !(await canSign(rowWith.image_path, tokenB)));
    const tokenA = await tokenOf(a);
    check('書いた本人は、自分の画像をいつでも読める', !!rowWith && (await canSign(rowWith.image_path, tokenA)));

    await openRoom(bPage);
    check('非表示にした書き込みは、会員の画面から消える',
      (await bPage.getByTestId('chat-message').filter({ hasText: POST_WITH }).count()) === 0);

    /* 本人が画像だけの書き込みを消す → 置き場所からも消える・控えは管理画面が片付ける */
    await openRoom(aPage);
    const own = aPage.getByTestId('chat-message').filter({ has: aPage.getByTestId('chat-image') }).last();
    await own.getByRole('button', { name: '削除' }).click();
    await aPage.waitForTimeout(800);
    check('消す前の確認に「（画像）」と出る', (await aPage.getByTestId('confirm-dialog').innerText()).includes('（画像）'));
    await aPage.getByTestId('confirm-accept').click();
    await aPage.waitForTimeout(3000);
    const gone = !(await rowsOf(a.userId)).some((r) => r.id === rowOnly?.id);
    check('自分の書き込みを消せる', gone);
    check('消すと、画像も置き場所から消える', !!rowOnly && !(await download(rowOnly.image_path)));
    const trashed = await sb(`/rest/v1/chat_image_trash?select=path&path=eq.${rowOnly?.image_path}`);
    check('データベースが、消す画像の控えを残す', trashed.body?.length === 1, JSON.stringify(trashed.body));
    await page.goto(`${ADMIN}/chat`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const left = await sb(`/rest/v1/chat_image_trash?select=path&path=eq.${rowOnly?.image_path}`);
    check('管理画面を開くと、控えが片付く', Array.isArray(left.body) && left.body.length === 0, JSON.stringify(left.body));
    await ctx.close();
  }

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
  /* 置き場所の画像と、消す画像の控えは removeMember が片付ける */
  let gone = true;
  for (const m of members) gone = (await removeMember(conn, m)) && gone;
  const purged = await purgeAuditLogs(sb, [...touched, ...staff.map((s) => s.id), ...members.map((m) => m.userId)]);
  console.log(`\n検査用の会員・職員・書き込み・画像を消した: ${gone ? 'はい' : 'いいえ（要確認）'}（操作履歴 ${purged} 件）`);
  console.log(`合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
