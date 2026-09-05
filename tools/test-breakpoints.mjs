/**
 * 画面幅ごとの作り分けを見る。
 *
 *   node tools/test-breakpoints.mjs                        手元の書き出し (4173)
 *   node tools/test-breakpoints.mjs https://kurumayose-navi.vercel.app
 *
 * 見るのは3点。
 *   1. 768px から左メニューが出て、下タブが消えること
 *   2. 767px では逆であること（区切りの直前で切り替わる）
 *   3. どの幅でも横にはみ出さず、カテゴリの札が折り返さないこと
 *
 * 3 が要点。区切りを下げると本文の幅が減る。「オフィスビル」が
 * 折り返して説明が切れる、という崩れは実際に起きた。
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

    await page.close();
  }
} finally {
  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
