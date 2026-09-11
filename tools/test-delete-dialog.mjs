/**
 * アプリ側の削除が、画面の中の札で尋ねているかを見る。
 *
 *   node tools/test-delete-dialog.mjs                        手元の Metro (8081)
 *   node tools/test-delete-dialog.mjs http://localhost:8081
 *
 * 見るのは4点。
 *   1. ブラウザの confirm を使っていないこと
 *      （使っていると playwright に dialog として届く）
 *   2. 画面の中に札が出て、「やめる」で残ること
 *   3. 決める側を押すと本当に消えること
 *   4. 1件・複数・全部の3通りとも同じ札を通ること
 *
 * 履歴とお気に入りの両方で見る。片方だけ直っている状態は、
 * 利用者から見ると直っていないのと変わらない。
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn } from './lib/member.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:4190').replace(/\/$/, '');
const conn = connect();

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

/** 画面ごとの言い回し。お気に入りは「外す」、履歴は「削除」。 */
const SCREENS = [
  {
    name: 'お気に入り',
    path: '/favorites',
    key: 'kn_favorites',
    row: /をお気に入りから外す$/,
    selectMode: '複数を選んで外す',
    bulk: /^選んだ \d+ 件を外す$/,
    clearAll: 'お気に入りをすべて解除',
  },
  {
    name: '履歴',
    path: '/history',
    key: 'kn_history',
    row: /を履歴から削除$/,
    selectMode: '複数を選んで削除する',
    bulk: /^選んだ \d+ 件を削除$/,
    clearAll: '履歴をすべて削除',
  },
];

let browser = null;
let member = null;

try {
  console.log(`削除の札の検査: ${BASE}\n`);

  browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // ブラウザの confirm / alert が出たら記録する。
  // 既定では playwright が黙って打ち消すため、出たこと自体に気づけない。
  let nativeDialogs = [];
  page.on('dialog', async (d) => {
    nativeDialogs.push(`${d.type()}: ${d.message()}`);
    await d.dismiss();
  });

  /**
   * 導入映像を飛ばす。
   * 画面いっぱいに重なるため、これが残っていると何も押せない。
   */
  const skipIntro = async () => {
    const skip = page.getByRole('button', { name: '導入を飛ばす' });
    if (await skip.count()) {
      await skip.first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
  };

  /*
    先にログインする。

    起動したときにログインを求める作りへ変えた（P-10）以降、
    ログインせずに開いても入口が出るだけになっていた。
    この検査はそこで止まったまま気づかれずにいた。
  */
  member = await createMember(conn, 'deldlg');

  // --- 施設の id を取り、履歴とお気に入りに仕込む -------------------------------
  await signInOn(page, BASE, member, { goto: '/' });
  // 取り込みが終わるまで待つ。端末の中に施設が無いと一覧は空になる。
  await page.waitForTimeout(6000);
  await skipIntro();

  const ids = await page.evaluate(() => {
    const raw = localStorage.getItem('kn_catalog');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed.facilities ?? parsed.items ?? parsed.rows ?? []);
    return list.slice(0, 3).map((f) => f.id);
  });
  check('端末の中に施設がある', ids.length === 3, `取れた件数: ${ids.length}`);
  if (ids.length < 3) throw new Error('施設が揃わないため中止');

  const cancel = page.getByTestId('confirm-cancel');
  const accept = page.getByTestId('confirm-accept');
  const card = page.getByTestId('confirm-dialog');
  const backdrop = page.getByTestId('confirm-backdrop');

  for (const sc of SCREENS) {
    console.log(`\n--- ${sc.name} ---`);

    const open = async () => {
      await page.evaluate(
        ({ ids, key }) => {
          const at = new Date().toISOString();
          localStorage.setItem(key, JSON.stringify(ids.map((id) => ({ id, at }))));
        },
        { ids, key: sc.key },
      );
      await page.goto(`${BASE}${sc.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      await skipIntro();
    };

    const kept = () =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]').length, sc.key);

    await open();
    nativeDialogs = [];

    const rows = page.getByRole('button', { name: sc.row });
    const before = await rows.count();
    check(`${sc.name}: 行ごとの削除ボタンが出ている`, before === 3, `${before}個`);

    // --- 1件 — まず「やめる」 ---------------------------------------------------
    await rows.first().click();
    await page.waitForTimeout(700);

    check(
      `${sc.name}: ブラウザの confirm を使っていない`,
      nativeDialogs.length === 0,
      nativeDialogs.join(' / '),
    );
    check(`${sc.name}: 画面の中に札が出る`, (await card.count()) === 1);
    check(`${sc.name}: 「やめる」が出ている`, (await cancel.count()) === 1);
    check(`${sc.name}: 決める側が出ている`, (await accept.count()) === 1);
    check(
      `${sc.name}: 元に戻せない旨が書かれている`,
      (await card.innerText()).includes('元には戻せません'),
      await card.innerText().catch(() => ''),
    );

    await cancel.click();
    await page.waitForTimeout(600);
    check(`${sc.name}: 「やめる」で札が閉じる`, (await card.count()) === 0);
    check(`${sc.name}: 「やめる」で件数が変わらない`, (await kept()) === 3, `${await kept()}件`);

    // --- 1件 — 今度は消す --------------------------------------------------------
    await rows.first().click();
    await page.waitForTimeout(400);
    await accept.click();
    await page.waitForTimeout(1000);
    check(`${sc.name}: 決める側を押すと1件消える`, (await kept()) === 2, `残り${await kept()}件`);
    check(
      `${sc.name}: 一覧からも消えている`,
      (await rows.count()) === 2,
      `${await rows.count()}個`,
    );

    // --- 札の外を押す -------------------------------------------------------------
    await rows.first().click();
    await page.waitForTimeout(400);
    await backdrop.click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(600);
    check(`${sc.name}: 札の外を押すとやめる扱いになる`, (await card.count()) === 0);
    check(`${sc.name}: 札の外を押しても消えていない`, (await kept()) === 2);

    // --- Esc ----------------------------------------------------------------------
    await rows.first().click();
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    check(`${sc.name}: Esc でやめられる`, (await card.count()) === 0);
    check(`${sc.name}: Esc でも消えていない`, (await kept()) === 2);

    // --- まとめて消す ---------------------------------------------------------------
    await open();
    nativeDialogs = [];
    const selectMode = page.getByRole('button', { name: sc.selectMode });
    check(`${sc.name}: 複数選択に入れる`, (await selectMode.count()) === 1);
    await selectMode.click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'すべて選ぶ' }).click();
    await page.waitForTimeout(400);

    const bulk = page.getByRole('button', { name: sc.bulk });
    check(`${sc.name}: まとめて消すボタンが出ている`, (await bulk.count()) === 1);
    await bulk.click();
    await page.waitForTimeout(700);

    check(
      `${sc.name}: まとめて消すときもブラウザの confirm を使っていない`,
      nativeDialogs.length === 0,
      nativeDialogs.join(' / '),
    );
    check(`${sc.name}: まとめて消すときも札が出る`, (await card.count()) === 1);
    check(
      `${sc.name}: 札に件数が書かれている`,
      (await card.innerText()).includes('3 件'),
      await card.innerText().catch(() => ''),
    );
    await accept.click();
    await page.waitForTimeout(1500);
    check(`${sc.name}: まとめて消せる`, (await kept()) === 0, `残り${await kept()}件`);

    // --- すべて消す -----------------------------------------------------------------
    await open();
    nativeDialogs = [];
    await page.getByRole('button', { name: sc.clearAll }).click();
    await page.waitForTimeout(700);
    check(
      `${sc.name}: すべて消すときもブラウザの confirm を使っていない`,
      nativeDialogs.length === 0,
      nativeDialogs.join(' / '),
    );
    check(`${sc.name}: すべて消すときも札が出る`, (await card.count()) === 1);
    await accept.click();
    await page.waitForTimeout(1500);
    check(`${sc.name}: すべて消せる`, (await kept()) === 0, `残り${await kept()}件`);
  }
} finally {
  if (member) check('検査で作った会員を消した', await removeMember(conn, member));
  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
