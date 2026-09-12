/**
 * 顔写真の差し替えを、通しで見る。
 *
 *   node tools/test-avatar.mjs                        手元の書き出し
 *   node tools/test-avatar.mjs http://localhost:4190
 *
 * **なぜ要るか**
 *   ここは一度、実際に壊れた場所にあたる。**写真を選んでも画面が
 *   変わらなかった**（ご報告 2026-09-08）。原因は、窓へ戻ってから
 *   選ばれた中身を見に行くまでの間が短すぎ、入力欄ごと片付けて
 *   いたこと。直したあと、再発を止める仕掛けが何も無かった。
 *
 *   あわせて、ご指示（同日）で「選んだ時点では変えず、OK を押して
 *   から変える」形にしてある。**やめれば元のまま**であることも見る。
 *
 * 見るのは6つ。
 *   1. 選ぶと、丸に映る（送る前）
 *   2. その時点ではサーバーに送られていない
 *   3. やめると、元のままに戻る
 *   4. OK を押すと、置き場所と名簿の両方に入る
 *   5. 上部の帯の丸も、写真に変わる
 *   6. 外すと、置き場所からも名簿からも消える
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:4190').replace(/\/$/, '');
const conn = connect();

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label} ${detail}`);
  }
};

/** 名簿に控えられている写真の在り処 */
const avatarPathOf = async (userId) => {
  const r = await fetch(
    `${conn.url}/rest/v1/driver_profiles?user_id=eq.${userId}&select=avatar_path`,
    { headers: conn.svc },
  );
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0].avatar_path : undefined;
};

/** 置き場所に残っている枚数 */
const storedCount = async (userId) => {
  const r = await fetch(`${conn.url}/storage/v1/object/list/avatars`, {
    method: 'POST',
    headers: conn.svc,
    body: JSON.stringify({ prefix: `${userId}/`, limit: 50 }),
  });
  const j = await r.json();
  return Array.isArray(j) ? j.length : -1;
};

/*
  検査に使う画像。

  その場で作る。持ち込みのファイルに頼ると、置き場所が変わるたびに
  この検査が動かなくなる。色を変えた2枚を用意し、差し替わったことを
  中身で見分けられるようにしておく。
*/
const pngOf = (r, g, b) => {
  const crcTable = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, tail]);
  };

  const W = 64;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(W, 4);
  ihdr[8] = 8; // 8bit
  ihdr[9] = 2; // truecolor
  const raw = Buffer.alloc(W * (1 + W * 3));
  for (let y = 0; y < W; y++) {
    const row = y * (1 + W * 3);
    raw[row] = 0;
    for (let x = 0; x < W; x++) {
      const at = row + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }
  const { deflateSync } = require('node:zlib');
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let browser = null;
let member = null;

try {
  console.log(`顔写真の差し替えの検査: ${BASE}\n`);
  member = await createMember(conn, 'avatar');
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();

  await signInOn(page, BASE, member, { goto: '/' });
  await page.waitForTimeout(3000);

  const openAccount = async () => {
    await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    await skipIntro(page);
  };
  await openAccount();

  check('はじめは写真が無い', (await avatarPathOf(member.userId)) === null, String(await avatarPathOf(member.userId)));
  check('置き場所も空', (await storedCount(member.userId)) === 0);

  /*
    写真を選ぶ。

    入力欄はその場で作られ、画面の外に置かれている。押した瞬間に
    現れるので、待ち受けてから渡す。
  */
  const choose = async (buf) => {
    const waiting = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '写真を選ぶ' }).click();
    const chooser = await waiting;
    await chooser.setFiles({ name: 'face.png', mimeType: 'image/png', buffer: buf });
    await page.waitForTimeout(3500);
  };

  // --- 1〜2. 選ぶと丸に映る。まだ送らない -------------------------------------
  console.log('\n--- 選んだとき ---');
  await choose(pngOf(220, 40, 40));

  let body = await page.locator('body').innerText();
  check('OK とやめるが出る', body.includes('OK') && body.includes('やめる'), body.slice(0, 120));
  check(
    '丸に選んだ写真が映る',
    (await page.locator('img[src^="blob:"]').count()) > 0,
    `blob の画像 ${await page.locator('img[src^="blob:"]').count()} 枚`,
  );
  check('まだ名簿に入っていない', (await avatarPathOf(member.userId)) === null);
  check('まだ置き場所にも入っていない', (await storedCount(member.userId)) === 0);

  /*
    実際に起きた不具合そのもの。

    **ブラウザは「窓へ戻った（focus）」を先に、「選ばれた（change）」を
    後から出す。** 以前はここを 500ms で見切っており、間に合わない
    うちに入力欄ごと片付けていた。写真を選んでも何も起きなかった。

    Playwright は setFiles で change をすぐ出すため、普通に操作しても
    この順番にならない。**先に focus を出し、少し置いてから渡す**ことで、
    実際の順番を作る。ここを短くすると、この項目だけが落ちる。
  */
  console.log(`\n--- 窓へ戻ってから写真が届くとき ---`);
  await page.getByRole('button', { name: 'やめる' }).click();
  await page.waitForTimeout(1200);

  {
    const waiting = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '写真を選ぶ' }).click();
    const chooser = await waiting;

    // 窓へ戻る。まだ写真は届いていない。
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(400);

    // ここで届く。片付けられていれば、受け取れない。
    const handed = await chooser
      .setFiles({ name: 'late.png', mimeType: 'image/png', buffer: pngOf(240, 200, 20) })
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(3500);

    check('遅れて届いた写真も受け取れる', handed, '入力欄が片付けられていた');
    check(
      '遅れて届いても丸に映る',
      (await page.locator('img[src^="blob:"]').count()) > 0,
      '何も起きなかった',
    );
  }

  // --- 3. やめる ---------------------------------------------------------------
  console.log('\n--- やめたとき ---');
  await page.getByRole('button', { name: 'やめる' }).click();
  await page.waitForTimeout(1500);
  check('丸が元に戻る', (await page.locator('img[src^="blob:"]').count()) === 0);
  check('やめても何も送られていない', (await storedCount(member.userId)) === 0);
  check('「写真を選ぶ」に戻る', (await page.getByRole('button', { name: '写真を選ぶ' }).count()) > 0);

  // --- 4〜5. OK を押す ---------------------------------------------------------
  console.log('\n--- OK を押したとき ---');
  await choose(pngOf(30, 120, 220));
  await page.getByRole('button', { name: 'OK' }).click();
  await page.waitForTimeout(6000);

  const path = await avatarPathOf(member.userId);
  check('名簿に在り処が入る', typeof path === 'string' && path.startsWith(`${member.userId}/`), String(path));
  check('置き場所に1枚ある', (await storedCount(member.userId)) === 1, `${await storedCount(member.userId)} 枚`);

  body = await page.locator('body').innerText();
  check('変えたことが伝わる', body.includes('顔写真を変えました') || !body.includes('やめる'), body.slice(0, 100));

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await skipIntro(page);
  check(
    '上部の帯の丸も写真になる',
    (await page.locator('img[src*="/storage/v1/object"]').count()) > 0,
    `写真の丸 ${await page.locator('img[src*="/storage/v1/object"]').count()} 個`,
  );

  // --- 6. 外す -----------------------------------------------------------------
  console.log('\n--- 外したとき ---');
  await openAccount();
  await page.getByRole('button', { name: '外す' }).click();
  await page.waitForTimeout(6000);

  check('名簿から消える', (await avatarPathOf(member.userId)) === null, String(await avatarPathOf(member.userId)));
  check('置き場所からも消える', (await storedCount(member.userId)) === 0, `${await storedCount(member.userId)} 枚残っている`);
} finally {
  console.log('\n--- 後片付け ---');
  check('検査で作った会員を消した', await removeMember(conn, member));

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
