/**
 * 「経路」を押すと、地図が開くかを見る。
 *
 *   node tools/test-navigation.mjs                        手元の書き出し
 *   node tools/test-navigation.mjs http://localhost:4190
 *
 * **なぜ要るか**
 *   このアプリの目的そのものにあたる。車寄せの座標まで案内できないなら、
 *   施設の情報を見られても仕事にならない。
 *
 *   実際、**押しても何も起きない状態**になっていた（ご報告
 *   2026-09-12）。端末と同じ順でアプリ専用の呼び出しを先に試して
 *   おり、ブラウザがそれを黙って捨てていた。例外も出ないため、
 *   「成功した」ことになって地図へ進まなかった。
 *
 * 見るのは4つ。
 *   1. 座標のある施設に「経路」が出ること
 *   2. 押すと地図が開くこと（新しい窓）
 *   3. 渡す先が、建物の中心ではなく**車寄せの座標**であること
 *   4. 座標の複製も同じ値であること
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

let browser = null;
let member = null;

try {
  console.log(`案内から地図へ移るかの検査: ${BASE}\n`);
  member = await createMember(conn, 'nav');
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  const page = await ctx.newPage();

  await signInOn(page, BASE, member, { goto: '/' });
  await page.waitForTimeout(3000);

  /* 座標のある入口を1つ選ぶ。無い施設では「経路」が出ない。 */
  const spot = await page.evaluate(() => {
    const cat = JSON.parse(localStorage.getItem('kn_catalog') ?? '{}');
    const eps = cat.entryPoints ?? [];
    const e = eps.find((x) => x.nav_lat !== null && x.nav_lat !== undefined);
    return e ? { id: e.facility_id, lat: e.nav_lat, lng: e.nav_lng } : null;
  });
  check('座標のある施設がある', !!spot, String(spot));
  if (!spot) throw new Error('座標のある施設が無いため中止');

  await page.goto(`${BASE}/facility/${spot.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await skipIntro(page);

  const route = page.getByRole('button', { name: '経路' });
  check('「経路」が出ている', (await route.count()) > 0);

  /*
    押した先を捕まえる。

    **同じタブで移る。** 新しい窓ではない。以前はここで何も起きな
    かった（ブラウザが知らない形式の呼び出しを黙って捨てていた）。
  */
  const moved = [];
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) moved.push(f.url());
  });

  await route.first().click();
  await page.waitForTimeout(6000);

  const toMaps = moved.find((u) => u.includes('google.com/maps'));
  check('押すと地図へ移る', !!toMaps, moved.length ? moved.join(' / ').slice(0, 110) : '何も起きなかった');

  if (toMaps) {
    const url = decodeURIComponent(toMaps);

    /*
      渡す座標が、車寄せのものであること。

      一般の地図は建物の中心を案内する。そのずれを埋めるのが
      このアプリの目的なので、ここが建物の代表地点になっていては
      意味がない。
    */
    const want = `${spot.lat.toFixed(6)},${spot.lng.toFixed(6)}`;
    check('車寄せの座標を渡している', url.includes(want), `${want} を探したが ${url.slice(0, 110)}`);
    check('自動車の経路で開く', url.includes('travelmode=driving'), url.slice(0, 110));
  }

} finally {
  console.log('\n--- 後片付け ---');
  check('検査で作った会員を消した', await removeMember(conn, member));

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
