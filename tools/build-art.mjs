/**
 * 画面に敷く写真を、配信に適した大きさへ整える。
 *
 *   node tools/build-art.mjs
 *
 * **なぜ要るか**
 *   いただいた原本は1枚で 2.5MB あった。上部は複数枚を順に入れ替えるため、
 *   そのままだと10MBを超える。飾りの絵のために、施設を探す画面の
 *   表示を待たせる理由はない。
 *
 * **やること**
 *   1. app/public/art/ に置かれた写真を見つける
 *   2. 原本を assets/art/ へ移す（受け渡し用の控え。配信には含めない）
 *   3. 表示に要る大きさの .jpg を app/public/art/ へ書き出す
 *
 * **何度実行しても壊れない**
 *   2回目以降は、既に整えたものを原本と取り違えないようにしている。
 *   取り違えると、控えてある原本が縮んだものに置き換わって戻せなくなる。
 *
 * **なぜ .jpg にするか**
 *   いずれも写真で、透ける部分を持たない。PNG は写真に向かず、
 *   同じ見え方でも数倍の大きさになる。
 *
 * **大きさの決め方**
 *   画面上の表示幅の2倍を目安にしている。高精細な画面では1点を
 *   2つの画素で描くため、等倍だと輪郭が甘くなる。
 *     hero … 1920px の画面で幅およそ 865px → 1800px
 *     rail … 幅 256px 固定             → 620px
 */
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import sharp from 'sharp';

const PUBLIC = 'app/public/art';
const ORIGINALS = 'assets/art';

/** 出力の設計。名前と、書き出す幅。 */
const TARGETS = [
  // 上部は順に入れ替える。置かれているものだけを処理する。
  { name: 'hero-1', width: 1800 },
  { name: 'hero-2', width: 1800 },
  { name: 'hero-3', width: 1800 },
  { name: 'hero-4', width: 1800 },
  { name: 'hero-5', width: 1800 },
  // 番号で分ける前の1枚。番号付きが1枚も無いときの受け皿。
  { name: 'hero', width: 1800 },
  { name: 'rail', width: 620 },
];

mkdirSync(ORIGINALS, { recursive: true });

/** 既に控えてある原本があるか */
const hasOriginal = (name) =>
  readdirSync(ORIGINALS).some((f) => f.toLowerCase().startsWith(name + '.'));

const kb = (n) => (n / 1024).toFixed(0) + 'KB';

let done = 0;
let skipped = 0;

for (const t of TARGETS) {
  /*
    原本を探す。

    拡張子は決め打ちにしない。ご提供いただく形式は .png のことも
    .jpg のこともあり、名前が合っていれば受け取れるようにしておく。
  */
  const source = readdirSync(PUBLIC).find(
    (f) => f.toLowerCase().startsWith(t.name + '.') && /\.(png|jpe?g|webp)$/i.test(f),
  );
  if (!source) continue;

  /*
    既に整えたものを、もう一度縮めない。

    出力は必ず .jpg で、原本は assets/art/ へ移してある。
    「公開側が .jpg」かつ「控えが既にある」なら、それは前回の出力にあたる。
    そのまま処理すると、縮んだものが原本として控えに上書きされ、
    元の解像度へ戻せなくなる。
  */
  if (extname(source).toLowerCase() === '.jpg' && hasOriginal(t.name)) {
    skipped++;
    continue;
  }

  const src = join(PUBLIC, source);
  const out = join(PUBLIC, `${t.name}.jpg`);

  /*
    書き出す前に原本を退避する。

    原本が .jpg で出力先も .jpg の場合、同じファイルを読みながら
    書くことになり、中身が壊れる。
  */
  const kept = join(ORIGINALS, `${t.name}${extname(source)}`);
  renameSync(src, kept);

  const info = await sharp(kept).metadata();
  const beforeBytes = statSync(kept).size;
  await sharp(kept)
    // 元より大きくはしない。引き伸ばしても情報は増えず、重くなるだけ。
    .resize({ width: Math.min(t.width, info.width ?? t.width), withoutEnlargement: true })
    .jpeg({ quality: 78, progressive: true, mozjpeg: true })
    .toFile(out);

  const after = await sharp(out).metadata();
  const afterBytes = statSync(out).size;
  console.log(
    `  ${t.name.padEnd(7)} ${info.width}x${info.height} ${kb(beforeBytes)}` +
      ` → ${after.width}x${after.height} ${kb(afterBytes)}`,
  );
  done++;
}

// --- 結果 ---------------------------------------------------------------------
const slides = TARGETS.filter((t) => t.name.startsWith('hero-')).filter((t) =>
  existsSync(join(PUBLIC, `${t.name}.jpg`)),
);

console.log('');
if (done > 0) console.log(`  ${done} 枚を整え、原本を ${ORIGINALS}/ へ控えました`);
if (skipped > 0) console.log(`  ${skipped} 枚は整え済みのため触れていません`);
if (done === 0 && skipped === 0) {
  console.log(`  ${PUBLIC}/ に写真を置いてから実行してください。`);
  console.log('  名前は hero-1〜hero-5 と rail（拡張子は .png / .jpg のどちらでも）。');
}

if (done > 0 || skipped > 0) {
  console.log('');
  console.log(`  上部の入れ替え表示: ${slides.length} 枚`);
  if (slides.length < 4) {
    const missing = TARGETS.filter((t) => t.name.startsWith('hero-'))
      .filter((t) => !existsSync(join(PUBLIC, `${t.name}.jpg`)))
      .map((t) => t.name);
    console.log(`  未設置: ${missing.join(', ')}（置かれた枚数だけで回ります）`);
  }
  if (!existsSync(join(PUBLIC, 'rail.jpg'))) {
    console.log('  左メニューの絵（rail）は未設置です。');
  }
}
