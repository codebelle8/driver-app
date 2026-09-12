/**
 * 配色そのものを突き合わせる。画面を開かずに、値だけで測る。
 *
 *   node tools/check-palette.mjs
 *
 * **なぜ要るか**
 *   画面を回る検査（test-contrast / test-admin-contrast）は、
 *   **そのとき画面に出ていた色しか見られない。**
 *   入力の誤りの赤も、確認の問いかけも、出ていなければ測られない。
 *
 *   実際、補足の文字と注意の黄土が「一段沈んだ枠（surface2）の上で
 *   基準を割る」のを見つけたのは、たまたまその枠が出ている画面が
 *   あったからだった。出ていない画面の色は取り残される。
 *
 *   ここでは**組み合わせを全部**当たる。地は4つ、文字は7つ。
 *   画面に出るかどうかに関わらず、割っていれば分かる。
 *
 * **何を確かめるか**
 *   1. 文字として置く色が、どの地の上でも 4.5:1 あるか
 *   2. 淡い地（accentSoft ほか）の上で、その色が読めるか
 *   3. 塗りの上に乗せる文字（accentText / dangerText）が読めるか
 *   4. アプリと管理画面で、同じ色を使っているか
 *
 * **記号は別**
 *   記号は操作部品として 3:1（WCAG 1.4.11）。ここでは文字だけを見る。
 */
import { readFileSync } from 'node:fs';

const NL = String.fromCharCode(10);

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}`);
    if (detail) console.error(detail);
  }
};

// --- 色の計算 -----------------------------------------------------------------

const rgb = (hex) => {
  const h = hex.trim().replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

const lum = ({ r, g, b }) => {
  const f = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const ratio = (a, b) => {
  const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// --- 値を読み出す -------------------------------------------------------------

/**
 * app/src/theme.ts から light と dark を取り出す。
 *
 * 注釈が入り組んでいるため、「名前: '#xxxxxx'」の行だけを拾う。
 * const light / const dark の間で分ける。
 */
function readAppPalette() {
  const src = readFileSync('app/src/theme.ts', 'utf8');
  const start = src.indexOf('const light = {');
  const mid = src.indexOf('const dark: typeof light = {');
  const end = src.indexOf('export type Palette');
  if (start < 0 || mid < 0 || end < 0) throw new Error('theme.ts の形が変わっています');

  const grab = (text) => {
    const out = {};
    for (const line of text.split(NL)) {
      const t = line.trim();
      const i = t.indexOf(':');
      if (i < 0) continue;
      const name = t.slice(0, i).trim();
      const rest = t.slice(i + 1).trim();
      if (!rest.startsWith("'#")) continue;
      const close = rest.indexOf("'", 1);
      if (close < 0) continue;
      if (!/^[a-zA-Z0-9]+$/.test(name)) continue;
      out[name] = rest.slice(1, close);
    }
    return out;
  };

  return { light: grab(src.slice(start, mid)), dark: grab(src.slice(mid, end)) };
}

/**
 * admin/src/app/globals.css から取り出す。
 * :root（= light）と :root[data-theme="dark"] で分ける。
 */
function readAdminPalette() {
  const src = readFileSync('admin/src/app/globals.css', 'utf8');
  const start = src.indexOf(':root,');
  const mid = src.indexOf(':root[data-theme="dark"]');
  const end = src.indexOf('@theme inline');
  if (start < 0 || mid < 0 || end < 0) throw new Error('globals.css の形が変わっています');

  const grab = (text) => {
    const out = {};
    for (const line of text.split(NL)) {
      const t = line.trim();
      if (!t.startsWith('--c-')) continue;
      const i = t.indexOf(':');
      if (i < 0) continue;
      const name = t.slice(4, i).trim();
      const v = t.slice(i + 1).replace(';', '').trim();
      if (!v.startsWith('#')) continue;
      /*
        --c-text-faint → textFaint。
        **数字も拾うこと。** [a-z] だけにしていたため --c-surface-2 が
        surface-2 のまま残り、**管理画面の地が1つ、黙って検査から外れていた。**
      */
      const camel = name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
      out[camel] = v;
    }
    return out;
  };

  return { light: grab(src.slice(start, mid)), dark: grab(src.slice(mid, end)) };
}

// --- 約束ごと -----------------------------------------------------------------

/** 文字を置く地。ここに挙げたどの地の上でも読めなければならない。 */
const GROUNDS = ['bg', 'bgSub', 'surface', 'surface2'];

/**
 * 文字として置く色。
 *
 * accent は入れない。**暗い配色では文字に使わないと決めた**（accentInk）。
 * 塗り・枠・記号として使う色で、文字の基準は当てない。
 */
const INKS = ['text', 'textMuted', 'textFaint', 'accentInk', 'danger', 'warn', 'ok'];

/** 淡い地と、その上に置く文字の組。 */
const SOFT_PAIRS = [
  ['accentSoft', 'accentInk'],
  ['dangerSoft', 'danger'],
  ['warnSoft', 'warn'],
];

/** 塗りと、その上に乗せる文字の組。 */
const FILL_PAIRS = [
  ['accent', 'accentText'],
  ['danger', 'dangerText'],
];

const NEED = 4.5;

function inspect(who, scheme, p) {
  const label = `${who}・${scheme === 'dark' ? '暗い配色' : '明るい配色'}`;

  for (const ink of INKS) {
    if (!p[ink]) continue; // 管理画面にしかない色（ok）などは飛ばす
    for (const ground of GROUNDS) {
      if (!p[ground]) continue;
      const r = ratio(p[ink], p[ground]);
      check(
        `${label} — ${ink} を ${ground} の上に置く`,
        r >= NEED,
        `        ${p[ink]} / ${p[ground]} … ${r.toFixed(2)}:1（要 ${NEED}）`,
      );
    }
  }

  for (const [ground, ink] of SOFT_PAIRS) {
    if (!p[ground] || !p[ink]) continue;
    const r = ratio(p[ink], p[ground]);
    check(
      `${label} — ${ink} を ${ground} の上に置く`,
      r >= NEED,
      `        ${p[ink]} / ${p[ground]} … ${r.toFixed(2)}:1（要 ${NEED}）`,
    );
  }

  for (const [ground, ink] of FILL_PAIRS) {
    if (!p[ground] || !p[ink]) continue;
    const r = ratio(p[ink], p[ground]);
    check(
      `${label} — ${ink} を ${ground} の塗りに乗せる`,
      r >= NEED,
      `        ${p[ink]} / ${p[ground]} … ${r.toFixed(2)}:1（要 ${NEED}）`,
    );
  }
}

// --- 実行 ---------------------------------------------------------------------

console.log(`配色の突き合わせ${NL}`);

const app = readAppPalette();
const admin = readAdminPalette();

for (const scheme of ['light', 'dark']) {
  inspect('アプリ', scheme, app[scheme]);
  inspect('管理画面', scheme, admin[scheme]);
}

/*
  同じ製品に見えるよう、両方で同じ値を使うことにしている。
  片方だけ直して、もう片方を忘れる事故を防ぐ。
*/
const SHARED = [
  'bg', 'bgSub', 'surface', 'surface2', 'border', 'borderStrong',
  'text', 'textMuted', 'textFaint',
  'accent', 'accentSoft', 'accentText', 'accentInk',
  'danger', 'warn',
];
for (const scheme of ['light', 'dark']) {
  for (const name of SHARED) {
    const a = app[scheme][name];
    const b = admin[scheme][name];
    if (!a || !b) continue;
    check(
      `${scheme === 'dark' ? '暗い配色' : '明るい配色'} — ${name} がアプリと管理画面で同じ`,
      a.toLowerCase() === b.toLowerCase(),
      `        アプリ ${a} / 管理画面 ${b}`,
    );
  }
}

console.log(`合格 ${pass} / 不合格 ${failures.length}`);
if (failures.length) {
  console.error(`${NL}直すところ:`);
  for (const f of failures) console.error(`  - ${f}`);
}
process.exitCode = failures.length ? 1 : 0;
