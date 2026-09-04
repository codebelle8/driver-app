/**
 * 画面に敷く写真を、配信に適した大きさへ整える。
 *
 *   node tools/build-art.mjs
 *
 * **なぜ要るか**
 *   いただいた原本は hero が 1812×868 / 2.5MB、rail が 1038×1516 / 2.0MB。
 *   合わせて 4.5MB あり、そのまま配ると最初の表示が目に見えて遅くなる。
 *   飾りの絵のために、施設を探す画面の表示を待たせる理由はない。
 *
 * **やること**
 *   1. app/public/art/ に置かれた hero.* / rail.* を見つける
 *   2. 原本を assets/art/ へ移す（受け渡し用の控え。配信には含めない）
 *   3. 表示に要る大きさの .jpg を app/public/art/ へ書き出す
 *
 * **なぜ .jpg にするか**
 *   どちらも写真で、透ける部分を持たない。PNG は写真に向かず、
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
  { name: 'hero', width: 1800 },
  { name: 'rail', width: 620 },
];

mkdirSync(ORIGINALS, { recursive: true });

let done = 0;

for (const t of TARGETS) {
  /*
    原本を探す。

    拡張子は決め打ちにしない。ご提供いただく形式は .png のことも
    .jpg のこともあり、名前が合っていれば受け取れるようにしておく。
  */
  const source = readdirSync(PUBLIC).find(
    (f) => f.toLowerCase().startsWith(t.name + '.') && /\.(png|jpe?g|webp)$/i.test(f),
  );

  if (!source) {
    console.log(`  ${t.name}: 原本が見つかりません（${PUBLIC}/${t.name}.png など）`);
    continue;
  }

  const src = join(PUBLIC, source);
  const out = join(PUBLIC, `${t.name}.jpg`);

  /*
    書き出す前に原本を退避する。

    原本が hero.jpg で出力先も hero.jpg の場合、同じファイルを
    読みながら書くことになり、中身が壊れる。
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
  const kb = (n) => (n / 1024).toFixed(0) + 'KB';
  console.log(
    `  ${t.name}: ${info.width}x${info.height} ${kb(beforeBytes)}` +
      ` → ${after.width}x${after.height} ${kb(afterBytes)}`,
  );
  console.log(`         原本を ${kept} へ移しました`);
  done++;
}

if (done === 0) {
  console.log('');
  console.log(`  ${PUBLIC}/ に hero.png と rail.png を置いてから実行してください。`);
} else if (!existsSync(join(PUBLIC, 'hero.jpg')) || !existsSync(join(PUBLIC, 'rail.jpg'))) {
  console.log('');
  console.log('  片方だけです。もう1枚が揃うと、両方が画面に出ます。');
}
