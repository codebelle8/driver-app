/**
 * 紹介サイトに載せる「案内役」の写真を、立ち上がりの動画から切り出す。
 *
 *   npx serve -l 4300 site           （別の窓で）
 *   node tools/make-guide-photos.mjs
 *
 * ご指示（2026-09-21）「空いているところに、説明しているように見える
 * 女性の写真を入れてほしい」。**写真は新たに用意せず、発注元からお預かり
 * している立ち上がりの動画（`site/assets/intro/`）のコマを使う。** 権利の
 * 出どころが動画と同じで、写っている人も、車も、アプリの画面も同じになる。
 *
 * **Edge で切り出す。** 同梱の Chromium は H.264 の動画を読めない。
 * 動画を差し替えたら、この道具を流し直して写真を作り直す。
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4300/';
const OUT = 'site/assets/people';

/** 切り出す位置（動画・秒・元映像 864×496 の中の四角・書き出す名前） */
const SHOTS = [
  {
    file: '2.mp4',
    at: 5.0,
    rect: [205, 0, 496, 496],
    name: 'guide-show.jpg',
    what: 'アプリの画面を見せながら話している（よくあるご質問・対応エリア）',
  },
  {
    file: '1.mp4',
    at: 0.0,
    rect: [330, 0, 372, 496],
    name: 'guide-stand.jpg',
    what: '建物から出てくる立ち姿（最初の画面）',
  },
  {
    file: '1.mp4',
    at: 1.26,
    rect: [420, 0, 372, 496],
    name: 'guide-walk.jpg',
    what: '歩きながら前を見ている（対応エリア）',
  },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });

for (const shot of SHOTS) {
  const data = await page.evaluate(async ({ file, at, rect }) => {
    const video = document.createElement('video');
    video.muted = true;
    video.src = `assets/intro/${file}`;
    await new Promise((done) => {
      video.onloadeddata = done;
    });
    video.currentTime = Math.min(at, video.duration - 0.05);
    await new Promise((done) => {
      video.onseeked = done;
    });
    const [x, y, w, h] = rect;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, x, y, w, h, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.92);
  }, shot);
  const bytes = Buffer.from(data.split(',')[1], 'base64');
  writeFileSync(`${OUT}/${shot.name}`, bytes);
  console.log(`${shot.name}  ${shot.rect[2]}x${shot.rect[3]}  ${Math.round(bytes.length / 1024)}KB  ${shot.what}`);
}

await browser.close();
