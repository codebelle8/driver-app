/**
 * 立ち上がりの導入（映像と音）を見る。
 *
 *   node tools/test-intro.mjs                          手元の書き出し (4173)
 *   node tools/test-intro.mjs https://app.kurumayosenavi.com
 *
 * 見るのは6点。
 *   1. 導入の映像が流れる（止まらない）
 *   2. 音ありの自動再生が**許される**場合、消音になっていない（音が出る）
 *   3. **断られる**場合も映像は止まらず、「音を出す」が出る
 *   4. 「音を出す」を押すと消音が解け、導入は終わらない（飛ばされない）
 *   5. 画面を押すと飛ばせる
 *   6. 画面に誤りが出ない
 *
 * 2 と 3 が要点。**消音のまま始めると音が出ず、音ありで始めると
 * ブラウザに断られて映像ごと止まる。** どちらの環境でも成り立つことを見る。
 *
 * **Edge で見る。** 同梱の Chromium は H.264 の動画を再生できない。
 * 音が聞こえるかは機械では確かめられないため、「消音になっていないこと」と
 * 「音声を復号していること」で見る。
 *
 * 自動再生が許された状態（ホーム画面に追加した場合など）は、Edge に
 * `--autoplay-policy=no-user-gesture-required` を渡して作る。
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
    console.error(`  FAIL  ${label}`);
    if (detail) console.error(`        ${detail}`);
  }
}

/** 映像の様子。音が出ているかは、消音かどうかと復号した量で見る */
const state = (page) =>
  page.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return null;
    return {
      muted: v.muted,
      paused: v.paused,
      time: Number(v.currentTime.toFixed(2)),
      audio: v.webkitAudioDecodedByteCount ?? -1,
    };
  });

async function open(sound) {
  const browser = await chromium.launch({
    channel: 'msedge',
    args: sound ? ['--autoplay-policy=no-user-gesture-required'] : [],
  });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  return { browser, page, errors };
}

try {
  console.log(`導入（映像と音）の検査: ${BASE}\n`);

  /* =================================================================== */
  console.log('--- 音ありの自動再生が許される場合（ホーム画面に追加など） ---');
  /* =================================================================== */
  {
    const { browser, page, errors } = await open(true);
    await page.waitForTimeout(2500);
    const s = await state(page);
    check('導入の映像が出る', Boolean(s), JSON.stringify(s));
    check('映像が流れている（止まらない）', s && !s.paused && s.time > 0.5, JSON.stringify(s));
    check('消音になっていない（音が出る）', s && !s.muted, JSON.stringify(s));
    check('音声を復号している', s && s.audio > 0, JSON.stringify(s));
    check(
      '「音を出す」は出さない（もう鳴っているため）',
      (await page.getByRole('button', { name: '音を出す' }).count()) === 0,
    );
    check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
    await browser.close();
  }

  /* =================================================================== */
  console.log('\n--- 音ありの自動再生が断られる場合（ふつうのブラウザ） ---');
  /* =================================================================== */
  {
    const { browser, page, errors } = await open(false);
    await page.waitForTimeout(2500);
    let s = await state(page);
    check('断られても、映像は止まらない', s && !s.paused && s.time > 0.5, JSON.stringify(s));
    check('そのあいだは消音', s && s.muted, JSON.stringify(s));

    const button = page.getByRole('button', { name: '音を出す' });
    check('「音を出す」が出る', (await button.count()) === 1);

    await button.click();
    await page.waitForTimeout(1200);
    s = await state(page);
    check('押すと、消音が解ける', s && !s.muted, JSON.stringify(s));
    check('押しても、導入は終わらない（飛ばされない）', Boolean(s) && !s.paused, JSON.stringify(s));
    check(
      '押したあとは「音を出す」を出さない',
      (await page.getByRole('button', { name: '音を出す' }).count()) === 0,
    );

    /* 画面を押すと飛ばせる（導入の外へ出る） */
    await page.mouse.click(210, 500);
    await page.waitForTimeout(1200);
    check('画面を押すと飛ばせる', (await page.locator('video').count()) === 0);

    check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
    await browser.close();
  }
} finally {
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
