/**
 * 管理者に消された施設の扱いを見る。
 *
 *   node tools/test-facility-gone.mjs                        手元の書き出し (4173)
 *   node tools/test-facility-gone.mjs https://kurumayose-navi.vercel.app
 *
 * 見るのは5点。
 *   1. 消えた施設が、履歴とお気に入りから黙って消えないこと
 *   2. 「削除済み」と分かる形で残っていること
 *   3. 押すと「管理者がこの施設を削除しました」と出ること
 *   4. それがブラウザの alert ではなく、画面の中の帯であること
 *   5. 伝えたあとに一覧と端末の控えから外れること
 *
 * 1 が要点。黙って消えると、留めておいたはずのものが理由もなく
 * 無くなった形になり、利用者からは不具合と区別がつかない。
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn } from './lib/member.mjs';

const rawArg = process.argv[2] ?? 'http://localhost:4190';
const BASE = rawArg.endsWith('/') ? rawArg.slice(0, -1) : rawArg;

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

/** 端末にだけ存在する、サーバーには無い id */
const GONE_ID = '00000000-0000-4000-8000-000000000abc';
const GONE_NAME = '取り壊されたホテル';
const GONE_NAME_EN = 'Demolished Hotel';

let browser = null;
let member = null;

try {
  console.log(`消えた施設の扱いの検査: ${BASE}\n`);

  browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  let nativeDialogs = [];
  page.on('dialog', async (d) => {
    nativeDialogs.push(`${d.type()}: ${d.message()}`);
    await d.dismiss();
  });

  const skipIntro = async () => {
    for (const name of ['導入を飛ばす', 'Skip the intro']) {
      const b = page.getByRole('button', { name });
      if (await b.count()) {
        await b.first().click().catch(() => {});
        await page.waitForTimeout(400);
      }
    }
  };

  /*
    **先にログインする。**

    起動時にログイン画面を出す作りにしてから、この検査は入口で
    止まったまま「不合格」を並べていた（2026-09-14 発見）。
    画面へ入れていないだけで、何も確かめていなかった。
  */
  member = await createMember(conn, 'gone');
  await signInOn(page, BASE, member, { goto: '/' });
  await page.waitForTimeout(8000);
  await skipIntro();

  const liveId = await page.evaluate(() => {
    const cat = JSON.parse(localStorage.getItem('kn_catalog') ?? '{}');
    return cat.facilities?.[0]?.id ?? null;
  });
  check('端末に施設が入っている', !!liveId);

  for (const [name, path, key] of [
    ['お気に入り', '/favorites', 'kn_favorites'],
    ['履歴', '/history', 'kn_history'],
  ]) {
    console.log(`\n--- ${name} ---`);

    // 生きている施設1件と、消えた施設1件を仕込む
    await page.evaluate(
      ({ key, liveId, goneId, goneName, goneNameEn }) => {
        const at = new Date().toISOString();
        localStorage.setItem(
          key,
          JSON.stringify([
            { id: goneId, at, name: goneName, name_en: goneNameEn },
            { id: liveId, at },
          ]),
        );
      },
      { key, liveId, goneId: GONE_ID, goneName: GONE_NAME, goneNameEn: GONE_NAME_EN },
    );

    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await skipIntro();
    nativeDialogs = [];

    const body = await page.innerText('body');
    check(`${name}: 消えた施設が残っている`, body.includes(GONE_NAME), body.slice(0, 200));
    check(`${name}: 削除済みと分かる`, body.includes('削除済み'), body.slice(0, 200));

    const row = page.getByRole('button', { name: new RegExp(GONE_NAME) });
    check(`${name}: 押せる形になっている`, (await row.count()) === 1, `${await row.count()}個`);
    if ((await row.count()) !== 1) continue;

    await row.first().click();
    await page.waitForTimeout(900);

    check(
      `${name}: ブラウザの alert を使っていない`,
      nativeDialogs.length === 0,
      nativeDialogs.join(' / '),
    );

    const toast = page.getByRole('button', { name: /管理者がこの施設を削除しました/ });
    check(`${name}: 画面の中の帯で伝えている`, (await toast.count()) === 1, `${await toast.count()}個`);

    await page.waitForTimeout(600);
    const after = await page.innerText('body');
    check(`${name}: 一覧から外れる`, !after.includes(GONE_NAME), after.slice(0, 200));

    const left = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '[]').map((x) => x.id),
      key,
    );
    check(`${name}: 端末の控えからも外れる`, !left.includes(GONE_ID), JSON.stringify(left));
    check(`${name}: 生きている施設は残る`, left.includes(liveId), JSON.stringify(left));
  }

  // --- 英語のとき ---------------------------------------------------------------
  console.log('\n--- 英語 ---');
  await page.evaluate(
    ({ goneId, goneName, goneNameEn }) => {
      localStorage.setItem('kn_locale', 'en');
      const at = new Date().toISOString();
      localStorage.setItem(
        'kn_favorites',
        JSON.stringify([{ id: goneId, at, name: goneName, name_en: goneNameEn }]),
      );
    },
    { goneId: GONE_ID, goneName: GONE_NAME, goneNameEn: GONE_NAME_EN },
  );
  await page.goto(`${BASE}/favorites`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await skipIntro();

  const enBody = await page.innerText('body');
  check('英語では英語の名前が出る', enBody.includes(GONE_NAME_EN), enBody.slice(0, 200));
  check('英語では Deleted と出る', enBody.includes('Deleted'), enBody.slice(0, 200));

  await page.getByRole('button', { name: new RegExp(GONE_NAME_EN) }).first().click();
  await page.waitForTimeout(900);
  const enToast = page.getByRole('button', { name: /An administrator deleted this facility/ });
  check('英語の知らせが出る', (await enToast.count()) === 1, `${await enToast.count()}個`);
} finally {
  if (browser) await browser.close();
  check('検査で作った会員を消した', await removeMember(conn, member));
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
