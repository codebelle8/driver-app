/**
 * 管理画面での操作が、アプリに正しく現れるかを通しで見る。
 *
 *   node tools/test-admin-to-app.mjs
 *   node tools/test-admin-to-app.mjs --app https://app.kurumayosenavi.com \
 *                                    --admin https://admin.kurumayosenavi.com
 *
 * **なぜ要るか**
 *   管理画面の検査は「管理画面の中で保存できたか」までしか見ていない。
 *   アプリの検査は「アプリが持っているデータを正しく出せるか」しか
 *   見ていない。**その間が抜けている。**
 *
 *   実際、その間で事故が起きている。カテゴリを足しても絵柄の表に
 *   載っていなければアプリに出ない、という不具合（P-42）は、
 *   どちらの検査にも引っかからなかった。
 *
 * **操作は管理画面の画面から行う。**
 *   データベースを直に書き換えると、保存の経路を通らない。
 *   釦を押す。通るべき道を通す。
 *
 * **何を見るか**
 *   1. 下書きの施設は、アプリに**出ない**
 *   2. 「この施設を公開する」を押すと、アプリに**出る**
 *   3. 進入方法を直すと、アプリの案内が変わる
 *   4. 直したことが、アプリのお知らせに出る
 *   5. 「下書きに戻す」を押すと、アプリから**消える**
 *   6. カテゴリを足すと、アプリの絞り込みに出る
 *   7. カテゴリの名前を直すと、アプリの絞り込みも変わる
 *   8. 「アプリに出さない」にすると、絞り込みから消える
 *
 * **本番のデータには触れない。**
 *   検査用の施設・入口・カテゴリ・会員・職員をその都度作り、最後に消す。
 *   本番のカテゴリの表示順は、触る前に控えて書き戻す。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const NL = String.fromCharCode(10);

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const raw = (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined) ?? fallback;
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};
const APP = argOf('--app', 'https://app.kurumayosenavi.com');
const ADMIN = argOf('--admin', 'https://admin.kurumayosenavi.com');
const ADMIN_HOST = new URL(ADMIN).hostname;

const conn = connect();
const startedAt = new Date().toISOString();

const sb = async (path, { method = 'GET', body, prefer } = {}) => {
  const r = await fetch(`${conn.url}${path}`, {
    method,
    headers: { ...conn.svc, ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let b = null;
  try {
    b = t ? JSON.parse(t) : null;
  } catch {
    b = t;
  }
  return { ok: r.ok, status: r.status, body: b };
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

const stamp = String(Date.now()).slice(-6);
const STAFF_EMAIL = `a2a-staff-${stamp}@kurumayose.invalid`;
const STAFF_PASSWORD = 'Pw5zNt8qVr2xKd';

/** 検査用の施設。**よみがなで引く。** 名前に検査用の印を入れておく。 */
const FAC_NAME = `通し検査ホテル${stamp}`;
const FAC_KANA = `つうしけんさほてる${stamp}`;
const FAC_CODE = `HTL-97${stamp.slice(-2)}`;
const APPROACH_BEFORE = '正面ロータリーからお入りください。';
const APPROACH_AFTER = '工事のため、当面は東側の通用口からお入りください。';

const CAT_CODE = `a2a${stamp}`;
const CAT_NAME = `通し検査分類${stamp}`;
/*
  改名後の名前は、**元の名前を含めない。** 含めると「古い名前が
  残っていないこと」を確かめられない。前方一致で必ず当たってしまう。
*/
const CAT_RENAMED = `改称ぶんるい${stamp}`;

const made = {
  staffId: null,
  member: null,
  facilityId: null,
  entryId: null,
  photoId: null,
  categoryId: null,
};
let orderBefore = [];

/* --- アプリ側の道具 -------------------------------------------------------- */

/**
 * アプリに最新を取り込ませる。
 *
 * **開き直すだけでは足りない。** 前回の取り込みから1分経っていないと
 * 取りに行かない作りになっている（電波の悪い場所で待たせないため）。
 * 設定の「施設情報の取り込み」を押して、その場で取りに行かせる。
 */
async function resyncApp(page) {
  await page.goto(`${APP}/mypage`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await skipIntro(page);
  const row = page.getByText('施設情報の取り込み', { exact: false }).first();
  if (await row.count()) {
    await row.click({ timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(6000);
  }
}

/**
 * 探す画面で引く。出てきた件数と本文を返す。
 *
 * **本文に名前が入っているかで判じてはいけない。** 打った言葉が
 * そのまま画面に出る（「◯◯」0 件 / 全 193 件）ため、**1件も無くても
 * 名前は本文に含まれる。** 実際それで「出ない」の検査が通らなかった。
 * 件数の数字で判じる。
 */
async function searchApp(page, word) {
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await skipIntro(page);
  const box = page.getByPlaceholder('施設名・よみがな・住所').first();
  await box.fill(word);
  await page.waitForTimeout(3500);
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const m = body.match(/」\s*(\d+)\s*件\s*\/\s*全/);
  return { body, hits: m ? Number(m[1]) : null };
}

/**
 * 一覧に出ている行を押して、施設の詳細へ移る。
 *
 * 完全一致で拾う。部分一致だと、打った言葉のこだま（「◯◯」1 件）を
 * 押してしまい、何も起きない。
 */
async function openDetail(page) {
  await page.getByText(FAC_NAME, { exact: true }).first().click({ timeout: 20000 });
  await page.waitForTimeout(4500);
}

/** 探す画面の絞り込み（カテゴリのチップ）に出ている文字 */
async function chipsOf(page) {
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await skipIntro(page);
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
}

let browser = null;

try {
  console.log(`管理画面 → アプリ の通しの検査${NL}  アプリ    ${APP}${NL}  管理画面  ${ADMIN}${NL}`);

  /* --- 下ごしらえ --- */
  const cat = await sb('/rest/v1/categories?select=id&code=eq.hotel');
  const hotelId = cat.body?.[0]?.id;
  if (!hotelId) throw new Error('「ホテル」のカテゴリが見つかりません');

  const fac = await sb('/rest/v1/facilities', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      code: FAC_CODE,
      name: FAC_NAME,
      name_kana: FAC_KANA,
      category_id: hotelId,
      prefecture: '東京都',
      address_line: '通し検査1-1',
      status: 'draft',
    },
  });
  made.facilityId = fac.body?.[0]?.id;
  if (!made.facilityId) throw new Error(`施設を作れません: ${JSON.stringify(fac.body).slice(0, 200)}`);

  const ep = await sb('/rest/v1/entry_points', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      facility_id: made.facilityId,
      code: 'A',
      kind: 'dropoff',
      name: '正面車寄せ',
      approach_text: APPROACH_BEFORE,
      /*
        ナビ投入座標。**無いと公開できない。**
        validate_facility_for_publish() が「座標が未設定」で止める。
      */
      nav_lat: 35.6812,
      nav_lng: 139.7671,
      is_active: true,
    },
  });
  made.entryId = ep.body?.[0]?.id;
  if (!made.entryId) throw new Error(`入口を作れません: ${JSON.stringify(ep.body).slice(0, 200)}`);

  /*
    写真を1枚。**無いと公開できない。**
    「写真が1枚も無い進入口があります」で止まる。仮画像は警告どまりで、
    公開は妨げない。
  */
  const ph = await sb('/rest/v1/photos', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      entry_point_id: made.entryId,
      facility_id: made.facilityId,
      kind: 'dropoff',
      storage_path: `verify/a2a-${stamp}.jpg`,
      caption: '通し検査用',
      is_placeholder: true,
    },
  });
  made.photoId = ph.body?.[0]?.id ?? null;
  if (!made.photoId) throw new Error(`写真を作れません: ${JSON.stringify(ph.body).slice(0, 200)}`);

  /* 検査用の職員 */
  const stale = (await sb('/auth/v1/admin/users?page=1&per_page=200')).body?.users ?? [];
  for (const u of stale.filter((x) => x.email === STAFF_EMAIL)) {
    await sb(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
  }
  made.staffId = (
    await sb('/auth/v1/admin/users', {
      method: 'POST',
      body: { email: STAFF_EMAIL, password: STAFF_PASSWORD, email_confirm: true },
    })
  ).body?.id;
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: made.staffId, display_name: '通し検査・管理者', role: 'admin' },
  });

  made.member = await createMember(conn, 'a2a');
  console.log(`  用意  施設「${FAC_NAME}」（下書き）と、検査用の会員・職員を作りました`);

  browser = await chromium.launch();

  /* 管理画面 */
  const actx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1360, height: 1000 } });
  await actx.addCookies([{ name: 'kn_locale', value: 'ja', domain: ADMIN_HOST, path: '/' }]);
  const admin = await actx.newPage();
  await admin.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await admin.fill('input[name="email"]', STAFF_EMAIL);
  await admin.fill('input[name="password"]', STAFF_PASSWORD);
  await admin.click('button[type="submit"]');
  await admin.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });

  /* アプリ */
  const ctx = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 420, height: 900 },
    isMobile: true,
    hasTouch: true,
  });
  const app = await ctx.newPage();
  await signInOn(app, APP, made.member, { goto: '/mypage' });

  /* ===================================================================== */
  console.log(`${NL}--- 1. 下書きは出ない ---`);
  /* ===================================================================== */

  await resyncApp(app);
  let found = await searchApp(app, FAC_NAME);
  check('下書きの施設は、アプリの検索に出ない', found.hits === 0, `${found.hits} 件 / ${found.body.slice(0, 160)}`);

  /* ===================================================================== */
  console.log(`${NL}--- 2. 公開すると出る ---`);
  /* ===================================================================== */

  await admin.goto(`${ADMIN}/facilities/${made.facilityId}`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(2000);
  const pub = admin.getByRole('button', { name: /この施設を公開する/ });
  const why = (await admin.locator('body').innerText()).replace(/\s+/g, ' ');
  check(
    '「この施設を公開する」が押せる',
    (await pub.count()) > 0 && !(await pub.first().isDisabled()),
    why.slice(0, 300),
  );
  if (await pub.count()) {
    await pub.first().click();
    await admin.waitForTimeout(3500);
  }
  const after = (await sb(`/rest/v1/facilities?select=status&id=eq.${made.facilityId}`)).body?.[0];
  check('管理画面の状態が「公開中」になる', after?.status === 'published', `status=${after?.status}`);

  await resyncApp(app);
  found = await searchApp(app, FAC_NAME);
  check('公開した施設が、アプリの検索に出る', found.hits === 1, `${found.hits} 件 / ${found.body.slice(0, 160)}`);

  found = await searchApp(app, FAC_KANA);
  check('よみがなでも引ける', found.hits === 1, `${found.hits} 件 / ${found.body.slice(0, 160)}`);

  /* 詳細を開いて、進入方法が出ていること */
  /*
    **一覧の行を押す。** 打った言葉は画面にもそのまま出るため
    （「◯◯」1 件 / 全 194 件）、部分一致で拾うとそちらを押してしまい、
    詳細へ移らない。完全一致で行の見出しだけを拾う。
  */
  await openDetail(app);
  let detail = (await app.locator('body').innerText()).replace(/\s+/g, ' ');
  check('詳細に、いまの進入方法が出ている', detail.includes(APPROACH_BEFORE), detail.slice(0, 260));

  /* ===================================================================== */
  console.log(`${NL}--- 3. 直すと、アプリの案内が変わる ---`);
  /* ===================================================================== */

  await admin.goto(`${ADMIN}/facilities/${made.facilityId}`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(2000);
  const approach = admin.locator('textarea[name="approach_text"]').first();
  if (await approach.count()) {
    await approach.fill(APPROACH_AFTER);
    const save = admin.getByRole('button', { name: /入口 A を保存|入口Aを保存|を保存/ }).first();
    await save.click();
    await admin.waitForTimeout(3500);
  }
  const saved = (await sb(`/rest/v1/entry_points?select=approach_text&id=eq.${made.entryId}`)).body?.[0];
  check('管理画面で進入方法を直せる', saved?.approach_text === APPROACH_AFTER, `${saved?.approach_text}`);

  await resyncApp(app);
  await searchApp(app, FAC_NAME);
  await openDetail(app);
  detail = (await app.locator('body').innerText()).replace(/\s+/g, ' ');
  check('アプリの案内が、直した内容になる', detail.includes(APPROACH_AFTER), detail.slice(0, 260));
  check('古い案内は残らない', !detail.includes(APPROACH_BEFORE), detail.slice(0, 260));

  /* ===================================================================== */
  console.log(`${NL}--- 4. 直したことが、お知らせに出る ---`);
  /* ===================================================================== */

  await app.goto(`${APP}/notices`, { waitUntil: 'networkidle' });
  await app.waitForTimeout(4500);
  await skipIntro(app);
  const notices = (await app.locator('body').innerText()).replace(/\s+/g, ' ');
  check('お知らせに、その施設が出ている', notices.includes(FAC_NAME), notices.slice(0, 260));
  check(
    '何が変わったかまで書いてある',
    /進入方法|案内が変わりました|変わりました/.test(notices),
    notices.slice(0, 260),
  );

  /* ===================================================================== */
  console.log(`${NL}--- 5. 下書きに戻すと消える ---`);
  /* ===================================================================== */

  await admin.goto(`${ADMIN}/facilities/${made.facilityId}`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(2000);
  const unpub = admin.getByRole('button', { name: /下書きに戻す/ });
  check('「下書きに戻す」が押せる', (await unpub.count()) > 0);
  if (await unpub.count()) {
    await unpub.first().click();
    await admin.waitForTimeout(3500);
  }
  const back = (await sb(`/rest/v1/facilities?select=status&id=eq.${made.facilityId}`)).body?.[0];
  check('管理画面の状態が「下書き」に戻る', back?.status === 'draft', `status=${back?.status}`);

  await resyncApp(app);
  found = await searchApp(app, FAC_NAME);
  check(
    '下書きに戻した施設は、アプリの検索から消える',
    found.hits === 0,
    `${found.hits} 件 / ${found.body.slice(0, 160)}`,
  );

  /* ===================================================================== */
  console.log(`${NL}--- 6〜8. カテゴリ ---`);
  /* ===================================================================== */

  /* 触る前に、本番のカテゴリの表示順を控える */
  orderBefore = (await sb('/rest/v1/categories?select=id,sort_order&order=sort_order')).body ?? [];

  await admin.goto(`${ADMIN}/categories`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(2000);
  const addForm = admin.locator('form').filter({ has: admin.locator('input[name="code"]') }).first();
  await addForm.locator('input[name="name"]').fill(CAT_NAME);
  await addForm.locator('input[name="name_en"]').fill('Sweep Category');
  /* 接頭辞は英大文字のみ。数字を混ぜると弾かれる（画面の但し書きどおり）。 */
  await addForm.locator('input[name="code_prefix"]').fill('AZA');
  await addForm.locator('input[name="code"]').fill(CAT_CODE);
  await addForm.getByRole('button', { name: /カテゴリを追加/ }).click();
  await admin.waitForTimeout(3500);

  const catRow = (await sb(`/rest/v1/categories?select=*&code=eq.${CAT_CODE}`)).body?.[0];
  made.categoryId = catRow?.id ?? null;
  check('管理画面でカテゴリを追加できる', !!catRow, JSON.stringify(catRow ?? {}).slice(0, 160));

  await resyncApp(app);
  let chips = await chipsOf(app);
  check('足したカテゴリが、アプリの絞り込みに出る', chips.includes(CAT_NAME), chips.slice(0, 300));

  /* 名前を直す */
  await admin.goto(`${ADMIN}/categories`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(2000);
  await admin
    .locator('tr')
    .filter({ hasText: CAT_NAME })
    .first()
    .getByRole('button', { name: /^編集$/ })
    .click({ timeout: 20000 });
  await admin.waitForTimeout(1000);
  await admin.locator(`input[name="name"][value="${CAT_NAME}"]`).first().fill(CAT_RENAMED);
  await admin.getByRole('button', { name: /^保存$/ }).first().click();
  await admin.waitForTimeout(3500);

  await resyncApp(app);
  chips = await chipsOf(app);
  check('名前を直すと、アプリの絞り込みも変わる', chips.includes(CAT_RENAMED), chips.slice(0, 300));
  check('古い名前は残らない', !chips.includes(CAT_NAME), chips.slice(0, 300));

  /* アプリに出さない */
  await admin.goto(`${ADMIN}/categories`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(2000);
  await admin.locator('tr').filter({ hasText: CAT_RENAMED }).first().getByRole('button', { name: /^編集$/ }).click();
  await admin.waitForTimeout(1000);
  await admin.locator('input[name="is_active"]').first().uncheck().catch(() => undefined);
  await admin.getByRole('button', { name: /^保存$/ }).first().click();
  await admin.waitForTimeout(3500);

  await resyncApp(app);
  chips = await chipsOf(app);
  check('「アプリに出さない」にすると、絞り込みから消える', !chips.includes(CAT_RENAMED), chips.slice(0, 300));

  await actx.close();
  await ctx.close();
} finally {
  /* --- 後片付け --- */
  if (browser) await browser.close().catch(() => undefined);

  if (made.photoId) await sb(`/rest/v1/photos?id=eq.${made.photoId}`, { method: 'DELETE' });
  if (made.entryId) await sb(`/rest/v1/entry_points?id=eq.${made.entryId}`, { method: 'DELETE' });
  if (made.facilityId) await sb(`/rest/v1/facilities?id=eq.${made.facilityId}`, { method: 'DELETE' });
  if (made.categoryId) await sb(`/rest/v1/categories?id=eq.${made.categoryId}`, { method: 'DELETE' });
  if (made.member) await removeMember(conn, made.member);
  if (made.staffId) {
    await sb(`/rest/v1/admin_profiles?user_id=eq.${made.staffId}`, { method: 'DELETE' });
    await sb(`/auth/v1/admin/users/${made.staffId}`, { method: 'DELETE' });
  }

  /* 本番のカテゴリの表示順を戻す */
  let restored = 0;
  for (const c of orderBefore) {
    if (c.id === made.categoryId) continue;
    const now = (await sb(`/rest/v1/categories?select=sort_order&id=eq.${c.id}`)).body?.[0];
    if (!now || now.sort_order === c.sort_order) continue;
    await sb(`/rest/v1/categories?id=eq.${c.id}`, {
      method: 'PATCH',
      body: { sort_order: c.sort_order },
    });
    restored++;
  }
  if (restored > 0) console.log(`  片付け  カテゴリの表示順を ${restored} 件戻しました`);

  /*
    検査で作った行の記録を消す。**本番のカテゴリの id は渡さない。**
    渡すと、発注元ご自身が並べ替えた記録まで巻き添えになる。
  */
  const gone = await purgeAuditLogs(sb, [
    made.facilityId,
    made.entryId,
    made.photoId,
    made.categoryId,
    made.staffId,
    made.member?.userId,
  ]);

  /* 本番のカテゴリに付いた記録は、この検査が動いていた間のものだけ消す */
  let goneCat = 0;
  for (const c of orderBefore) {
    if (c.id === made.categoryId) continue;
    const r = await sb(
      `/rest/v1/audit_logs?record_id=eq.${c.id}&table_name=eq.categories&created_at=gte.${startedAt}`,
      { method: 'DELETE', prefer: 'return=representation' },
    );
    if (r.ok && Array.isArray(r.body)) goneCat += r.body.length;
  }

  console.log(`${NL}  片付け  検査用の施設・カテゴリ・会員・職員を消しました（操作履歴 ${gone + goneCat} 件）`);
  console.log(`${NL}  ${pass} 件が通り、${failures.length} 件が落ちました`);
  for (const f of failures) console.error(`    - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
