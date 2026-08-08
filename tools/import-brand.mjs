/**
 * ご提供いただいたロゴ画像を、そのまま各サイズへ書き出す。
 *
 *   node tools/import-brand.mjs
 *
 * 置き場所:
 *   assets/brand/source/logo.png   … 横組みロゴ（必須）
 *   assets/brand/source/icon.png   … アプリアイコン（任意）
 *
 * icon.png が無い場合は、ロゴ左側のマーク部分を切り出し、
 * 角丸の濃紺タイルに載せてアイコンを作る。
 *
 * 図柄には一切手を加えない。余白の切り詰めと拡大縮小のみ行う。
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import sharp from 'sharp';

const SRC = 'assets/brand/source';
const OUT = 'assets/brand';
const ADMIN = 'admin/public/brand';

const INK = { r: 0x0c, g: 0x1b, b: 0x2e }; // カラーガイドの濃紺

mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(ADMIN, { recursive: true });

/** source/ から名前で1件探す（拡張子は問わない） */
function findSource(stem) {
  const files = readdirSync(SRC).filter(
    (f) => basename(f, extname(f)).toLowerCase() === stem && /\.(png|jpe?g|webp|svg)$/i.test(f),
  );
  return files.length ? join(SRC, files[0]) : null;
}

const logoSrc = findSource('logo');
const iconSrc = findSource('icon');

if (!logoSrc) {
  console.error(`
${SRC}/ に logo.png がありません。

  1. ロゴ画像を  ${SRC}\\logo.png  として保存してください
     （アイコンが別画像であれば ${SRC}\\icon.png も）
  2. もう一度  npm run brand:import  を実行してください

  ※ 背景を透過した PNG があれば、そちらを置いてください。
     暗いテーマでも背景の白い四角が出ずに済みます。
`);
  process.exit(1);
}

console.log(`元画像: ${logoSrc}`);

// --- ロゴ -------------------------------------------------------------------
// trim() は周囲の余白（単色の縁）だけを取り除く。図柄には触れない。
const trimmed = await sharp(logoSrc).trim().png().toBuffer();
const meta = await sharp(trimmed).metadata();
console.log(`  余白を除いた寸法: ${meta.width}x${meta.height}`);

await sharp(trimmed).toFile(`${OUT}/logo.png`);

// 表示用の高さ違い。横幅は縦横比を保って自動計算される。
for (const h of [160, 80, 40]) {
  await sharp(trimmed)
    .resize({ height: h, fit: 'inside', withoutEnlargement: false })
    .png()
    .toFile(`${OUT}/logo-h${h}.png`);
}
console.log('  logo.png / logo-h160.png / logo-h80.png / logo-h40.png');

// 背景が不透明かどうかを調べる。白背景のままだと暗いテーマで白い箱に見える。
const stats = await sharp(trimmed).stats();
const hasAlpha = meta.hasAlpha && stats.channels.length === 4 && stats.channels[3].min < 250;
if (!hasAlpha) {
  console.log(
    '  ※ 背景が不透明です。暗いテーマでは白い下地カードに載せて表示します。',
  );
}

// --- アイコン ---------------------------------------------------------------
/** 角丸タイルに図柄を載せてアイコンを作る */
async function buildIcon(inputBuffer, size) {
  const pad = Math.round(size * 0.16);
  const inner = size - pad * 2;

  const art = await sharp(inputBuffer)
    .resize({ width: inner, height: inner, fit: 'contain', background: { ...INK, alpha: 0 } })
    .toBuffer();

  const radius = Math.round(size * 0.2237); // iOS の角丸に近い比率
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );

  return sharp({
    create: { width: size, height: size, channels: 4, background: { ...INK, alpha: 1 } },
  })
    .composite([
      { input: art, top: pad, left: pad },
      { input: mask, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
}

let iconArt;
if (iconSrc) {
  console.log(`アイコン元画像: ${iconSrc}`);
  // 既に角丸タイルとして仕上がっている前提。余白だけ落としてそのまま使う。
  iconArt = await sharp(iconSrc).trim().png().toBuffer();
  for (const size of [1024, 512, 192, 180, 64, 32]) {
    await sharp(iconArt)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(`${OUT}/icon-${size}.png`);
  }
} else {
  // ロゴ左側の正方形をマークとみなして切り出す
  const side = meta.height;
  const mark = await sharp(trimmed)
    .extract({ left: 0, top: 0, width: Math.min(side, meta.width), height: side })
    .trim()
    .png()
    .toBuffer();
  console.log('アイコン元画像: 指定なし → ロゴ左側のマークを切り出して生成');

  for (const size of [1024, 512, 192, 180, 64, 32]) {
    const buf = await buildIcon(mark, size);
    await sharp(buf).toFile(`${OUT}/icon-${size}.png`);
  }
}
console.log('  icon-1024/512/192/180/64/32.png');

// --- 管理画面へ配置 ----------------------------------------------------------
const copies = ['logo.png', 'logo-h160.png', 'logo-h80.png', 'icon-512.png', 'icon-192.png', 'icon-64.png', 'icon-32.png'];
for (const f of copies) {
  if (existsSync(`${OUT}/${f}`)) await sharp(`${OUT}/${f}`).toFile(`${ADMIN}/${f}`);
}

console.log(`\n${OUT}/ と ${ADMIN}/ に書き出しました。`);
console.log('図柄には手を加えていません（余白の切り詰めと拡大縮小のみ）。');
