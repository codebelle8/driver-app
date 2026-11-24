/**
 * 紹介サイトの規約類の3ページ（/terms・/privacy・/law）を確かめる（2026-11-23）。
 *
 *   npx serve -l 4300 site                         （別の窓で）
 *   node tools/test-site-legal.mjs
 *   node tools/test-site-legal.mjs https://kurumayosenavi.com
 *
 * **何を見るか**
 *   中身   … docs/17-legal-final.md の文が、一文も欠けずに載っている（「。」で区切って
 *            1つずつ探す）／字の間に余計な空白が無い（「本サー ビス」）／空欄（【　】）・
 *            掲示しない節（10月8日版からの変更）・外した行（決済代行会社名）が無い／
 *            運営者のお名前・ご住所・制定日
 *   組み立て … 題・見出しの数と飛び先（利用規約21条・プライバシーポリシー8項）・目次・
 *            3つのページの切り替え（いま開いているページに印）・メールのリンク
 *   リンク … トップの下の部分から3つのページへ行ける／ページどうしを行き来できる
 *   崩れ   … 4つの幅で横にはみ出さない／特商法の表は狭い画面で縦に積む／画像が読める
 *   検索   … 利用規約とプライバシーポリシーは検索に載せる。特商法の表記（/law）は、ご住所が
 *            載っているため載せない（ページの指定。公開先では配信側の見出しも。2026-11-24〜）
 *   誤り   … 画面の誤り・読めないファイル（404 など）が無い
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv[2] ?? 'http://localhost:4300').replace(/\/$/, '');
const REMOTE = !/localhost|127\.0\.0\.1/.test(BASE);

const PAGES = [
  { path: '/terms', heading: '利用規約', h2: 21, idPrefix: 'article-', toc: true, noindex: false },
  { path: '/privacy', heading: 'プライバシーポリシー', h2: 8, idPrefix: 'section-', toc: true, noindex: false },
  { path: '/law', heading: '特定商取引法に基づく表記', h2: 0, idPrefix: null, toc: false, noindex: true },
];
const OWNER = '上野　修';
const ADDRESS = '東京都江戸川区中葛西5-14-12-305';
const DATE = '2026年11月23日';
const WIDTHS = [320, 375, 768, 1280];

const failures = [];
let passed = 0;
function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}`);
    if (detail) console.log(`        ${String(detail).slice(0, 400)}`);
  }
}

/* --- 元の文を「。」で区切った塊にする（空白・記号の書き方の違いは落とす） --- */
const squash = (s) => s.replace(/\s+/g, '');
function sourceChunks(heading) {
  const text = readFileSync(join(ROOT, 'docs', '17-legal-final.md'), 'utf8').replace(/\r\n/g, '\n');
  const lines = [];
  let inside = false;
  for (const line of text.split('\n')) {
    const h = line.match(/^# (.+)$/);
    if (h) {
      inside = h[1].trim() === heading;
      continue;
    }
    if (inside) lines.push(line);
  }
  const body = lines
    .filter((l) => l.trim() !== '---' && !/^\s*\|[-\s|]+\|\s*$/.test(l) && !/^\s*\|\s*項目\s*\|\s*記載内容\s*\|/.test(l))
    .map((l) =>
      l
        .replace(/^\s*(\d+\.|-)\s+/, '')
        .replace(/\*\*/g, '')
        .replace(/<br>/g, '')
        .replace(/\|/g, ''),
    )
    .join('');
  return squash(body)
    .split('。')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge' });
  console.log(`規約類のページの検査: ${BASE}\n`);

  for (const def of PAGES) {
    console.log(`--- ${def.heading}（${def.path}） ---`);
    const res = await fetch(`${BASE}${def.path}`);
    check('開ける（200）', res.status === 200, String(res.status));
    if (REMOTE) {
      const robots = res.headers.get('x-robots-tag') ?? '';
      check(
        def.noindex ? '配信側の見出しでも、検索に載せない（ご住所が載っているため）' : '配信側の見出しで止めていない（検索に載せる）',
        /noindex/.test(robots) === def.noindex,
        robots,
      );
    }

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' });
    const page = await ctx.newPage();
    const errors = [];
    const missing = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().startsWith(BASE)) missing.push(`${r.status()} ${r.url()}`);
    });
    await page.goto(`${BASE}${def.path}`, { waitUntil: 'networkidle' });

    check('題が出る', (await page.locator('h1').innerText()).trim() === def.heading);
    check('ページの名前', (await page.title()) === `${def.heading}｜車寄せナビ`, await page.title());
    const robotsMeta = await page.locator('meta[name="robots"]').getAttribute('content').catch(() => null);
    check(
      def.noindex ? 'ページの指定で、検索に載せない（ご住所が載っているため）' : 'ページの指定で止めていない（検索に載せる）',
      /noindex/.test(robotsMeta ?? '') === def.noindex,
      robotsMeta,
    );

    const bodyText = await page.locator('.lg-body').innerText();
    const dateText = (await page.locator('.lg-date').innerText().catch(() => '')).trim();
    const pageText = squash(bodyText + dateText);
    const chunks = sourceChunks(def.heading);
    const lost = chunks.filter((c) => !pageText.includes(c));
    check(`元の文が一文も欠けずに載っている（${chunks.length}文）`, chunks.length > 5 && lost.length === 0, lost.slice(0, 3).join(' ／ '));
    const gap = bodyText.match(/[぀-ヿ㐀-鿿、。「」（）] [぀-ヿ㐀-鿿、。「」（）]/);
    check('字の間に余計な空白が無い', !gap, gap?.[0]);
    const html = await page.content();
    check('空欄（【　】）が無い', !html.includes('【'));
    check('掲示しない節・外した行が無い', !/10月8日版からの変更|決済代行会社名|掲示しない/.test(html));
    check(`制定日が ${DATE}`, dateText === `制定日　${DATE}`, dateText);

    const h2 = await page.locator('.lg-body h2').evaluateAll((els) => els.map((e) => ({ id: e.id, text: e.innerText })));
    check(`見出しが ${def.h2} 個`, h2.length === def.h2, String(h2.length));
    if (def.idPrefix) {
      check('見出しに順に飛び先がある', h2.every((h, i) => h.id === `${def.idPrefix}${i + 1}`), h2.map((h) => h.id).join(','));
    }
    if (def.toc) {
      const toc = await page.locator('.lg-toc a').evaluateAll((els) => els.map((a) => a.getAttribute('href')));
      const allExist = await page.evaluate((hrefs) => hrefs.every((h) => document.querySelector(h)), toc);
      check(`目次が ${def.h2} 項目で、すべて飛べる`, toc.length === def.h2 && allExist, String(toc.length));
      await page.locator('.lg-toc summary').click();
      await page.locator('.lg-toc a').last().click();
      await page.waitForTimeout(900);
      const last = toc[toc.length - 1];
      const top = await page.evaluate((h) => document.querySelector(h).getBoundingClientRect().top, last);
      check('目次を押すと、その見出しがヘッダーに隠れずに見える', top >= 60 && top < 500, String(Math.round(top)));
    }

    const tabs = await page.locator('.lg-tabs a').evaluateAll((els) =>
      els.map((a) => ({ href: a.getAttribute('href'), current: a.getAttribute('aria-current') })),
    );
    check(
      '3つのページを切り替えられ、いまのページに印がある',
      tabs.length === 3 && tabs.filter((t) => t.current === 'page').length === 1 && tabs.find((t) => t.current)?.href === def.path,
      JSON.stringify(tabs),
    );

    if (def.path === '/law') {
      const rows = await page.locator('.lg-table--def tr').evaluateAll((trs) =>
        Object.fromEntries(trs.map((tr) => [tr.querySelector('th').innerText.trim(), tr.querySelector('td').innerText.trim()])),
      );
      check('販売業者が上野 修様（屋号つき）', rows['販売業者'] === `${OWNER}（屋号：レベルサーフェス）`, rows['販売業者']);
      check('運営統括責任者が上野 修様', rows['運営統括責任者'] === OWNER, rows['運営統括責任者']);
      check('所在地がいただいたご住所', rows['所在地'] === ADDRESS, rows['所在地']);
    }
    if (def.path === '/privacy') {
      check('窓口に、運営者のお名前とご住所', bodyText.includes(`代表　${OWNER}`) && bodyText.includes(ADDRESS));
    }
    if (def.path !== '/terms') {
      check('メールアドレスを押すとメールが開く', (await page.locator('a[href="mailto:kurumayose@levelsurface.net"]').count()) >= 1);
    }

    /* 崩れ */
    const wide = [];
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(150);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w + 1) wide.push(`${w}px→${sw}px`);
    }
    check(`${WIDTHS.join('・')}px のどの幅でも横にはみ出さない`, wide.length === 0, wide.join(' / '));
    if (def.path === '/law') {
      await page.setViewportSize({ width: 375, height: 800 });
      const display = await page.locator('.lg-table--def th').first().evaluate((e) => getComputedStyle(e).display);
      check('スマートフォンの幅では、表の見出しを上・中身を下に積む', display === 'block', display);
    }
    const broken = await page.locator('img').evaluateAll((imgs) => imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
    check('画像がすべて読める', broken.length === 0, broken.join(' '));

    check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
    check('読めないファイルが無い', missing.length === 0, missing.join(' / '));
    await ctx.close();
    console.log('');
  }

  console.log('--- リンク ---');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const legal = await page.locator('.site-footer__legal a').evaluateAll((els) =>
      els.map((a) => ({ text: a.innerText.trim(), href: a.getAttribute('href') })),
    );
    check(
      'トップの下の部分に、3つのページへのリンク',
      JSON.stringify(legal.map((l) => l.href)) === JSON.stringify(PAGES.map((p) => p.path)) &&
        legal.every((l, i) => l.text === PAGES[i].heading),
      JSON.stringify(legal),
    );
    await page.locator('.site-footer__legal a', { hasText: '利用規約' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await page.locator('.site-footer__legal a', { hasText: '利用規約' }).click();
    await page.waitForURL(/\/terms$/, { timeout: 10_000 }).catch(() => undefined);
    check('押すと利用規約が開く', page.url().endsWith('/terms') && (await page.locator('h1').innerText()) === '利用規約', page.url());
    await page.locator('.lg-tabs a', { hasText: 'プライバシーポリシー' }).click();
    await page.waitForURL(/\/privacy$/, { timeout: 10_000 }).catch(() => undefined);
    check('利用規約から、プライバシーポリシーへ移れる', page.url().endsWith('/privacy'), page.url());
    await page.locator('.lg-footer__nav a', { hasText: '特定商取引法に基づく表記' }).click();
    await page.waitForURL(/\/law$/, { timeout: 10_000 }).catch(() => undefined);
    check('下の部分から、特定商取引法に基づく表記へ移れる', page.url().endsWith('/law'), page.url());
    await page.locator('.lg-header__logo').click();
    await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 10_000 }).catch(() => undefined);
    check('ロゴでトップへ戻る', new URL(page.url()).pathname === '/', page.url());
    await ctx.close();
  }
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
}

console.log(`\n合格 ${passed} / 不合格 ${failures.length}`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length ? 1 : 0);
