/**
 * アプリの言語切り替えを見る。
 *
 *   node tools/test-app-locale.mjs                        手元の書き出し (4173)
 *   node tools/test-app-locale.mjs https://kurumayose-navi.vercel.app
 *
 * 見るのは5点。
 *   1. マイページに言語の欄があり、国旗が2つ出ていること
 *   2. English を選ぶと画面の文言が英語になること
 *   3. 探す・お気に入り・履歴・施設の各画面にも及んでいること
 *   4. 選んだ言語が、開き直しても残っていること
 *   5. 日本語へ戻せること
 *
 * 4 が要点。端末に残らないと、起動のたびに日本語へ戻る。
 * 戻し方が読めなくなった利用者は、そこで行き止まりになる。
 */
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');

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

/** 日本語（かな・漢字）が混じっているか */
const hasJapanese = (s) => /[぀-ゟ゠-ヿ一-鿿]/.test(s);

let browser = null;

try {
  console.log(`アプリの言語切り替えの検査: ${BASE}\n`);

  browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const skipIntro = async () => {
    for (const name of ['導入を飛ばす', 'Skip the intro']) {
      const b = page.getByRole('button', { name });
      if (await b.count()) {
        await b.first().click().catch(() => {});
        await page.waitForTimeout(400);
      }
    }
  };

  const open = async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    await skipIntro();
  };

  // --- 施設の id を控えておく（施設の画面も見るため） ---------------------------
  await open('/');
  await page.waitForTimeout(6000);
  const id = await page.evaluate(() => {
    const cat = JSON.parse(localStorage.getItem('kn_catalog') ?? '{}');
    return cat.facilities?.[0]?.id ?? null;
  });
  check('端末に施設が入っている', !!id);

  // --- マイページ ---------------------------------------------------------------
  console.log('\n--- マイページ ---');
  await open('/mypage');

  const body = await page.innerText('body');
  check('日本語で始まる', body.includes('マイページ'), body.slice(0, 80));
  check('言語の欄がある', body.includes('言語'), body.slice(0, 200));

  const ja = page.getByRole('radio', { name: '日本語' });
  const en = page.getByRole('radio', { name: 'English' });
  check('日本語の選び札がある', (await ja.count()) === 1, `${await ja.count()}個`);
  check('English の選び札がある', (await en.count()) === 1, `${await en.count()}個`);
  check(
    '始めは日本語が選ばれている',
    (await ja.getAttribute('aria-checked')) === 'true' ||
      (await ja.getAttribute('aria-selected')) === 'true',
    `aria-checked=${await ja.getAttribute('aria-checked')} aria-selected=${await ja.getAttribute('aria-selected')}`,
  );

  /*
    国旗は図（View の重なり）で描いてある。絵文字ではないため、
    文字としては現れない。選び札の中に絵の要素があることで見る。
  */
  const flagBoxes = await page.evaluate(() => {
    const marks = [...document.querySelectorAll('[role="radio"]')];
    return marks.map((m) => m.querySelectorAll('div').length);
  });
  check(
    '選び札の中に国旗が描かれている',
    flagBoxes.length === 2 && flagBoxes.every((n) => n > 0),
    JSON.stringify(flagBoxes),
  );

  // --- 英語へ -------------------------------------------------------------------
  console.log('\n--- 英語へ切り替える ---');
  await en.click();
  await page.waitForTimeout(900);

  const enBody = await page.innerText('body');
  check('見出しが Settings になる', enBody.includes('Settings'), enBody.slice(0, 120));
  check('言語の欄が Language になる', enBody.includes('Language'));
  check('画面に日本語が残っていない', !hasJapanese(enBody.replace('日本語', '')), enBody.slice(0, 200));

  // --- 他の画面にも及ぶか ---------------------------------------------------------
  console.log('\n--- 他の画面 ---');
  for (const [name, path, word] of [
    // 「行きたい場所を見つけよう」は狭い画面だけに出る。広い画面にも出るもので見る。
    ['探す', '/', 'Area covered'],
    ['お気に入り', '/favorites', 'Favourites'],
    ['履歴', '/history', 'History'],
  ]) {
    await open(path);
    const text = await page.innerText('body');
    check(`${name}: 英語になっている`, text.includes(word), text.slice(0, 120));
  }

  if (id) {
    await open(`/facility/${id}`);
    const text = await page.innerText('body');
    check('施設: 見出しが Entrance guide になる', text.includes('Entrance guide'), text.slice(0, 120));
    check('施設: 経路が Route になる', text.includes('Route'));

    /*
      画面の枠だけでなく、施設のデータも英語になっているか。

      ここが要点。枠だけ英語で中身が日本語のままだと、
      ドライバーが本当に読みたい進入方法が読めない。
    */
    check(
      '施設: 施設名が英語になっている',
      /Hotel|Tokyo|Inn|Resort/.test(text),
      text.slice(0, 160),
    );
    check(
      '施設: 住所が英語の並びになっている',
      /-ku, Tokyo|, Tokyo|, Chiba/.test(text),
      text.slice(0, 300),
    );
    check(
      '施設: 進入方法が英語になっている',
      /Not yet surveyed|drop-off|ramp|entrance|grounds|Terminal/i.test(text),
      text.slice(0, 400),
    );
    check('施設: 入口名が Drop-off になっている', /Drop-off|Entrance/.test(text));
  }

  // --- 探す画面のカテゴリ ---------------------------------------------------------
  await open('/');
  const home = await page.innerText('body');
  check('探す: カテゴリが英語になっている', home.includes('Hotels'), home.slice(0, 300));

  // --- 開き直しても残るか ---------------------------------------------------------
  console.log('\n--- 開き直す ---');
  await open('/mypage');
  const again = await page.innerText('body');
  check('開き直しても英語のまま', again.includes('Settings'), again.slice(0, 120));

  // --- 日本語へ戻す ---------------------------------------------------------------
  console.log('\n--- 日本語へ戻す ---');
  await page.getByRole('radio', { name: '日本語' }).click();
  await page.waitForTimeout(900);
  const back = await page.innerText('body');
  check('日本語へ戻せる', back.includes('マイページ'), back.slice(0, 120));
} finally {
  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
