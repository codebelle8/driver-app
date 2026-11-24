/**
 * 検索（SEO）のための土台を確かめる（2026-11-24〜）。
 *
 *   npx serve -s app/dist/web -l 4291                    （別の窓で。アプリの書き出し。4190 は Node の通信が断る番号）
 *   node tools/test-seo.mjs                              手元
 *   node tools/test-seo.mjs https://app.kurumayosenavi.com
 *
 * 方針は docs/19-seo.md。アプリと紹介サイトの両方を検索に出し、役目を分ける
 * （紹介サイト＝サービスの説明、アプリ＝使い始める入口）。
 *
 * **アプリ**
 *   頭の情報 … 題に「アプリ」、説明に「ログイン・新規登録」。紹介サイトと同じ題にしない／
 *              正規の住所はトップ／共有の題・説明・画像／schema.org の WebApplication が
 *              正しい JSON で、運営者と紹介サイトを指す。料金は書かない
 *   一覧     … robots.txt が文字のまま届き（アプリの画面に置き換わらない）、読みに来るのを
 *              止めず、ページの一覧を指す／sitemap.xml がトップだけを載せる
 *   載せる範囲 … トップは検索に載せる。トップ以外（/facility/… /mypage など）は、中身が
 *              同じ入口になるため載せない（配信側の見出し。公開先でだけ確かめられる）
 *   画面     … ブラウザで開いても題がそのまま／ホーム画面に置く名前は「車寄せナビ」のまま
 */
import { chromium } from 'playwright';

const APP = (process.argv[2] ?? 'http://localhost:4291').replace(/\/$/, '');
const REMOTE = !/localhost|127\.0\.0\.1/.test(APP);
const APP_URL = 'https://app.kurumayosenavi.com/';
const SITE_URL = 'https://kurumayosenavi.com/';
const SITE_TITLE = '車寄せナビ｜プロドライバーのための車寄せ・エントランス案内';

let pass = 0;
const failures = [];
function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}`);
    if (detail) console.log(`        ${String(detail).slice(0, 300)}`);
  }
}

const attr = (html, re) => html.match(re)?.[1] ?? null;
const meta = (html, key, name) =>
  attr(html, new RegExp(`<meta\\s+${key}="${name}"\\s+content="([^"]*)"`, 's'));

let browser = null;
try {
  console.log(`検索の土台の検査: アプリ ${APP}\n`);

  /* ---------------------------------------------------------------------- */
  console.log('--- アプリ：頭の情報 ---');
  const res = await fetch(`${APP}/`);
  const html = await res.text();
  const title = attr(html, /<title>([^<]*)<\/title>/);
  check('トップが開く（200）', res.status === 200, String(res.status));
  check('題に「アプリ」が入り、紹介サイトと同じ題ではない', !!title && title.includes('アプリ') && title !== SITE_TITLE, title);
  const desc = meta(html, 'name', 'description');
  check('説明があり、「ログイン・新規登録」の入口だと分かる', !!desc && desc.includes('ログイン・新規登録'), desc);
  check('説明が長すぎない（120字まで）', !!desc && desc.length <= 120, `${desc?.length}字`);
  check('正規の住所がトップ', attr(html, /<link rel="canonical" href="([^"]*)"/) === APP_URL);
  check('共有の題', !!meta(html, 'property', 'og:title'));
  check('共有の説明', !!meta(html, 'property', 'og:description'));
  check('共有の住所がトップ', meta(html, 'property', 'og:url') === APP_URL);
  const ogImage = meta(html, 'property', 'og:image');
  check('共有の画像が住所から始まる形', !!ogImage && /^https:\/\//.test(ogImage), ogImage);
  if (ogImage) {
    const img = await fetch(ogImage);
    check('共有の画像が読める', img.status === 200 && /image\//.test(img.headers.get('content-type') ?? ''), `${img.status} ${img.headers.get('content-type')}`);
  }

  const ldRaw = attr(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let ld = null;
  try {
    ld = JSON.parse(ldRaw ?? '');
  } catch (e) {
    ld = null;
  }
  check('schema.org の書き方が正しい JSON', !!ld, ldRaw?.slice(0, 80));
  check('種類が WebApplication で、名前が「車寄せナビ」', ld?.['@type'] === 'WebApplication' && ld?.name === '車寄せナビ');
  check('住所がトップ', ld?.url === APP_URL);
  check('運営者がレベルサーフェスで、紹介サイトを指す', ld?.publisher?.name === 'レベルサーフェス' && ld?.publisher?.url === SITE_URL);
  check('紹介サイトと同じものだと伝える（sameAs）', Array.isArray(ld?.sameAs) && ld.sameAs.includes(SITE_URL));
  check('料金は書かない（試験提供と有料で変わるため）', !ld?.offers);
  check('ホーム画面に置く名前は「車寄せナビ」のまま', meta(html, 'name', 'apple-mobile-web-app-title') === '車寄せナビ');

  /* ---------------------------------------------------------------------- */
  console.log('\n--- アプリ：robots.txt とページの一覧 ---');
  const robots = await fetch(`${APP}/robots.txt`);
  const robotsText = await robots.text();
  check('robots.txt が文字のまま届く（アプリの画面に置き換わらない）', robots.status === 200 && !/<html|<!DOCTYPE/i.test(robotsText), robotsText.slice(0, 60));
  check('読みに来るのを止めない', /User-agent:\s*\*/i.test(robotsText) && !/^Disallow:\s*\/\s*$/im.test(robotsText));
  check('ページの一覧を指す', robotsText.includes(`Sitemap: ${APP_URL}sitemap.xml`));
  const sitemap = await fetch(`${APP}/sitemap.xml`);
  const sitemapText = await sitemap.text();
  const locs = [...sitemapText.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  check('sitemap.xml が届く', sitemap.status === 200 && sitemapText.includes('<urlset'), sitemapText.slice(0, 60));
  check('載せるのはトップだけ', locs.length === 1 && locs[0] === APP_URL, locs.join(' '));

  /* ---------------------------------------------------------------------- */
  console.log('\n--- アプリ：検索に載せる範囲 ---');
  if (REMOTE) {
    const top = await fetch(`${APP}/`);
    check('トップは検索に載せる（noindex が無い）', !/noindex/.test(top.headers.get('x-robots-tag') ?? ''), top.headers.get('x-robots-tag'));
    for (const path of ['/facility/00000000-0000-0000-0000-000000000000', '/mypage', '/chat-room', '/account']) {
      const r = await fetch(`${APP}${path}`);
      check(`${path} は検索に載せない（中身が同じ入口のため）`, /noindex/.test(r.headers.get('x-robots-tag') ?? ''), r.headers.get('x-robots-tag'));
    }
  } else {
    console.log('  （配信側の見出しは公開先でだけ確かめられる。手元では飛ばす）');
  }

  /* ---------------------------------------------------------------------- */
  console.log('\n--- アプリ：画面 ---');
  browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  check('ブラウザで開いても題がそのまま', (await page.title()) === title, await page.title());
  check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
  await ctx.close();
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
