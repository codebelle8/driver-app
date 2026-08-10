/**
 * 入力欄がきちんと入力を受け付けるかを確認する。
 *
 *   node tools/test-input.mjs
 *
 * スマートフォンでソフトウェアキーボードが出るかどうかは、
 * 「入力欄に focus が当たり、文字が入るか」で判定できる。
 * focus が当たらない（別の要素が覆っている・readOnly など）場合は
 * キーボードも出ないため、そこを機械的に確かめる。
 */
import { readFileSync } from 'node:fs';

import { chromium, devices } from 'playwright';

const BASE = 'http://localhost:3000';

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
void loadEnv('admin/.env.local');

const email = process.env.KN_EMAIL;
const password = process.env.KN_PASSWORD;

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

/** 入力欄を「タップして」文字を打ち、値が入るかを見る */
async function typeInto(page, locator, text, label) {
  await locator.tap({ timeout: 5000 }).catch(() => locator.click());
  const focused = await locator.evaluate((el) => el === document.activeElement);
  check(`${label}: タップで focus が当たる`, focused);

  // 入力を妨げる属性が付いていないか
  const attrs = await locator.evaluate((el) => ({
    readOnly: el.readOnly ?? false,
    disabled: el.disabled ?? false,
    inputMode: el.getAttribute('inputmode'),
    pointerEvents: getComputedStyle(el).pointerEvents,
  }));
  check(
    `${label}: 入力を妨げる設定が無い`,
    !attrs.readOnly && !attrs.disabled && attrs.pointerEvents !== 'none',
    JSON.stringify(attrs),
  );

  await page.keyboard.type(text, { delay: 10 });
  const value = await locator.inputValue();
  check(`${label}: 文字が入る`, value === text, `value="${value}"`);
}

const browser = await chromium.launch();

// --- スマートフォン相当（タッチ操作） ----------------------------------------
const phone = await browser.newContext({
  ...devices['Pixel 7'],
  locale: 'ja-JP',
});
await phone.addCookies([
  { name: 'kn_locale', value: 'ja', domain: 'localhost', path: '/' },
  { name: 'kn_theme', value: 'dark', domain: 'localhost', path: '/' },
]);
const p = await phone.newPage();

console.log('スマートフォン相当（ログイン画面）:');
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await typeInto(p, p.locator('input[name="email"]'), 'test@example.com', 'メールアドレス');
await typeInto(p, p.locator('input[name="password"]'), 'Passw0rd!', 'パスワード');

// 入力欄の上に何かが覆いかぶさっていないか（キーボードが出ない典型的な原因）
const covered = await p.locator('input[name="email"]').evaluate((el) => {
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return top === el ? null : top?.tagName + '.' + (top?.className || '');
});
check('入力欄が他の要素に覆われていない', covered === null, `覆っている要素: ${covered}`);

await phone.close();

// --- ログイン後の入力欄 -------------------------------------------------------
if (email && password) {
  const phone2 = await browser.newContext({ ...devices['Pixel 7'], locale: 'ja-JP' });
  await phone2.addCookies([
    { name: 'kn_locale', value: 'ja', domain: 'localhost', path: '/' },
    { name: 'kn_theme', value: 'dark', domain: 'localhost', path: '/' },
  ]);
  const p2 = await phone2.newPage();

  await p2.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p2.fill('input[name="email"]', email);
  await p2.fill('input[name="password"]', password);
  await p2.click('button[type="submit"]');
  await p2.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });

  console.log('\nスマートフォン相当（施設の新規登録フォーム）:');
  await p2.goto(`${BASE}/facilities/new`, { waitUntil: 'networkidle' });
  await typeInto(p2, p2.locator('input[name="name"]'), 'テストホテル', '施設名');
  await typeInto(p2, p2.locator('textarea[name="summary"]'), '概要のテスト', '施設概要');

  console.log('\nスマートフォン相当（施設一覧の検索欄）:');
  await p2.goto(`${BASE}/facilities`, { waitUntil: 'networkidle' });
  await typeInto(p2, p2.locator('input[name="q"]'), 'しおどめ', '検索');

  await phone2.close();
} else {
  console.log('\nログイン後の確認: KN_EMAIL / KN_PASSWORD 未設定のため省略');
}

await browser.close();

console.log('');
if (failures.length) {
  console.error(`合格 ${pass} 件 / 失敗 ${failures.length} 件`);
  process.exit(1);
}
console.log(`合格 ${pass} 件 / 失敗 0 件 — 入力欄は正常に入力を受け付けます。`);
