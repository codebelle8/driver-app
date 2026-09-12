/**
 * 文字が地に埋もれていないかを、全画面・両方の配色で測る。
 *
 *   node tools/test-contrast.mjs                        手元の書き出し
 *   node tools/test-contrast.mjs https://kurumayose-navi.vercel.app
 *
 * **なぜ要るか**
 *   配色を替えるたびに、どこかで文字が見えなくなる。実際、暗い表示で
 *   **白い文字が白い地の上に乗っていた**（ご報告 2026-09-12）。
 *   目で全画面を見て回るのは現実的でなく、見落とす。
 *
 * **どう測るか**
 *   画面にある文字をすべて拾い、その文字色と、**実際に後ろにある地の色**
 *   （透けている親をさかのぼって見つける）を取り、WCAG の比を計算する。
 *
 *     ふつうの文字 … 4.5:1
 *     大きい文字   … 3.0:1（24px 以上、または太字で 18.66px 以上）
 *
 * **薄いと分かっていて置いているものは外す**
 *   写真の上に重ねた説明や、入れ替え中で薄くなっている絵の中の文字は、
 *   一瞬の状態を測ることになる。見えているものだけを測る。
 */
import { chromium } from 'playwright';

import { connect, createMember, removeMember, signInOn, skipIntro } from './lib/member.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:4190').replace(/\/$/, '');
const conn = connect();

/** 見て回る画面 */
const SCREENS = [
  ['探す', '/'],
  ['お気に入り', '/favorites'],
  ['履歴', '/history'],
  ['マイページ', '/mypage'],
  ['アカウント', '/account'],
  ['お支払い', '/plan'],
  ['お知らせ', '/notices'],
];

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}`);
    if (detail) console.error(detail);
  }
};

/** 画面の中の、埋もれている文字を数え上げる */
const MEASURE = () => {
  const parse = (css) => {
    const m = css.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  /** 透けている色を、後ろの色へ重ねる */
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  const bad = [];
  const seen = new Set();

  for (const el of document.querySelectorAll('*')) {
    // 自分の直下に文字があるものだけ（親で二重に数えない）
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('')
      .trim();
    if (!own) continue;

    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;

    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') continue;

    // 透けているもの（入れ替え中の絵など）は外す
    let o = 1;
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      o *= Number(getComputedStyle(p).opacity);
    }
    if (o < 0.9) continue;

    const fg = parse(s.color);
    if (!fg || fg.a < 0.5) continue;

    // 実際に後ろにある地を探す
    let bg = null;
    for (let p = el; p; p = p.parentElement) {
      const c = parse(getComputedStyle(p).backgroundColor);
      if (c && c.a > 0.5) { bg = c; break; }
    }
    if (!bg) continue;

    const size = parseFloat(s.fontSize);
    const weight = Number(s.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);

    /*
      記号（アイコン）は文字ではない。

      字形は私用領域（U+E000〜U+F8FF）に置かれている。文字と同じ
      4.5:1 を当てると、飾りの記号まで咎めることになる。決まりでも
      操作部品は 3:1（WCAG 1.4.11）。そちらで見る。
    */
    const glyph = [...own].every((ch) => {
      const n = ch.codePointAt(0);
      return n >= 0xe000 && n <= 0xf8ff;
    });
    const need = glyph || large ? 3 : 4.5;

    const r = ratio(over(fg, bg), bg);
    if (r >= need) continue;

    const key = own.slice(0, 24) + '|' + s.color + '|' + getComputedStyle(el).backgroundColor;
    if (seen.has(key)) continue;
    seen.add(key);

    bad.push({
      文: glyph ? '（記号）' : own.slice(0, 26),
      比: Number(r.toFixed(2)),
      要: need,
      文字: s.color,
      地: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
    });
  }
  return bad;
};

let browser = null;
let member = null;

try {
  console.log(`文字の読みやすさの検査: ${BASE}\n`);
  member = await createMember(conn, 'contrast');
  browser = await chromium.launch();

  for (const scheme of ['dark', 'light']) {
    console.log(`--- ${scheme === 'dark' ? '暗い表示' : '明るい表示'} ---`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await signInOn(page, BASE, member, { goto: '/' });
    await page.waitForTimeout(3000);

    for (const [name, path] of SCREENS) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(4500);
      await skipIntro(page);
      await page.waitForTimeout(800);

      const bad = await page.evaluate(MEASURE);
      check(
        `${name}`,
        bad.length === 0,
        bad.map((b) => `        「${b.文}」 ${b.比}:1（要 ${b.要}） 文字 ${b.文字} / 地 ${b.地}`).join('\n'),
      );
    }
    await ctx.close();
  }
} finally {
  console.log('\n--- 後片付け ---');
  check('検査で作った会員を消した', await removeMember(conn, member));

  if (browser) await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
