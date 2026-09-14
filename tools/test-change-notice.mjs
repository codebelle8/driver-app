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

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';
import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const raw = process.argv[2] ?? 'http://localhost:4190';
const BASE = raw.endsWith('/') ? raw.slice(0, -1) : raw;
const NL = String.fromCharCode(10);

const conn = connect();

const rest = async (path, { method = 'GET', body } = {}) => {
  const r = await fetch(`${conn.url}/rest/v1/${path}`, {
    method,
    /* 作ったものの id を受け取るため、常に中身を返させる */
    headers: { ...conn.svc, Prefer: 'return=representation' },
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
/** 検査のために作ったもの。最後に必ず消す。 */
const made = { categoryId: null, facilityId: null, entryPointId: null };

try {
  console.log(`直した内容がお知らせに出るかの検査: ${BASE}${NL}`);
  member = await createMember(conn, 'change');

  /*
    **発注元の施設は触らない。**

    以前は実在の施設を書き換えて元へ戻していた。発注元が同じ時間に
    編集していると、**こちらの「元へ戻す」がその編集を消してしまう。**
    検査のために自前の施設を作り、終わったら消す。

    公開状態にするのは、下書きだとアプリへ届かないため。数分のあいだ
    一覧に出るが、名前で検査用と分かるようにしてある。
  */
  const cat = await rest('categories', {
    method: 'POST',
    body: {
      code: `zz_check_${Date.now()}`,
      name: '（検査用・自動で消えます）',
      /* 接頭辞は表の中で一意。取り合わないよう毎回変える。 */
      code_prefix: 'Z' + Array.from({ length: 4 }, () =>
        String.fromCharCode(65 + Math.floor(Math.random() * 26)),
      ).join(''),
      sort_order: 999,
      is_active: true,
    },
  });
  made.categoryId = cat.body?.[0]?.id ?? null;
  if (!made.categoryId) throw new Error(`カテゴリを作れません: ${JSON.stringify(cat.body).slice(0, 200)}`);

  const fac = await rest('facilities', {
    method: 'POST',
    body: {
      /* 施設コードの形は決まっている（英大文字3 + ハイフン + 数字4） */
      code: `ZZZ-${String(Math.floor(1000 + Math.random() * 8999))}`,
      name: '検査用の施設（自動で消えます）',
      name_kana: 'けんさよう',
      category_id: made.categoryId,
      prefecture: '東京都',
      address_line: '検査町一丁目',
      status: 'published',
      sort_order: 9999,
    },
  });
  made.facilityId = fac.body?.[0]?.id ?? null;
  if (!made.facilityId) throw new Error(`施設を作れません: ${JSON.stringify(fac.body).slice(0, 200)}`);

  const ep = await rest('entry_points', {
    method: 'POST',
    body: {
      facility_id: made.facilityId,
      code: 'A',
      kind: 'dropoff',
      name: '検査用の車寄せ',
      approach_text: 'はじめの説明',
      nav_lat: 35.6812,
      nav_lng: 139.7671,
      sort_order: 1,
    },
  });
  made.entryPointId = ep.body?.[0]?.id ?? null;
  if (!made.entryPointId) throw new Error(`入口を作れません: ${JSON.stringify(ep.body).slice(0, 200)}`);

  const facName = '検査用の施設（自動で消えます）';
  console.log(`  用意  ${facName} / カテゴリ（検査用・自動で消えます）${NL}`);

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
  await rest(`entry_points?id=eq.${made.entryPointId}`, {
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
  check('施設の名前が出ている', Boolean(hit && hit.includes(facName)),
    String(hit).slice(0, 160));
  check('**何が変わったかまで出ている**（進入方法）',
    Boolean(hit && hit.includes('進入方法')), String(hit).slice(0, 160));

  const section = await page.evaluate(() =>
    document.body.innerText.includes('案内が変わった施設'),
  );
  check('「案内が変わった施設」の見出しが出る', section);

  // --- 高さ制限も直してみる ---------------------------------------------------
  await rest(`entry_points?id=eq.${made.entryPointId}`, {
    method: 'PATCH',
    body: { height_limit_cm: 210 },
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
  /*
    **自分の作った施設だけを数える。**

    発注元が同じ時間に別の施設を直していると、そちらのお知らせも並ぶ。
    全部を数えると、正しい状態を不具合として落とす（実際に一度そうなった）。
  */
  check('同じ施設が二重に並ばない',
    afterHeight.filter((x) => x.includes(facName) && x.includes('変わりました')).length === 1,
    JSON.stringify(afterHeight.filter((x) => x.includes(facName))).slice(0, 240));

  // --- 閉じている入口 ---------------------------------------------------------
  console.log(`${NL}--- 一時閉鎖中の入口 ---`);

  await page.goto(`${BASE}/facility/${made.facilityId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4500);
  await skipIntro(page);
  const epShown = await page.evaluate(() => document.body.innerText);
  check('はじめは、その入口が施設の画面に出ている',
    epShown.includes('検査用の車寄せ'), epShown.slice(0, 160));

  /*
    管理画面の「この入口を有効にする」を外したのと同じ状態にする。
    画面には「一時閉鎖中はチェックを外すとアプリに表示されません」と
    書いてある。**書いてあるとおりに隠れること**を確かめる。
  */
  await rest(`entry_points?id=eq.${made.entryPointId}`, {
    method: 'PATCH',
    body: { is_active: false },
  });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await skipIntro(page);
  await page.goto(`${BASE}/facility/${made.facilityId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await skipIntro(page);
  const epHidden = await page.evaluate(() => document.body.innerText);
  check('**「一時閉鎖中」にすると、施設の画面から消える**',
    !epHidden.includes('検査用の車寄せ'), epHidden.slice(0, 200));

  await rest(`entry_points?id=eq.${made.entryPointId}`, {
    method: 'PATCH',
    body: { is_active: true },
  });

  // --- カテゴリ ---------------------------------------------------------------
  console.log(`${NL}--- カテゴリ ---`);

  const catName = '（検査用・自動で消えます）';

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await skipIntro(page);
  const shownBefore = await page.evaluate(() => document.body.innerText);
  check('作ったカテゴリが、探す画面に出ている', shownBefore.includes(catName), catName);

  /*
    **名前を変える。**

    先に「無効」にしてから戻すと、端末からは「消えて、また出た」と
    見える。そのとき「増えました」と出るのは正しい挙動で、名前が
    変わったこととは別。順番を取り違えると、正しい挙動を不具合と
    読み違える（実際に一度そうなった）。
  */
  const renamedTo = '（検査用・名前を変えました）';
  await rest(`categories?id=eq.${made.categoryId}`, {
    method: 'PATCH',
    body: { name: renamedTo },
  });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await skipIntro(page);
  await page.goto(`${BASE}/notices`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const renamed = await page.evaluate(() => document.body.innerText);
  check('名前を変えると、お知らせに出る',
    renamed.includes('カテゴリの変更') && renamed.includes('名前が「'),
    renamed.slice(0, 240));
  check('新しい名前が出ている', renamed.includes(renamedTo), renamedTo);

  /* 「アプリに表示する」を外す */
  await rest(`categories?id=eq.${made.categoryId}`, {
    method: 'PATCH',
    body: { is_active: false },
  });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await skipIntro(page);
  const shownAfter = await page.evaluate(() => document.body.innerText);
  check('**「無効」にすると、探す画面から消える**',
    !shownAfter.includes(renamedTo), renamedTo);

  await page.goto(`${BASE}/notices`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const hidden = await page.evaluate(() => document.body.innerText);
  check('「無効」にしたことも、お知らせに出る',
    hidden.includes('表示されなくなりました'), hidden.slice(0, 240));

  await ctx.close();
} finally {
  console.log(`${NL}--- 後片付け ---`);
  if (browser) await browser.close();

  /*
    作った順と逆に消す。施設を消すと入口も一緒に消える（外部キー）が、
    念のため明示的に消してから施設を消す。
  */
  if (made.entryPointId) {
    await rest(`entry_points?id=eq.${made.entryPointId}`, { method: 'DELETE' });
  }
  if (made.facilityId) {
    await rest(`facilities?id=eq.${made.facilityId}`, { method: 'DELETE' });
  }
  if (made.categoryId) {
    await rest(`categories?id=eq.${made.categoryId}`, { method: 'DELETE' });
  }
  const leftFac = made.facilityId
    ? (await rest(`facilities?select=id&id=eq.${made.facilityId}`)).body
    : [];
  const leftCat = made.categoryId
    ? (await rest(`categories?select=id&id=eq.${made.categoryId}`)).body
    : [];
  check('検査で作った施設・カテゴリを消した',
    Array.isArray(leftFac) && leftFac.length === 0
      && Array.isArray(leftCat) && leftCat.length === 0,
    JSON.stringify({ leftFac, leftCat }));

  /*
    記録も消す。施設と入口の書き換えは、データベース側の仕掛けで
    自動的に操作履歴へ残る（facilities_audit / entry_points_audit）。
    検査のぶんを発注元の履歴に残さない。
  */
  const marks = [made.facilityId, made.entryPointId, made.categoryId].filter(Boolean);
  const gone = await purgeAuditLogs(
    async (path, o = {}) => {
      const r = await fetch(`${conn.url}${path}`, {
        method: o.method ?? 'GET',
        headers: { ...conn.svc, ...(o.prefer ? { Prefer: o.prefer } : {}) },
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
      });
      const t = await r.text();
      let b = null;
      try { b = t ? JSON.parse(t) : null; } catch { b = t; }
      return { ok: r.ok, body: b };
    },
    marks,
  );
  console.log(`  片付け  検査で残った操作履歴 ${gone} 件`);

  check('検査で作った会員を消した', await removeMember(conn, member));

  console.log(`${NL}合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
