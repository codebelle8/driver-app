/**
 * 管理画面の削除に、確かめが入っているかを見る。
 *
 *   node tools/test-delete-confirm.mjs                       本番を検査
 *   node tools/test-delete-confirm.mjs http://localhost:3000 手元を検査
 *
 * 見るのは4点。
 *   1. 押したとき確かめが出るか（出ないなら、取り消せない操作が素通りする）
 *   2. それがブラウザの confirm ではなく、画面の中の札であること
 *   3. 「キャンセル」で本当に残ること
 *   4. 「削除」で本当に消えること
 *
 * 4 を省くと、確かめを挟んだ結果として本来の削除まで止まって
 * しまったことに気づけない。管理画面の削除は form の action が
 * 受け持っており、押した側のボタンが伝わらないと動かなくなる。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';

const BASE = (process.argv[2] ?? 'https://kurumayose-navi-admin.vercel.app').replace(/\/$/, '');

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv('admin/.env.local');
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const EMAIL = 'ui-delete-check@kurumayose.invalid';
const PASSWORD = 'Rk7pWn2xCe5vQa';

/*
  消す相手のアカウント。

  自分自身の行には削除ボタンが出ない（誤って自分を消せないように
  してある）ため、検査には別のアカウントが要る。
*/
const TARGET_EMAIL = 'ui-delete-target@kurumayose.invalid';
const TARGET_NAME = '削除検証用_対象';

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

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SB}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

const EP_NAME = '検証用_正面車寄せ';
const CAUTION_BODY = '検証用の注意事項。20文字を超える長さにして、末尾が省略されることも見る。';
const PHOTO_CAPTION = '検証用の写真の説明';
const CATEGORY_NAME = '検証用カテゴリ';

/** 触った行の id。後片付けで操作履歴を消すのに使う。 */
const touched = [];

let userId = null;
let targetId = null;
let facilityId = null;
let categoryId2 = null;
let browser = null;

try {
  console.log(`削除の確かめの検査: ${BASE}\n`);

  // --- 検証用の管理者と施設を作る ---------------------------------------------
  const users = await sb('/auth/v1/admin/users?page=1&per_page=200');
  const stale = (users.body?.users ?? []).find((u) => u.email === EMAIL);
  if (stale) await sb(`/auth/v1/admin/users/${stale.id}`, { method: 'DELETE' });

  const created = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD, email_confirm: true },
  });
  userId = created.body?.id;
  if (!userId) throw new Error(`アカウント作成に失敗: ${JSON.stringify(created.body)}`);

  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: userId, display_name: '削除検証用', role: 'admin' },
  });

  const staleTarget = (users.body?.users ?? []).find((u) => u.email === TARGET_EMAIL);
  if (staleTarget) await sb(`/auth/v1/admin/users/${staleTarget.id}`, { method: 'DELETE' });
  const target = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: TARGET_EMAIL, password: PASSWORD, email_confirm: true },
  });
  targetId = target.body?.id;
  if (!targetId) throw new Error(`対象アカウント作成に失敗: ${JSON.stringify(target.body)}`);
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: targetId, display_name: TARGET_NAME, role: 'surveyor' },
  });

  const cat = await sb('/rest/v1/categories?select=id&code=eq.hotel');
  const categoryId = cat.body?.[0]?.id;

  const fac = await sb('/rest/v1/facilities', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      code: 'HTL-9803',
      name: '削除検証用_下書き',
      name_kana: 'さくじょけんしょうようしたがき',
      category_id: categoryId,
      prefecture: '東京都',
      address_line: '削除検証1-1',
      status: 'draft',
    },
  });
  facilityId = fac.body?.[0]?.id;
  touched.push(facilityId);
  if (!facilityId) throw new Error(`施設作成に失敗: ${JSON.stringify(fac.body)}`);

  const ep = await sb('/rest/v1/entry_points', {
    method: 'POST',
    prefer: 'return=representation',
    body: { facility_id: facilityId, code: 'A', kind: 'dropoff', name: EP_NAME },
  });
  const epId = ep.body?.[0]?.id;
  touched.push(epId);
  if (!epId) throw new Error(`入口作成に失敗: ${JSON.stringify(ep.body)}`);

  const ca = await sb('/rest/v1/cautions', {
    method: 'POST',
    prefer: 'return=representation',
    body: { entry_point_id: epId, body: CAUTION_BODY },
  });
  if (!ca.body?.[0]?.id) throw new Error(`注意事項の作成に失敗: ${JSON.stringify(ca.body)}`);
  touched.push(ca.body[0].id);

  const ph = await sb('/rest/v1/photos', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      entry_point_id: epId,
      facility_id: facilityId,
      kind: 'dropoff',
      storage_path: 'verify/delete-confirm.jpg',
      caption: PHOTO_CAPTION,
    },
  });
  if (!ph.body?.[0]?.id) throw new Error(`写真の作成に失敗: ${JSON.stringify(ph.body)}`);
  touched.push(ph.body[0].id);

  // 施設が紐づいていないカテゴリ。紐づいていると削除ボタンが押せない。
  const cat2 = await sb('/rest/v1/categories', {
    method: 'POST',
    prefer: 'return=representation',
    body: { code: 'verifycat', name: CATEGORY_NAME, code_prefix: 'VFY', sort_order: 900 },
  });
  categoryId2 = cat2.body?.[0]?.id;
  touched.push(categoryId2);
  if (!categoryId2) throw new Error(`カテゴリ作成に失敗: ${JSON.stringify(cat2.body)}`);

  // --- ログイン ---------------------------------------------------------------
  browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  // ブラウザの confirm / alert が出たら記録する。
  // 既定では playwright が黙って打ち消すため、出たこと自体に気づけない。
  let nativeDialogs = [];
  page.on('dialog', async (d) => {
    nativeDialogs.push(`${d.type()}: ${d.message()}`);
    await d.dismiss();
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });
  check('管理者としてログインできる', true);

  const card = page.getByTestId('confirm-card');
  const cancel = page.getByTestId('confirm-cancel');
  const accept = page.getByTestId('confirm-accept');

  const rows = async (table, query) =>
    (await sb(`/rest/v1/${table}?select=id&${query}`)).body ?? [];

  /**
   * 1か所ぶんを通しで見る。
   *
   * @param name    見出しに出す場所の名前
   * @param goto    その画面を開く
   * @param button  削除ボタンを指す locator を返す
   * @param expect  札の本文に入っているはずの文字
   * @param count   いま残っている件数を数える
   */
  async function run({ name, goto, button, expect, count }) {
    console.log(`\n--- ${name} ---`);
    await goto();
    nativeDialogs = [];

    const b = button();
    check(`${name}: 削除ボタンが出ている`, (await b.count()) > 0, `${await b.count()}個`);
    if ((await b.count()) === 0) return;

    await b.first().click();
    await page.waitForTimeout(800);

    check(
      `${name}: ブラウザの confirm を使っていない`,
      nativeDialogs.length === 0,
      nativeDialogs.join(' / '),
    );
    check(`${name}: 画面の中に札が出る`, (await card.count()) === 1);

    const text = (await card.count()) ? await card.innerText() : '';
    check(`${name}: 見出しが「削除しますか？」`, text.includes('削除しますか？'), text);
    check(`${name}: 何が消えるかが書かれている`, text.includes(expect), text);
    check(`${name}: 元に戻せない旨が書かれている`, text.includes('元には戻せません'), text);

    // --- やめる -------------------------------------------------------------
    await cancel.click();
    await page.waitForTimeout(600);
    check(`${name}: 「キャンセル」で札が閉じる`, (await card.count()) === 0);
    check(`${name}: 「キャンセル」で残っている`, (await count()) === 1, `残り${await count()}件`);

    // --- Esc ----------------------------------------------------------------
    await button().first().click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    check(`${name}: Esc でやめられる`, (await card.count()) === 0);
    check(`${name}: Esc でも残っている`, (await count()) === 1);

    // --- 消す ---------------------------------------------------------------
    await button().first().click();
    await page.waitForTimeout(500);
    await accept.click();
    await page.waitForTimeout(2500);
    check(`${name}: 「削除」で消える`, (await count()) === 0, `残り${await count()}件`);
  }

  const facility = async () => {
    await page.goto(`${BASE}/facilities/${facilityId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
  };

  await run({
    name: '注意事項',
    goto: facility,
    button: () =>
      page.locator('li', { hasText: CAUTION_BODY.slice(0, 12) }).locator('button', {
        hasText: /^削除$/,
      }),
    expect: CAUTION_BODY.slice(0, 20),
    count: async () =>
      (await rows('cautions', `body=eq.${encodeURIComponent(CAUTION_BODY)}`)).length,
  });

  // 画像の中身はいらない。storage に置かなくても一覧には並ぶ。
  await run({
    name: '写真',
    goto: facility,
    button: () =>
      page.locator('li', { hasText: PHOTO_CAPTION }).locator('button', { hasText: /^削除$/ }),
    expect: PHOTO_CAPTION,
    count: async () => (await rows('photos', `caption=eq.${encodeURIComponent(PHOTO_CAPTION)}`)).length,
  });

  await run({
    name: '入口・車寄せ',
    goto: facility,
    button: () => page.getByRole('button', { name: 'この入口を削除' }),
    expect: EP_NAME,
    count: async () => (await rows('entry_points', `facility_id=eq.${facilityId}`)).length,
  });

  await run({
    name: 'カテゴリ',
    goto: async () => {
      await page.goto(`${BASE}/categories`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      // 行ごとに「編集」で開く作りなので、まず開く
      await page
        .locator('tr', { hasText: CATEGORY_NAME })
        .getByRole('button', { name: '編集' })
        .click();
      await page.waitForTimeout(600);
    },
    button: () => page.locator('tr').getByRole('button', { name: '削除', exact: true }),
    expect: 'このカテゴリを削除します',
    count: async () => (await rows('categories', `id=eq.${categoryId2}`)).length,
  });

  // --- アカウント ---------------------------------------------------------------
  //
  // 消してしまうとログイン中の自分が消えかねないため、ここは
  // 札が出るところまでを見る。文面が長く、以前は confirm の中で
  // 途中から読めなくなっていた箇所でもある。
  console.log('\n--- アカウント ---');
  await page.goto(`${BASE}/accounts`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  nativeDialogs = [];
  const accountDelete = page
    .locator('tr', { hasText: TARGET_NAME })
    .getByRole('button', { name: '削除' });
  check('アカウントの削除ボタンが出ている', (await accountDelete.count()) > 0);
  if (await accountDelete.count()) {
    await accountDelete.first().click();
    await page.waitForTimeout(800);
    check(
      'アカウント: ブラウザの confirm を使っていない',
      nativeDialogs.length === 0,
      nativeDialogs.join(' / '),
    );
    check('アカウント: 画面の中に札が出る', (await card.count()) === 1);
    const text = (await card.count()) ? await card.innerText() : '';
    check('アカウント: 誰のものか書かれている', text.includes(TARGET_NAME), text);
    check(
      'アカウント: 「停止する」の案内まで読める',
      text.includes('「停止する」をお使いください'),
      text,
    );
    await cancel.click();
    await page.waitForTimeout(600);
    check('アカウント: 「キャンセル」で札が閉じる', (await card.count()) === 0);
  }
} finally {
  console.log('\n--- 後片付け ---');
  if (browser) await browser.close();

  if (facilityId) {
    const r = await sb(`/rest/v1/facilities?id=eq.${facilityId}`, { method: 'DELETE' });
    console.log(`  ${r.ok ? '削除' : '削除失敗'}  検証用の施設`);
  }
  if (categoryId2) {
    const r = await sb(`/rest/v1/categories?id=eq.${categoryId2}`, { method: 'DELETE' });
    console.log(`  ${r.ok ? '削除' : '既に無い'}  検証用のカテゴリ`);
  }
  for (const [label, id] of [
    ['検証用のアカウント', userId],
    ['対象のアカウント', targetId],
  ]) {
    if (!id) continue;
    await sb(`/rest/v1/audit_logs?actor_id=eq.${id}`, { method: 'DELETE' });
    await sb(`/rest/v1/admin_profiles?user_id=eq.${id}`, { method: 'DELETE' });
    const r = await sb(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
    console.log(`  ${r.ok ? '削除' : '削除失敗'}  ${label}`);
  }

  /*
    操作履歴はいちばん最後に消す。
    先に消すと、上の削除がまた新しい行を作る。
  */
  touched.push(userId, targetId, facilityId, categoryId2);
  const purged = await purgeAuditLogs(sb, touched);
  console.log(`  削除    検証で残した操作履歴 ${purged} 件`);

  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
