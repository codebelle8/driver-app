/**
 * 管理画面の手順書を PDF にする。
 *
 *   node tools/build-manual-pdf.mjs
 *
 * **なぜ PDF か**
 *   お渡しする相手は運用される方で、git の中を見る方ではない。
 *   1ファイルで開けて、印刷でき、手元に置ける形にする。
 *
 * **画像は中へ埋め込む**（ご指示 2026-09-12）
 *   外部の参照にすると、**ファイルを1つ送っただけでは絵が出ない。**
 *   受け取った方が画像の置き場所ごと持っていなければ成り立たず、
 *   社内で転送されるうちに必ず壊れる。data URI にして中へ入れる。
 *
 * **出来上がりを測る**
 *   頁数と大きさを最後に出す。絵が抜けていれば大きさで分かる。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { chromium } from 'playwright';

const SRC = 'docs/14-admin-manual.md';
const OUT = 'docs/14-admin-manual.pdf';

const md = readFileSync(SRC, 'utf8');

/* marked は入れていない。使うときだけ取ってくる。 */
const body = execFileSync('npx', ['--yes', 'marked'], {
  input: md,
  encoding: 'utf8',
  shell: true,
  maxBuffer: 32 * 1024 * 1024,
});

/*
  見出しに印（id）を付ける。

  **付けないと、冒頭の目次が効かない。** marked は見出しに id を
  付けないため、`#3-施設を登録する` のような行き先がどこにも無く、
  押しても動かない紙になる。

  付け方は GitHub と同じ規則にする — 小文字にし、記号を落とし、
  空白を `-` にする。手順書の中の行き先はその書き方で書かれている。
*/
const slug = (text) =>
  text
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');

let anchored = 0;
const withIds = body.replace(/<(h[123])>([\s\S]*?)<\/h[123]>/g, (whole, tag, inner) => {
  anchored++;
  return `<${tag} id="${slug(inner)}">${inner}</${tag}>`;
});
console.log(`  見出し ${anchored} 件に印を付けました`);

/*
  画像を中へ埋め込む。

  相対の参照（images/admin/…）は、手順書のある場所から解く。
*/
let embedded = 0;
const inlined = withIds.replace(/src="([^"]+)"/g, (whole, src) => {
  if (/^(https?:|data:)/.test(src)) return whole;
  const file = join(dirname(SRC), src);
  const ext = src.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
  const b64 = readFileSync(file).toString('base64');
  embedded++;
  return `src="data:image/${ext};base64,${b64}"`;
});
console.log(`  画像を ${embedded} 枚、中へ埋め込みました`);

/*
  印刷のための体裁。

  * 見出しの直後で切らない（説明だけ次の頁へ残さない）
  * 画像と表は途中で割らない
  * 色は管理画面と揃える
*/
const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<style>
  :root{
    --text:#171c20; --muted:#5a666e; --border:#dde3e7; --surface2:#f2f5f6;
    --accent:#008000; --warn:#9a6410; --warn-soft:#fdf3e2;
  }
  @page { size: A4; margin: 16mm 14mm 18mm; }
  body{
    font-family:"Yu Gothic","Hiragino Kaku Gothic ProN","Meiryo",sans-serif;
    color:var(--text); font-size:10.5pt; line-height:1.85; margin:0;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  h1{ font-size:20pt; font-weight:800; margin:0 0 6mm; padding-bottom:3mm;
      border-bottom:2px solid var(--accent); }
  h2{ font-size:14pt; font-weight:800; margin:10mm 0 3mm; padding-left:3mm;
      border-left:4px solid var(--accent); break-after:avoid; break-inside:avoid; }
  h3{ font-size:11.5pt; font-weight:700; margin:6mm 0 2mm; color:var(--accent);
      break-after:avoid; }
  p{ margin:0 0 3mm; }
  ul,ol{ margin:0 0 3mm; padding-left:6mm; }
  li{ margin:0 0 1mm; }
  strong{ font-weight:800; }
  code{ font-family:"Consolas","Courier New",monospace; font-size:9.5pt;
        background:var(--surface2); padding:0 1mm; border-radius:2px; }
  pre{ background:var(--surface2); border:1px solid var(--border); border-radius:2mm;
       padding:3mm 4mm; overflow-x:auto; break-inside:avoid; }
  pre code{ background:none; padding:0; }
  table{ width:100%; border-collapse:collapse; margin:0 0 4mm; font-size:9.5pt;
         break-inside:avoid; }
  th{ text-align:left; background:var(--surface2); border:1px solid var(--border);
      padding:2mm 3mm; font-weight:700; }
  td{ border:1px solid var(--border); padding:2mm 3mm; vertical-align:top; }
  /*
    絵の高さに上限を置く。

    **置かないと、頁の下が大きく空く。** 見出しと絵を離さない決まりに
    してあるため、絵が入りきらないと組ごと次の頁へ送られ、前の頁の
    下半分が白く残る。上限を置けば同じ頁に収まり、紙が減る。

    横と縦の両方に上限を置くと、縦横の比は保たれたまま小さくなる。
  */
  img{ max-width:100%; max-height:92mm; height:auto; display:block;
       margin:2mm 0 4mm; border:1px solid var(--border); border-radius:2mm;
       break-inside:avoid; }
  hr{ border:0; border-top:1px solid var(--border); margin:6mm 0; }
  a{ color:var(--accent); text-decoration:none; }
  blockquote{ margin:0 0 3mm; padding:3mm 4mm; background:var(--warn-soft);
              border-left:3px solid var(--warn); break-inside:avoid; }
</style></head><body>${inlined}</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: OUT,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font-size:8pt;color:#8b969d;text-align:center;' +
      'font-family:sans-serif;padding-top:4mm;">' +
      '車寄せナビ 管理画面の使い方　<span class="pageNumber"></span> / <span class="totalPages"></span>' +
      '</div>',
  });
} finally {
  await browser.close();
}

const kb = (statSync(OUT).size / 1024).toFixed(0);
console.log(`  ${OUT}（${kb}KB）`);
