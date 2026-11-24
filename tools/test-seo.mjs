/**
 * 検索（SEO）のための土台を確かめる（2026-11-24〜）。
 *
 *   npx serve -s app/dist/web -l 4291                    （別の窓で。アプリの書き出し。4190 は Node の通信が断る番号）
 *   npx serve -l 4300 site                               （別の窓で。紹介サイト）
 *   node tools/test-seo.mjs                              手元
 *   node tools/test-seo.mjs https://app.kurumayosenavi.com https://kurumayosenavi.com
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
 *
 * **紹介サイト**
 *   頭の情報 … 正規の住所／schema.org が正しい JSON で、運営者・サイト・アプリ・よくある
 *              ご質問の4つがそろう。運営者の住所とアプリの料金は書かない
 *   ご質問   … schema.org に書いたご質問と答えが、画面に出ている文と一字一句同じ。
 *              施設数が入る「どの地域に…」は入れない
 *   一覧     … sitemap.xml の4ページがすべて開く／robots.txt が一覧を指す
 *   載せる範囲 … いまは作業中のため、まだ検索に載せない（外すのは4段目）
 */
import { chromium } from 'playwright';

const APP = (process.argv[2] ?? 'http://localhost:4291').replace(/\/$/, '');
const SITE = (process.argv[3] ?? 'http://localhost:4300').replace(/\/$/, '');
const REMOTE = !/localhost|127\.0\.0\.1/.test(APP);
const SITE_REMOTE = !/localhost|127\.0\.0\.1/.test(SITE);
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
  console.log(`検索の土台の検査: アプリ ${APP} ／ 紹介サイト ${SITE}\n`);

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

  /* ====================================================================== */
  console.log('\n--- 紹介サイト：頭の情報 ---');
  const siteRes = await fetch(`${SITE}/`);
  const siteHtml = await siteRes.text();
  check('トップが開く（200）', siteRes.status === 200, String(siteRes.status));
  check('題は紹介サイトのもの（アプリと分けている）', attr(siteHtml, /<title>([^<]*)<\/title>/) === SITE_TITLE);
  check('正規の住所がトップ', attr(siteHtml, /<link rel="canonical" href="([^"]*)"/) === SITE_URL);

  const siteLdRaw = attr(siteHtml, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let graph = null;
  try {
    graph = JSON.parse(siteLdRaw ?? '')['@graph'];
  } catch {
    graph = null;
  }
  check('schema.org の書き方が正しい JSON', Array.isArray(graph), siteLdRaw?.slice(0, 80));
  const node = (type) => (graph ?? []).find((n) => n['@type'] === type);
  const org = node('Organization');
  const site = node('WebSite');
  const app = node('WebApplication');
  const faq = node('FAQPage');
  check('運営者（レベルサーフェス）とお問い合わせ先', org?.name === 'レベルサーフェス' && org?.email === 'kurumayose@levelsurface.net');
  check('運営者の住所は書かない', !org?.address);
  if (org?.logo) {
    const logo = await fetch(org.logo);
    check('運営者のロゴが読める', logo.status === 200, `${logo.status} ${org.logo}`);
  }
  check('サイトの名前が「車寄せナビ」で、運営者を指す', site?.name === '車寄せナビ' && site?.publisher?.['@id'] === org?.['@id']);
  check('アプリはアプリの住所を指し、料金は書かない', app?.url === APP_URL && !app?.offers);

  console.log('\n--- 紹介サイト：よくあるご質問 ---');
  const qa = faq?.mainEntity ?? [];
  check('ご質問が5つ', qa.length === 5, String(qa.length));
  check('施設数が入る「どの地域に…」は入れない', !qa.some((q) => q.name.includes('どの地域')));
  {
    browser ??= await chromium.launch({ channel: 'msedge' });
    const sctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 900 } });
    const spage = await sctx.newPage();
    await spage.goto(`${SITE}/`, { waitUntil: 'networkidle' });
    const shown = await spage.locator('#faq details.qa').evaluateAll((els) =>
      els.map((d) => ({ q: d.querySelector('summary').textContent.trim(), a: d.querySelector('p').textContent.trim() })),
    );
    const mismatched = qa.filter((q) => {
      const s = shown.find((x) => x.q === q.name);
      return !s || s.a !== q.acceptedAnswer?.text;
    });
    check('書いたご質問と答えが、画面の文と一字一句同じ', qa.length > 0 && mismatched.length === 0, mismatched.map((q) => q.name).join(' / '));
    await sctx.close();
  }

  console.log('\n--- 紹介サイト：ページの一覧と robots.txt ---');
  const siteMap = await fetch(`${SITE}/sitemap.xml`);
  const siteMapText = await siteMap.text();
  const siteLocs = [...siteMapText.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  check('sitemap.xml が届き、4ページを載せる', siteMap.status === 200 && siteLocs.length === 4, siteLocs.join(' '));
  const notOpen = [];
  for (const loc of siteLocs) {
    const local = loc.replace(SITE_URL.replace(/\/$/, ''), SITE);
    const r = await fetch(local);
    if (r.status !== 200) notOpen.push(`${r.status} ${local}`);
  }
  check('一覧に載せたページがすべて開く', notOpen.length === 0, notOpen.join(' / '));
  const siteRobots = await (await fetch(`${SITE}/robots.txt`)).text();
  check('robots.txt がページの一覧を指す', siteRobots.includes(`Sitemap: ${SITE_URL}sitemap.xml`), siteRobots);

  console.log('\n--- 紹介サイト：検索に載せる範囲 ---');
  check('いまは作業中のため、まだ検索に載せない（ページの指定）', /<meta name="robots" content="noindex/.test(siteHtml));
  if (SITE_REMOTE) {
    check('いまは作業中のため、まだ検索に載せない（配信側の見出し）', /noindex/.test(siteRes.headers.get('x-robots-tag') ?? ''));
  }
} catch (e) {
  failures.push(`途中で止まった: ${e.message}`);
  console.error(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
