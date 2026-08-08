/**
 * ロゴとアプリアイコンの PNG を生成する。
 *
 *   node tools/build-brand.mjs
 *
 * 文字を含むロゴは Chromium で描画してから PNG 化する。
 * SVG のまま配布すると閲覧環境に日本語フォントが無い場合に
 * 文字が崩れるため、PNG では字形を焼き込んでおく。
 *
 * 出力先:
 *   assets/brand/            … 原本（クライアント様への受け渡し用）
 *   admin/public/brand/      … 管理画面が参照するもの
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { COLORS, iconSvg, markStandalone, markSvg } from './brand/mark.mjs';

const OUT = 'assets/brand';
const ADMIN = 'admin/public/brand';

mkdirSync(OUT, { recursive: true });
mkdirSync(ADMIN, { recursive: true });

// --- 編集可能な原本として SVG も残す -----------------------------------------
writeFileSync(`${OUT}/mark.svg`, markStandalone(), 'utf8');
writeFileSync(`${OUT}/icon.svg`, iconSvg(1024), 'utf8');

/**
 * ロゴ（横組み）。
 * 文字幅はフォントに依存するため、座標を手で指定する SVG ではなく
 * HTML のレイアウトに任せる。こうすると和文・欧文の中央揃えや
 * 罫線の位置がフォントに関わらず正しく揃う。
 */
function logoHtml({ dark = false } = {}) {
  const text = dark ? '#FFFFFF' : COLORS.navy;
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: transparent; }
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 40px;
    padding: 24px 32px;
    font-family: "Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif;
  }
  .mark { width: 186px; height: 220px; flex: none; }
  .words { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .ja {
    position: relative;
    font-size: 104px;
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: 0.02em;
    color: ${text};
    white-space: nowrap;
  }
  /* 「ナビ」の右肩に小さな目的地ピンを添える */
  .ja .pin { position: absolute; top: -14px; right: -34px; width: 40px; height: 48px; }
  .sub { display: flex; align-items: center; gap: 18px; width: 100%; }
  .sub .rule { flex: 1; height: 3px; background: ${COLORS.amber}; border-radius: 2px; }
  .sub .en {
    font-size: 31px;
    font-weight: 500;
    letter-spacing: 0.16em;
    color: ${text};
    white-space: nowrap;
  }
</style></head><body>
  <div class="logo" id="logo">
    <svg class="mark" viewBox="0 0 220 260">${markSvg({
      pinFill: dark ? '#223A5C' : COLORS.navy,
      detail: '#FFFFFF',
    })}</svg>
    <div class="words">
      <div class="ja">車寄せナビ<svg class="pin" viewBox="0 0 42 50">
        <path d="M21 49 C 13 38, 2 31, 2 20 A 19 19 0 1 1 40 20 C 40 31, 29 38, 21 49 Z" fill="${COLORS.amber}"/>
        <circle cx="21" cy="19" r="6.5" fill="#FFFFFF"/>
      </svg></div>
      <div class="sub">
        <span class="rule"></span>
        <span class="en">Driver Entrance Navi</span>
        <span class="rule"></span>
      </div>
    </div>
  </div>
</body></html>`;
}

const browser = await chromium.launch();

async function shotHtml(html, path, scale) {
  const ctx = await browser.newContext({ deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const el = page.locator('#logo');
  await el.screenshot({ path, omitBackground: true });
  const box = await el.boundingBox();
  await ctx.close();
  return box;
}

async function shotSvg(svg, path, size) {
  const ctx = await browser.newContext({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace(
      /width="\d+" height="\d+"/,
      `width="${size}" height="${size}"`,
    )}</body></html>`,
    { waitUntil: 'load' },
  );
  await page.locator('svg').screenshot({ path, omitBackground: true });
  await ctx.close();
}

console.log('ロゴ:');
const box = await shotHtml(logoHtml(), `${OUT}/logo.png`, 3);
console.log(`  logo.png            ${Math.round(box.width * 3)}x${Math.round(box.height * 3)}`);
await shotHtml(logoHtml(), `${OUT}/logo@1x.png`, 1);
await shotHtml(logoHtml({ dark: true }), `${OUT}/logo-on-dark.png`, 3);
console.log('  logo@1x.png / logo-on-dark.png');

console.log('アイコン:');
for (const size of [1024, 512, 192, 180, 64, 32]) {
  await shotSvg(iconSvg(1024), `${OUT}/icon-${size}.png`, size);
  console.log(`  icon-${size}.png`);
}

await browser.close();

// --- 管理画面が使うものを配置 -------------------------------------------------
for (const f of [
  'logo.png',
  'logo-on-dark.png',
  'icon-512.png',
  'icon-192.png',
  'icon-64.png',
  'icon-32.png',
]) {
  copyFileSync(`${OUT}/${f}`, `${ADMIN}/${f}`);
}

console.log(`\n${OUT}/ と ${ADMIN}/ に出力しました。`);
