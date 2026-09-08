/**
 * 文字の大きさと、大きくしたことで崩れていないかを見る。
 *
 *   node tools/test-readability.mjs                        手元の書き出し (4173)
 *   node tools/test-readability.mjs https://kurumayose-navi.vercel.app
 *
 * 見るのは3点。
 *   1. 画面に出ている文字が、決めた下限を下回っていないこと
 *   2. 文字を大きくしたことで、横にはみ出していないこと
 *   3. 1行に収める文字（施設名・住所）が、切れていないこと
 *
 * 2 と 3 が要点。大きくするだけなら簡単だが、狭い画面では
 * 押しボタンから文字がはみ出し、1行の項目は「…」で切れる。
 * 読みやすくするつもりで、かえって読めなくなる。
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn } from './lib/member.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');

/** これを下回る文字は画面に出さない（theme.ts の TEXT.micro） */
const MIN = 11;

let pass = 0;
const failures = [];
function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label} ${detail}`);
  }
}

/** 画面に出ている文字の大きさを集める */
const collectSizes = (page) =>
  page.evaluate((min) => {
    const small = [];
    for (const el of document.querySelectorAll('*')) {
      const t = (el.textContent ?? '').trim();
      if (!t || el.children.length > 0) continue; // 文字を直に持つものだけ
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none') continue;
      /*
        地図の出典は Google が描いており、こちらでは変えられない。
        規約上も隠したり作り替えたりできないため、対象から外す。
      */
      if (el.closest('.gm-style, .gmnoprint, .gm-style-cc')) continue;

      const size = parseFloat(st.fontSize);
      if (size && size < min) small.push(`${size}px「${t.slice(0, 16)}」`);
    }
    return [...new Set(small)];
  }, MIN);

/** 1行に収める文字が切れていないか */
const collectClipped = (page) =>
  page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const st = getComputedStyle(el);
      if (st.textOverflow !== 'ellipsis' && st.webkitLineClamp === 'none') continue;
      // 中身が枠より広ければ、切れている
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        out.push(`「${(el.textContent ?? '').trim().slice(0, 20)}」`);
      }
    }
    return [...new Set(out)];
  });

const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

let browser = null;
/* 起動時にログインを求める作りになったため、検査も先に入る。 */
const conn = connect();
let member = null;

try {
  console.log(`文字の読みやすさの検査: ${BASE}\n`);
  member = await createMember(conn, 'rd');
  browser = await chromium.launch();

  // いちばん狭い端末から、PC まで
  for (const w of [320, 375, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width: w, height: 820 } });
    await signInOn(page, BASE, member);

    // 履歴とお気に入りに中身を入れておく（空の画面だけでは補足が出ない）
    const ids = await page.evaluate(() => {
      const cat = JSON.parse(localStorage.getItem('kn_catalog') ?? '{}');
      const list = (cat.facilities ?? []).slice(0, 3).map((f) => f.id);
      const at = new Date().toISOString();
      const rows = JSON.stringify(list.map((id) => ({ id, at })));
      localStorage.setItem('kn_history', rows);
      localStorage.setItem('kn_favorites', rows);
      return list;
    });

    for (const [name, path] of [
      ['探す', '/'],
      ['お気に入り', '/favorites'],
      ['履歴', '/history'],
      ['マイページ', '/mypage'],
      ['施設', `/facility/${ids[0]}`],
    ]) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      const sk = page.getByRole('button', { name: /導入を飛ばす|Skip the intro/ });
      if (await sk.count()) await sk.first().click().catch(() => {});
      await page.waitForTimeout(700);

      const small = await collectSizes(page);
      check(`${w}px ${name}: ${MIN}px を下回る文字が無い`, small.length === 0, small.join(' / '));

      const over = await overflow(page);
      check(`${w}px ${name}: 横にはみ出さない`, over <= 0, `${over}px`);

      const clipped = await collectClipped(page);
      check(`${w}px ${name}: 1行の項目が切れていない`, clipped.length === 0, clipped.join(' / '));
    }

    await page.close();
  }
} finally {
  if (browser) await browser.close();
  check('検査で作った会員を消した', await removeMember(conn, member));
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
