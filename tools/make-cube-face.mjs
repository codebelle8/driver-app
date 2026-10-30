/**
 * 紹介サイトの最初の画面の、回るキューブの面の絵を作る。
 *
 *   npx serve -l 4300 site        （別の窓で）
 *   node tools/make-cube-face.mjs
 *
 * できるもの: site/assets/brand/cube-face.webp（1024 × 1024）
 *
 * **アプリのアイコン（site/assets/brand/icon.png）から作る。** アイコンの地は
 * サイトの紺（#0b192f）と同じ色なので、その紺の上にロゴを置いた正方形にする。
 * キューブでは、この1枚を 3 × 3 の札に分けて各面に貼る。
 *
 *   * アイコンの縁（角の丸い枠の線）は入れない。縁の線より内側だけを、ぼかした
 *     枠で切り抜いて置く。地は縁のあたりのアイコンと同じ色なので、切れ目は見えない
 *   * ロゴの高さは面の 76%。真ん中の札に、屋根と車がそっくり入る大きさ
 *     （上の札の目印の先と、下の札の矢印の先は、札の間で少し切れる）
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? 'http://localhost:4300/').replace(/\/?$/, '/');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../site/assets/brand/cube-face.webp');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(BASE);
  const url = await page.evaluate(async () => {
    const icon = new Image();
    icon.src = 'assets/brand/icon.png';
    await icon.decode();

    const SIZE = 1024;
    /* ロゴの中心（アイコンの中での位置）と、縮める割合 */
    const EMBLEM = { x: 506.5, y: 481.5 };
    const SCALE = 0.94;
    /* アイコンの縁より内側（ここだけを使う） */
    const INNER = { x: 62, y: 16, w: 896, h: 930, r: 130 };
    const FEATHER = 18;

    /* 縁の内側だけを切り抜いたアイコン */
    const cut = document.createElement('canvas');
    cut.width = cut.height = SIZE;
    const c = cut.getContext('2d');
    c.drawImage(icon, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    c.filter = `blur(${FEATHER}px)`;
    c.beginPath();
    c.roundRect(INNER.x + FEATHER, INNER.y + FEATHER, INNER.w - FEATHER * 2, INNER.h - FEATHER * 2, INNER.r);
    c.fill();

    const face = document.createElement('canvas');
    face.width = face.height = SIZE;
    const g = face.getContext('2d');
    /* アイコンの地の、縁のあたりと同じ紺（アイコンの地は、縁へ向かって少し暗い）。
       下へ向かって、アイコンと同じだけ少し沈む */
    const sky = g.createLinearGradient(0, 0, 0, SIZE);
    sky.addColorStop(0, 'rgb(9, 23, 43)');
    sky.addColorStop(1, 'rgb(8, 21, 39)');
    g.fillStyle = sky;
    g.fillRect(0, 0, SIZE, SIZE);
    g.setTransform(SCALE, 0, 0, SCALE, SIZE / 2 - EMBLEM.x * SCALE, SIZE / 2 - EMBLEM.y * SCALE);
    g.drawImage(cut, 0, 0);
    return face.toDataURL('image/webp', 0.92);
  });
  writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
  console.log(OUT);
} finally {
  await browser.close();
}
