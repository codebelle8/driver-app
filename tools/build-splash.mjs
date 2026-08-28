/**
 * 起動画面（スプラッシュ）の画像を組み立てる。
 *
 *   node tools/build-splash.mjs
 *
 * なぜ要るか:
 *   起動画面はアプリの「顔」にあたる。ここに図柄だけを置くと、
 *   アプリ名は端末側の書体で描かれ、せっかくのロゴタイプが使われない。
 *
 *   いただいたロゴは横組み（図柄の右に文字）だが、縦長の画面では
 *   横幅いっぱいに広げても小さくしか見えない。図柄を上、文字を下に
 *   積み直すことで、同じ幅でも figure を大きく見せられる。
 *
 * 図柄には手を加えない。切り分けと配置のみ行う。
 */
import { mkdirSync } from 'node:fs';

import sharp from 'sharp';

const SRC = 'assets/brand/source/logo-white.png';
const OUT = 'app/assets/brand';

mkdirSync(OUT, { recursive: true });

/** アイコンのタイル地色。起動画面もこれに合わせる。 */
const INK = { r: 0x0b, g: 0x19, b: 0x2f };

/**
 * 図柄と文字の境目を、画像そのものから探す。
 *
 * 座標を決め打ちにするとロゴを差し替えたときに崩れる。
 * 「左から見て最初に現れる、十分に長い空白の縦帯」を境目とみなす。
 */
async function findGap(src) {
  const img = sharp(src).ensureAlpha();
  const { width, height } = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });

  const filled = [];
  for (let x = 0; x < width; x++) {
    let n = 0;
    for (let y = 0; y < height; y++) {
      if (data[(y * width + x) * 4 + 3] > 16) n++;
    }
    filled.push(n);
  }

  let runStart = -1;
  for (let x = 0; x < width; x++) {
    if (filled[x] === 0) {
      if (runStart < 0) runStart = x;
      continue;
    }
    if (runStart >= 0) {
      const len = x - runStart;
      // 文字と文字の隙間を拾わないよう、幅と位置に下限を設ける
      if (len > width * 0.02 && runStart > width * 0.1) {
        return { markEnd: runStart, textStart: x, width, height };
      }
    }
    runStart = -1;
  }
  throw new Error('図柄と文字の境目が見つかりませんでした');
}

const gap = await findGap(SRC);
console.log(`元画像: ${gap.width}x${gap.height}`);
console.log(`  図柄 0..${gap.markEnd} / 文字 ${gap.textStart}..${gap.width}`);

/**
 * 切り出してから余白を落とす。
 *
 * 1つの流れに extract と trim を並べると、sharp は trim を先に適用する。
 * すると切り出す前に画像が縮み、こちらが求めた座標が範囲外になる
 * （extract_area: bad extract area）。2段階に分ける必要がある。
 */
async function cutAndTrim(src, area) {
  const cut = await sharp(src).extract(area).png().toBuffer();
  return sharp(cut).trim().png().toBuffer();
}

const mark = await cutAndTrim(SRC, {
  left: 0,
  top: 0,
  width: gap.markEnd,
  height: gap.height,
});

const wordmark = await cutAndTrim(SRC, {
  left: gap.textStart,
  top: 0,
  width: gap.width - gap.textStart,
  height: gap.height,
});

const markMeta = await sharp(mark).metadata();
const wordMeta = await sharp(wordmark).metadata();
console.log(`  切り出し: 図柄 ${markMeta.width}x${markMeta.height} / 文字 ${wordMeta.width}x${wordMeta.height}`);

/**
 * 縦組みに積み直す。
 *
 * 起動画面の画像は、端末の画面幅に対して 60〜70% ほどで表示される。
 * 図柄を大きく、文字はその下に控えめに置くと、小さく表示されても
 * 何のアプリか判別できる。
 */
const CANVAS = 1024;
const MARK_HEIGHT = 420;
const WORD_WIDTH = 720;
const GAP = 64;

const markScaled = await sharp(mark)
  .resize({ height: MARK_HEIGHT, fit: 'inside' })
  .png()
  .toBuffer();
const wordScaled = await sharp(wordmark)
  .resize({ width: WORD_WIDTH, fit: 'inside' })
  .png()
  .toBuffer();

const m = await sharp(markScaled).metadata();
const w = await sharp(wordScaled).metadata();

const totalHeight = m.height + GAP + w.height;
const top = Math.round((CANVAS - totalHeight) / 2);

// 起動画面は透過のまま置く。地色は app.json 側で指定するため、
// ここで塗ってしまうと、明るいテーマに切り替えた際に対応できない。
await sharp({
  create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([
    { input: markScaled, top, left: Math.round((CANVAS - m.width) / 2) },
    { input: wordScaled, top: top + m.height + GAP, left: Math.round((CANVAS - w.width) / 2) },
  ])
  .png()
  .toFile(`${OUT}/splash.png`);

console.log(`\n${OUT}/splash.png を作成しました（${CANVAS}x${CANVAS}）`);

// 確認用に、実際の見え方へ近づけた画像も残す
await sharp({
  create: { width: 1080, height: 1920, channels: 4, background: { ...INK, alpha: 1 } },
})
  .composite([{ input: await sharp(`${OUT}/splash.png`).resize(700).png().toBuffer(), gravity: 'center' }])
  .png()
  .toFile('tools/screenshots/splash-preview.png');

console.log('tools/screenshots/splash-preview.png に表示イメージを出力しました');
