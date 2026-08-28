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
const APP = 'app/assets/brand';

const INK = { r: 0x0c, g: 0x1b, b: 0x2e }; // カラーガイドの濃紺

mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(ADMIN, { recursive: true });
mkdirSync(APP, { recursive: true });

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
/**
 * 余白を切り詰めて各サイズへ書き出す。
 * trim() が取り除くのは周囲の均一な縁だけで、図柄には触れない。
 */
async function exportLogo(srcPath, stem) {
  const trimmed = await sharp(srcPath).trim().png().toBuffer();
  const meta = await sharp(trimmed).metadata();

  await sharp(trimmed).toFile(`${OUT}/${stem}.png`);
  for (const h of [160, 80, 40]) {
    await sharp(trimmed)
      .resize({ height: h, fit: 'inside' })
      .png()
      .toFile(`${OUT}/${stem}-h${h}.png`);
  }

  // 背景が不透明だと、暗い（明るい）テーマで四角い下地が見えてしまう
  const stats = await sharp(trimmed).stats();
  const transparent =
    meta.hasAlpha && stats.channels.length === 4 && stats.channels[3].min < 250;

  console.log(
    `  ${stem}: ${meta.width}x${meta.height}  ` +
      `${transparent ? '背景透過あり' : '※背景が不透明（下地が四角く見えます）'}`,
  );
  return { width: meta.width, height: meta.height };
}

const logoMeta = await exportLogo(logoSrc, 'logo');

const whiteSrc = findSource('logo-white');
if (whiteSrc) {
  await exportLogo(whiteSrc, 'logo-white');
} else {
  console.log('  logo-white: 未提供（暗いテーマでは明るい下地に載せて表示します）');
}

const meta = logoMeta;
const trimmed = await sharp(logoSrc).trim().png().toBuffer();

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
  // 角丸タイルとして仕上がっている前提。透明な余白だけ落とす。
  iconArt = await sharp(iconSrc).trim().png().toBuffer();
  const im = await sharp(iconArt).metadata();
  console.log(`  余白を除いた寸法: ${im.width}x${im.height}`);

  // タイルの地色を拾う（左端から少し内側・高さ中央）。
  // 角の丸みで生じる隙間を同じ色で埋め、正方形の不透明な画像にする。
  const { data: edge } = await sharp(iconArt)
    .extract({
      left: Math.round(im.width * 0.08),
      top: Math.round(im.height * 0.5),
      width: 1,
      height: 1,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tile = { r: edge[0], g: edge[1], b: edge[2] };
  console.log(`  タイルの地色: rgb(${tile.r}, ${tile.g}, ${tile.b})`);

  const side = Math.max(im.width, im.height);
  for (const size of [1024, 512, 192, 180, 64, 32]) {
    // 透過ありは Web 用、不透明は申請用として使い分けられるよう両方出す
    const square = await sharp(iconArt)
      .resize(side, side, { fit: 'contain', background: { ...tile, alpha: 0 } })
      .resize(size, size)
      .png()
      .toBuffer();
    await sharp(square).toFile(`${OUT}/icon-${size}.png`);
  }

  // iOS/Android のストア提出用は透過不可のため、地色で塗り潰した版も用意する
  await sharp(iconArt)
    .resize(side, side, { fit: 'contain', background: { ...tile, alpha: 1 } })
    .flatten({ background: tile })
    .resize(1024, 1024)
    .png()
    .toFile(`${OUT}/icon-1024-opaque.png`);
  console.log('  icon-1024-opaque.png（ストア提出用・透過なし）');
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
const copies = [
  'logo.png',
  'logo-h160.png',
  'logo-h80.png',
  'logo-white.png',
  'logo-white-h160.png',
  'logo-white-h80.png',
  'icon-512.png',
  'icon-192.png',
  'icon-64.png',
  'icon-32.png',
];
for (const f of copies) {
  if (existsSync(`${OUT}/${f}`)) await sharp(`${OUT}/${f}`).toFile(`${ADMIN}/${f}`);
}

// --- アプリへ配置 ------------------------------------------------------------
//
// アプリは画面が小さく、端末によって画素密度が 1〜3 倍と幅がある。
// 表示する高さの3倍を用意しておけば、どの端末でも輪郭が甘くならない。
// ヘッダーで高さ 34 前後に置くため、160 の版を渡す。
for (const [from, to] of [
  ['logo-h160.png', 'logo.png'],
  ['logo-white-h160.png', 'logo-white.png'],
]) {
  if (existsSync(`${OUT}/${from}`)) {
    await sharp(`${OUT}/${from}`).toFile(`${APP}/${to}`);
  }
}

// アプリのアイコンは透過不可。ストア提出用と同じ不透明の版を使う。
if (existsSync(`${OUT}/icon-1024-opaque.png`)) {
  await sharp(`${OUT}/icon-1024-opaque.png`).toFile(`${APP}/icon.png`);
} else if (existsSync(`${OUT}/icon-1024.png`)) {
  await sharp(`${OUT}/icon-1024.png`).flatten({ background: INK }).toFile(`${APP}/icon.png`);
}

/**
 * Android の適応アイコン（adaptive icon）用の前景。
 *
 * 端末ごとに円形・角丸など異なる形で切り抜かれるため、
 * 図柄は中央の 6 割ほどに収める必要がある。外周まで描くと切れる。
 * 背景は app.json で濃紺を指定するので、ここは透過にする。
 */
{
  const size = 1024;
  const inner = Math.round(size * 0.58);
  const mark = iconSrc
    ? await sharp(iconSrc).trim().png().toBuffer()
    : await sharp(trimmed)
        .extract({ left: 0, top: 0, width: Math.min(meta.height, meta.width), height: meta.height })
        .trim()
        .png()
        .toBuffer();

  const art = await sharp(mark).resize({ width: inner, height: inner, fit: 'inside' }).png().toBuffer();
  const am = await sharp(art).metadata();

  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: art, top: Math.round((size - am.height) / 2), left: Math.round((size - am.width) / 2) },
    ])
    .png()
    .toFile(`${APP}/adaptive-icon.png`);
}

// 起動画面は図柄だけを中央に置く。文字を入れると端末の幅で折り返す。
await sharp(`${APP}/adaptive-icon.png`).toFile(`${APP}/splash-icon.png`);

// --- 「先頭へ戻る」ボタンの車 --------------------------------------------------
/**
 * ご提供いただいた車の画像を、ボタンに載る大きさへ書き出す。
 *
 * 元画像は 1322x1190 / 1.4MB あり、そのまま読み込むと
 * 44px の表示のために毎回 1.4MB を展開することになる。
 *
 * 表示するのは幅 44 前後。画素密度3倍の端末に合わせて 132 を用意する。
 * 図柄には手を加えず、周囲の余白の切り詰めと縮小のみ行う。
 */
/**
 * 尾灯を点灯させた版を作る。ボタンを押した瞬間に差し替えて使う。
 *
 * **元画像には手を加えず、別ファイルとして書き出す。**
 * 車寄せで停まる動作＝ブレーキなので、押したときに尾灯が赤く光る。
 *
 * 光らせる場所を座標で指定していない理由:
 *   画像を差し替えられたとき、座標指定だと見当違いの場所が光る。
 *   「赤が優勢な画素」を尾灯とみなせば、画像が変わっても追従する。
 *   この車では上部のハイマウント灯・左右の尾灯・バンパーの反射板の
 *   3か所が拾われる。
 */
async function exportBrakeLights(trimmedCar, cm) {
  const { data, info } = await sharp(trimmedCar)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  const lit = Buffer.from(data);
  // 光のにじみ。尾灯の位置だけ不透明な赤にして、あとでぼかす。
  const glow = Buffer.alloc(W * H * 4, 0);
  let count = 0;

  for (let i = 0; i < data.length; i += C) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (data[i + 3] < 128) continue;
    if (!(r > g + 40 && r > b + 40 && r > 90)) continue;

    count++;
    // 赤を振り切らせ、緑と青を落として彩度を上げる。
    // 元の明暗は残すため、緑と青は完全には消さない。
    lit[i] = 255;
    lit[i + 1] = Math.min(255, Math.round(g * 0.35 + 25));
    lit[i + 2] = Math.min(255, Math.round(b * 0.35 + 20));

    const j = (i / C) * 4;
    glow[j] = 255;
    glow[j + 1] = 30;
    glow[j + 2] = 20;
    glow[j + 3] = 255;
  }

  const litPng = await sharp(lit, { raw: { width: W, height: H, channels: C } })
    .png()
    .toBuffer();
  // 車体の外にはみ出さないよう、ぼかした光を元の形で切り抜く
  // にじみは2段構え。狭く強い芯と、広く淡いハロー。
  // ボタン上では車全体が 44px しかなく、尾灯は片側6px ほどしか無い。
  // 弱いにじみでは縮小した時点で消えてしまう。
  const core = await sharp(glow, { raw: { width: W, height: H, channels: 4 } })
    .blur(Math.max(2, Math.round(W / 55)))
    .png()
    .toBuffer();
  const halo = await sharp(glow, { raw: { width: W, height: H, channels: 4 } })
    .blur(Math.max(3, Math.round(W / 7)))
    .png()
    .toBuffer();

  // 重ねがけして、44px まで縮めても赤がはっきり残るようにする
  const braking = await sharp(litPng)
    .composite([
      ...Array.from({ length: 8 }, () => ({ input: halo, blend: 'screen' })),
      ...Array.from({ length: 4 }, () => ({ input: core, blend: 'screen' })),
    ])
    .png()
    .toBuffer();

  return { braking, count };
}

/**
 * 明るい配色のボタン用に、車の周りへ暗いふちを付ける。
 *
 * ご提供いただいた車体は白 (rgb(223,236,250))。明るい配色のボタン面も
 * ほぼ白のため、そのまま載せると車体の輪郭が消える。窓・タイヤ・尾灯だけが
 * 宙に浮いて見える状態になる。
 *
 * 車の形（不透明度）をぼかして暗く塗り、その上に車を重ねる。
 * はみ出した分だけがふちとして残り、白い面でも輪郭が読める。
 * **図柄そのものには手を加えていない。**
 */
async function withHalo(carPng, W) {
  const { data, info } = await sharp(carPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const shape = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
    shape[j] = 0x2a;
    shape[j + 1] = 0x35;
    shape[j + 2] = 0x3a;
    shape[j + 3] = data[i + 3];
  }
  const ring = await sharp(shape, { raw: { width: info.width, height: info.height, channels: 4 } })
    .blur(Math.max(2, Math.round(W / 55)))
    .png()
    .toBuffer();

  return sharp(ring)
    .composite([{ input: carPng }, { input: carPng }])
    .png()
    .toBuffer();
}

/** 4種類（暗い配色/明るい配色 × 消灯/点灯）を各サイズへ書き出す */
async function exportCarSet(trimmedCar, W) {
  const { braking, count } = await exportBrakeLights(trimmedCar, {});

  const set = {
    car: trimmedCar,
    'car-brake': braking,
    'car-light': await withHalo(trimmedCar, W),
    'car-light-brake': await withHalo(braking, W),
  };

  for (const [name, buf] of Object.entries(set)) {
    await sharp(buf).toFile(`${OUT}/${name}.png`);
    await sharp(buf).resize({ width: 132, fit: 'inside' }).png().toFile(`${APP}/${name}.png`);
    await sharp(buf).resize({ width: 96, fit: 'inside' }).png().toFile(`${ADMIN}/${name}.png`);
  }
  return count;
}

const carSrc = findSource('car');
if (carSrc) {
  const trimmedCar = await sharp(carSrc).trim().png().toBuffer();
  const cm = await sharp(trimmedCar).metadata();

  const carStats = await sharp(trimmedCar).stats();
  const carTransparent =
    cm.hasAlpha && carStats.channels.length === 4 && carStats.channels[3].min < 250;

  const litCount = await exportCarSet(trimmedCar, cm.width);

  console.log(`\n車の画像: ${carSrc}`);
  console.log(`  余白を切り詰めて ${cm.width}x${cm.height}`);
  console.log(`  背景の透過: ${carTransparent ? 'あり' : 'なし ★ 四角い下地が出ます'}`);
  console.log(`  尾灯の点灯版: ${litCount} 画素を赤く光らせました`);
  console.log('  car / car-brake（暗い配色用）');
  console.log('  car-light / car-light-brake（明るい配色用・輪郭にふち付き）');
  console.log(`  ${APP}/（幅132） と ${ADMIN}/（幅96） に配置`);
} else {
  console.log(`\n車の画像: ${SRC}/car.png が無いため、記号で代替します`);
}

console.log(`  ${APP}/ に logo / logo-white / icon / adaptive-icon / splash-icon を配置`);

console.log(`\n${OUT}/ と ${ADMIN}/ に書き出しました。`);
console.log('図柄には手を加えていません（余白の切り詰めと拡大縮小のみ）。');
