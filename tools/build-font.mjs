/**
 * 見出しに使う書体を、必要な文字だけ取り出して控える。
 *
 *   node tools/build-font.mjs
 *
 * **なぜ絞るか**
 *   日本語の書体は全文字を持つと数MBある。使うのは上部の見出し
 *   「行きたい場所を見つけよう」の12文字だけで、そのために数MBを
 *   配るのは釣り合わない。Google Fonts は必要な文字だけを取り出した
 *   ものを返せるため、それを控えて自前で配る。
 *
 * **なぜ自前で配るか**
 *   1. オフラインでも出る。このアプリは電波の悪い場所で使われる。
 *      外部から読む作りだと、圏外では既定の書体に戻ってしまう。
 *   2. 見に来た方の接続先が1つ減る。地図は Google を使うが、
 *      文字のためにもう1本つなぐ理由はない。
 *
 * **書体の選び方**
 *   Zen Maru Gothic（大平善道さんによる丸ゴシック）。
 *   角を丸めた書体は、日本では親しみを出す場面で古くから使われている。
 *   崩し過ぎず、業務で使う画面の落ち着きも保てる。
 */
import { mkdirSync, writeFileSync } from 'node:fs';

/** 見出しの文字。ここに無い文字は表示できない（既定の書体に戻る）。 */
const TEXT = '行きたい場所を見つけよう';

const FAMILY = 'Zen Maru Gothic';
const WEIGHT = 700;
const OUT = 'app/public/fonts';
const NAME = 'zen-maru-gothic-heading';

const css = await fetch(
  'https://fonts.googleapis.com/css2' +
    `?family=${encodeURIComponent(FAMILY)}:wght@${WEIGHT}` +
    `&text=${encodeURIComponent(TEXT)}&display=swap`,
  {
    // woff2 で返してもらう。指定しないと truetype になり、数倍重くなる。
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },
  },
).then((r) => r.text());

const url = css.match(/url\((https:\/\/[^)]+)\)/)?.[1];
if (!url) {
  console.error('  書体の在り処を読み取れませんでした');
  console.error(css.slice(0, 400));
  process.exit(1);
}

const format = css.match(/format\('([^']+)'\)/)?.[1] ?? 'woff2';
const ext = format === 'woff2' ? 'woff2' : 'ttf';

const bin = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/${NAME}.${ext}`, bin);

console.log(`  ${FAMILY} ${WEIGHT}`);
console.log(`  文字: ${TEXT}（${[...new Set(TEXT)].length} 種）`);
console.log(`  → ${OUT}/${NAME}.${ext}  ${(bin.length / 1024).toFixed(1)}KB  形式 ${format}`);
console.log('');
console.log('  app/public/index.html の @font-face が、この名前を指しています。');
