/**
 * 画面幅ごとの作り分けを見る。
 *
 *   node tools/test-breakpoints.mjs                        手元の書き出し (4173)
 *   node tools/test-breakpoints.mjs https://kurumayose-navi.vercel.app
 *
 * 見るのは5点。
 *   1. 768px から左メニューが出て、下タブが消えること
 *   2. 767px では逆であること（区切りの直前で切り替わる）
 *   3. どの幅でも横にはみ出さず、カテゴリの札が折り返さないこと
 *   4. どの幅でも、絞り込んでいるあいだ検索欄が出ていること
 *   5. 端末を回しても、打った言葉が残ること
 *
 * 4 と 5 は実際に落ちていた。768〜1023px で絞り込むと検索欄が
 * 消え、打った言葉が見えず、直すことも消すこともできなかった。
 * 幅ごとに枝を分けたとき、この幅がどちらの枝からも外れていた。
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

/** 幅と、その幅で期待する姿 */
const CASES = [
  { w: 375, rail: false, split: false },
  { w: 767, rail: false, split: false },
  { w: 768, rail: true, split: false },
  { w: 900, rail: true, split: false },
  { w: 1023, rail: true, split: false },
  { w: 1024, rail: true, split: true },
  { w: 1440, rail: true, split: true },
];

let browser = null;

try {
  console.log(`画面幅ごとの作り分けの検査: ${BASE}\n`);
  browser = await chromium.launch();

  for (const { w, rail, split } of CASES) {
    const page = await browser.newPage({ viewport: { width: w, height: 820 } });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(w === CASES[0].w ? 8000 : 3500);
    const skip = page.getByRole('button', { name: /導入を飛ばす|Skip the intro/ });
    if (await skip.count()) await skip.first().click().catch(() => {});
    await page.waitForTimeout(900);

    /*
      左メニューかどうかは、行が縦に積まれているかで見る。
      下タブも同じ文言を持つため、文字だけでは区別できない。
    */
    const layout = await page.evaluate(() => {
      /*
        文字だけで当てない。行の中には記号（アイコン用の書体）が
        入っており、textContent が「探す」のようになる。
        最初これで1つも拾えず、左メニューが無いと誤って報告した。
      */
      const items = [...document.querySelectorAll('[role="tab"]')].filter((e) =>
        /探す|お気に入り|履歴|マイページ/.test(
          (e.getAttribute('aria-label') ?? '') + (e.textContent ?? ''),
        ),
      );
      if (items.length < 2) return { rail: false, count: items.length };
      const a = items[0].getBoundingClientRect();
      const b = items[1].getBoundingClientRect();
      return { rail: b.top - a.top > 10, count: items.length };
    });
    check(`${w}px: 左メニュー ${rail ? 'あり' : 'なし'}`, layout.rail === rail, JSON.stringify(layout));

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`${w}px: 横にはみ出さない`, overflow <= 0, `${overflow}px`);

    const wrapped = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('div')) {
        const t = el.textContent?.trim() ?? '';
        if (/^(ホテル|レジデンス|商業施設|オフィスビル|病院|駅・空港)$/.test(t)) {
          const r = el.getBoundingClientRect();
          const line = parseFloat(getComputedStyle(el).lineHeight) || 0;
          if (line && r.height > line * 1.4) out.push(t);
        }
      }
      return out;
    });
    check(`${w}px: カテゴリの札が折り返さない`, wrapped.length === 0, wrapped.join(' / '));

    // 絞り込んだときに地図を横へ並べるか
    await page.getByPlaceholder(/施設名|Name, reading/).fill('ホテル');
    await page.waitForTimeout(2500);
    const hasMap = await page.evaluate(() => !!document.querySelector('.gm-style'));
    check(`${w}px: 一覧の横に地図 ${split ? 'あり' : 'なし'}`, hasMap === split, `地図=${hasMap}`);

    /*
      絞り込んでいるあいだ、検索欄は出ていなければならない。

      打った言葉が見えないと、直すことも消すこともできない。
      「絞り込みを外す」以外に戻る道が無くなる。
    */
    const field = page.getByPlaceholder(/施設名|Name, reading/);
    check(`${w}px: 絞り込み中も検索欄が出ている`, (await field.count()) === 1, `${await field.count()}個`);
    if ((await field.count()) === 1) {
      check(`${w}px: 打った言葉が入っている`, (await field.inputValue()) === 'ホテル');
    }

    await page.close();
  }
  /*
    端末を回したときに、打った言葉が残るか。

    幅が区切りをまたぐと画面の作りが入れ替わる。入れ替えの仕方を
    誤ると、打った言葉ごと消える。利用者からは「最初に戻った」
    ように見える。
  */
  console.log('\n--- 端末の回転 ---');
  for (const [name, from] of [
    ['携帯（390 → 844）', { width: 390, height: 844 }],
    ['タブレット（768 → 1024）', { width: 768, height: 1024 }],
  ]) {
    const page = await browser.newPage({ viewport: from });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    const skip = page.getByRole('button', { name: /導入を飛ばす|Skip the intro/ });
    if (await skip.count()) await skip.first().click().catch(() => {});
    await page.waitForTimeout(700);

    await page.getByPlaceholder(/施設名|Name, reading/).fill('ホテル');
    await page.waitForTimeout(2200);

    await page.setViewportSize({ width: from.height, height: from.width });
    await page.waitForTimeout(2200);
    const turned = page.getByPlaceholder(/施設名|Name, reading/);
    check(
      `${name}: 回しても検索欄が残る`,
      (await turned.count()) === 1,
      `${await turned.count()}個`,
    );
    check(
      `${name}: 回しても打った言葉が残る`,
      (await turned.count()) === 1 && (await turned.inputValue()) === 'ホテル',
    );

    await page.setViewportSize(from);
    await page.waitForTimeout(1800);
    const back = page.getByPlaceholder(/施設名|Name, reading/);
    check(
      `${name}: 戻しても打った言葉が残る`,
      (await back.count()) === 1 && (await back.inputValue()) === 'ホテル',
    );
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
