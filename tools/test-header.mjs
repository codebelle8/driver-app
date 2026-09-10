/**
 * 上部の帯が、どの画面にも出ているかを見る。
 *
 *   node tools/test-header.mjs                        手元の書き出し (4173)
 *   node tools/test-header.mjs http://localhost:4180
 *
 * **なぜ要るか**
 *   ご指示により、どの機能を開いていても帯を出したままにする。
 *   以前は探す画面だけが持っており、画面ごとに置く作りに戻すと、
 *   次に画面を足したときに置き忘れる。**置き忘れは目で気づけない**
 *   （その画面を開いたときだけ消えている）。全画面を回って確かめる。
 *
 * 見るのは3点。
 *   1. ログインしていなければ、画面の代わりに入口が出ること
 *   2. ログインしたら、どの画面にも場所と鐘が出ていること
 *   3. どの画面にも顔写真が出ていること
 *
 * 起動時にログインを求める作りへ変えたため、未ログインで各画面を
 * 回る検査は成り立たなくなった。入口が出ることだけを見る。
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');

const env = (p) => {
  const o = {};
  for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return o;
};
const appEnv = env('app/.env.local');
const adminEnv = env('admin/.env.local');
const URL_ = appEnv.EXPO_PUBLIC_SUPABASE_URL;
const svc = {
  apikey: adminEnv.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${adminEnv.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

const EMAIL = `kn-header-${Date.now()}@example.com`;
const PASSWORD = 'kn-header-password-2026';

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label} ${detail}`);
  }
};

let browser = null;
let userId = null;

try {
  console.log(`上部の帯の検査: ${BASE}\n`);
  browser = await chromium.launch();

  const made = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svc,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  userId = (await made.json()).id ?? null;

  for (const [w, h] of [
    [390, 844],
    [1440, 900],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const skip = async () => {
      const s = page.getByRole('button', { name: /導入を飛ばす|Skip the intro/ });
      if (await s.count()) await s.first().click().catch(() => {});
      await page.waitForTimeout(1000);
    };

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(6000);
    await skip();

    const ids = await page.evaluate(() => {
      const cat = JSON.parse(localStorage.getItem('kn_catalog') ?? '{}');
      return (cat.facilities ?? []).slice(0, 1).map((f) => f.id);
    });

    const screens = [
      ['探す', '/'],
      ['お気に入り', '/favorites'],
      ['履歴', '/history'],
      ['マイページ', '/mypage'],
      ['お知らせ', '/notices'],
      ['アカウント', '/account'],
    ];
    if (ids[0]) screens.push(['施設', `/facility/${ids[0]}`]);

    // --- ログインしていないとき ------------------------------------------------
    console.log(`--- ${w}px・ログインしていないとき ---`);
    /*
      どの道筋から開いても、入口が出る。

      画面ごとの見出しや一覧は出ない。会員制の製品として、入口を
      ひとつにしている（ご指示による）。
    */
    for (const [name, path] of screens) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      await skip();

      const body = await page.locator('body').innerText();
      check(`${w}px ${name}: 入口が出る`, body.includes('ようこそ'), body.slice(0, 60).replace(/\n/g, ' / '));
      check(
        `${w}px ${name}: 中身は出さない`,
        !/案内できる範囲|現在地/.test(body),
        body.slice(0, 60).replace(/\n/g, ' / '),
      );
    }

    // --- ログインしたとき ------------------------------------------------------
    if (userId) {
      console.log(`\n--- ${w}px・ログインしたとき ---`);
      await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      await skip();
      await page.getByLabel('メールアドレス').fill(EMAIL);
      await page.getByLabel('パスワード', { exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: 'ログイン' }).last().click();
      await page.waitForTimeout(5000);

      for (const [name, path] of screens) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2500);
        await skip();

        const body = await page.locator('body').innerText();
        /*
          帯の左に置くものは、画面の広さで変わる（ご指示 2026-09-10）。

            狭い画面 … ロゴ。案内できる範囲は探す画面の頭へ移した。
            広い画面 … 案内できる範囲。ロゴは左メニューの上にある。

          どちらも「帯の左が空でない」ことは変わらない。そこを見る。
        */
        if (w >= 1024) {
          check(`${w}px ${name}: 場所が出ている`, /案内できる範囲|現在地/.test(body));
        } else {
          check(
            `${w}px ${name}: 帯にロゴが出ている`,
            (await page.getByRole('link', { name: /探す画面へ|設定へ/ }).count()) > 0,
          );
        }
        check(
          `${w}px ${name}: 鐘が出ている`,
          (await page.getByRole('link', { name: /お知らせ/ }).count()) > 0,
        );
        check(
          `${w}px ${name}: 顔写真が出ている`,
          (await page.getByRole('button', { name: 'アカウントのメニュー' }).count()) === 1,
        );
      }
    }

    await page.close();
  }
} finally {
  if (userId) {
    await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svc });
    const r = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: svc });
    const j = await r.json();
    check('検査で作った会員を消した', !(j.users ?? []).some((u) => u.email === EMAIL));
  }
  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
