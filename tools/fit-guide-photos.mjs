/**
 * 発注元からお預かりした写真を、紹介サイトの置き場所に合わせて切り取り、縮小する。
 *
 *   npx serve -l 4300 site           （別の窓で）
 *   node tools/fit-guide-photos.mjs
 *
 * ご指示（2026-09-21）「画像を用意したので、自然に見える大きさにしてほしい」。
 *
 * **原本は `site/assets/people/source/` に置いたまま触らない。** ここから
 * 切り取って、表示の2倍の大きさで書き出す（画面が細かい端末でもぼけない）。
 * 原本を差し替えたら、この道具を流し直せば差し替わる。
 *
 * **原本は配らない**（`site/.vercelignore` で除いてある）。1枚 1.4〜1.7MB あり、
 * 配ると開くのが遅くなる。
 *
 * 切り取りは、人物が枠いっぱいに入るように決めている（黒い余白を減らす）。
 * 数字は原本（人物は 1024×1536、作例は 1536×1024）の中の位置。
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4300/';
const DIR = 'site/assets/people';

/** 原本・切り取る四角［x, y, 幅, 高さ］・書き出す大きさ・書き出す名前 */
const FITS = [
  {
    from: 'guide-show.png',
    rect: [150, 0, 874, 874],
    out: [760, 760],
    name: 'guide-faq.jpg',
    what: 'よくあるご質問：指し棒で説明している（正方形）',
  },
  {
    from: 'guide-stand.png',
    rect: [170, 0, 825, 1100],
    out: [620, 827],
    name: 'guide-hero.jpg',
    what: '最初の画面：両手で迎える（縦長 3:4）',
  },
  {
    from: 'guide-walk.png',
    rect: [160, 0, 825, 1100],
    out: [560, 747],
    name: 'guide-area-left.jpg',
    what: '対応エリアの左：アプリの記号を持って指さす（縦長 3:4）',
  },
  {
    from: 'guide-stand.png',
    rect: [90, 0, 860, 860],
    out: [640, 640],
    name: 'guide-area-right.jpg',
    what: '対応エリアの右：両手で迎える（上半身・正方形）',
  },
  {
    from: '17.png',
    rect: [60, 30, 1420, 947],
    out: [1100, 733],
    name: 'app-devices.jpg',
    what: 'ご利用の流れ：パソコンとスマートフォンの作例（横長 3:2）',
  },
];

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });

for (const fit of FITS) {
  const data = await page.evaluate(async (o) => {
    const img = new Image();
    img.src = `assets/people/source/${o.from}`;
    await img.decode();
    const [x, y, w, h] = o.rect;
    const [ow, oh] = o.out;
    const canvas = document.createElement('canvas');
    canvas.width = ow;
    canvas.height = oh;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, x, y, w, h, 0, 0, ow, oh);
    return canvas.toDataURL('image/jpeg', 0.86);
  }, fit);
  const bytes = Buffer.from(data.split(',')[1], 'base64');
  writeFileSync(`${DIR}/${fit.name}`, bytes);
  console.log(`${fit.name.padEnd(21)} ${fit.out.join('x').padEnd(9)} ${String(Math.round(bytes.length / 1024)).padStart(4)}KB  ${fit.what}`);
}

await browser.close();
