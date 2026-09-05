/**
 * 言語切り替えが画面全体に及んでいるかを確認する。
 *
 *   node tools/test-locale.mjs                        本番を検査
 *   node tools/test-locale.mjs http://localhost:3000  手元を検査
 *
 * なぜ要るか:
 *   文言を辞書ではなく定数から取っている箇所があると、
 *   英語表示にしてもそこだけ日本語のまま残る。見落としやすく、
 *   画面を開いて初めて気づく類の不具合なので機械的に確かめる。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? 'https://kurumayose-navi-admin.vercel.app').replace(/\/$/, '');

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv('admin/.env.local');
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const EMAIL = 'locale-check@kurumayose.invalid';
const PASSWORD = 'Wr6dJn2xKc8pAe';

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

async function sb(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${SB}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { ok: res.ok, body: parsed };
}

/** 日本語の文字（ひらがな・カタカナ・漢字）が含まれるか */
function hasJapanese(text) {
  return /[぀-ヿ一-龯]/.test(text);
}

let userId = null;
let browser = null;

try {
  console.log(`言語切り替えの検査: ${BASE}\n`);

  const users = await sb('/auth/v1/admin/users?page=1&per_page=200');
  const stale = (users.body?.users ?? []).find((u) => u.email === EMAIL);
  if (stale) await sb(`/auth/v1/admin/users/${stale.id}`, { method: 'DELETE' });

  const created = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD, email_confirm: true },
  });
  userId = created.body?.id;
  if (!userId) throw new Error(`アカウント作成に失敗: ${JSON.stringify(created.body)}`);

  // 表示名は英語にしておく。利用者が入力した値は翻訳対象ではないため、
  // 日本語のままだと「訳し漏れ」と区別がつかなくなる。
  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: userId, display_name: 'Locale Check', role: 'admin' },
  });

  // 画面に出てくるが翻訳対象ではないもの。
  //   - 言語選択の選択肢（言語名はその言語で書くのが通例）
  //   - 利用者が登録した値（アカウント名・カテゴリ名など）
  /*
    施設名・住所・入口名・注意事項の本文も「データの値」にあたる。

    以前はカテゴリ名と利用者名だけを除いていた。193件の施設を
    取り込んだ時点で施設一覧と操作履歴が日本語で埋まり、
    訳し漏れが1つも無くても失敗するようになっていた。
    失敗が常態になった検査は、本当の訳し漏れを隠す。
  */
  const [cats, profs, facs, eps, cauts] = await Promise.all([
    sb('/rest/v1/categories?select=name'),
    sb('/rest/v1/admin_profiles?select=display_name'),
    sb('/rest/v1/facilities?select=name,name_kana,prefecture,city,address_line'),
    sb('/rest/v1/entry_points?select=name'),
    sb('/rest/v1/cautions?select=body'),
  ]);
  const listOf = (r, ...keys) =>
    Array.isArray(r.body) ? r.body.flatMap((row) => keys.map((k) => row[k])) : [];

  const dataValues = [
    '日本語',
    ...listOf(cats, 'name'),
    ...listOf(profs, 'display_name'),
    ...listOf(facs, 'name', 'name_kana', 'prefecture', 'city', 'address_line'),
    ...listOf(eps, 'name'),
    ...listOf(cauts, 'body'),
  ]
    .filter(Boolean)
    /*
      長いものから消す。

      「東京都」を先に消すと「東京都千代田区…」が崩れて、
      短い断片が残る。実際に「帝国東京」という有り得ない
      文字列が残存として報告された。
    */
    .sort((a, b) => b.length - a.length);

  browser = await chromium.launch();

  for (const locale of ['ja', 'en']) {
    console.log(`\n--- ${locale === 'ja' ? '日本語' : '英語'} ---`);

    const context = await browser.newContext({ locale: 'ja-JP' });
    await context.addCookies([
      { name: 'kn_locale', value: locale, domain: new URL(BASE).hostname, path: '/' },
    ]);
    const page = await context.newPage();

    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    // router.replace はクライアント側の遷移のため load イベントが再発火しない。
    // waitForURL は既定でそれを待つので、URL が変わっていても止まらなくなる。
    // location を直接見て判定する。
    await page.waitForFunction(() => !location.pathname.startsWith('/login'), {
      timeout: 30000,
    });
    try {
    } catch {
      console.error('  ログインできませんでした。画面の表示:');
      const shown = await page.innerText('body');
      console.error('  ' + shown.slice(0, 400).replace(/\s+/g, ' '));
      throw new Error('ログイン失敗');
    }

    for (const path of ['/accounts', '/history', '/facilities', '/categories']) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });

      // innerText を使う。textContent は <script> に埋め込まれた
      // RSC ペイロード（辞書一式）まで拾ってしまう。
      const body = await page.innerText('body');

      // 翻訳対象は「画面の文言」であって「データの値」ではない。
      // 両者を区別しないと、カテゴリ名や利用者名まで訳し漏れと判定される。
      let chrome = body;
      for (const value of dataValues) {
        chrome = chrome.split(value).join('');
      }

      if (locale === 'ja') {
        check(`${path} が日本語で表示される`, hasJapanese(chrome));
      } else {
        const leftovers = chrome
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && hasJapanese(l));
        check(
          `${path} に日本語が残っていない`,
          leftovers.length === 0,
          leftovers.length ? `残存: ${leftovers.slice(0, 6).join(' / ')}` : '',
        );
      }
    }

    // 役割の選択肢は定数から取りやすく、訳し漏れが起きやすい箇所
    await page.goto(`${BASE}/accounts`, { waitUntil: 'networkidle' });
    const options = await page.$$eval('select[name="role"] option', (os) =>
      os.map((o) => o.textContent?.trim() ?? ''),
    );
    if (locale === 'en') {
      check(
        '役割の選択肢が英語になっている',
        options.length > 0 && !options.some(hasJapanese),
        options.join(' / '),
      );
      // 訳語を固定しておく。「Surveyor」と訳していたものを
      // クライアント様のご指定で「Investigator」に改めた経緯があるため、
      // 一般的な語に戻されないよう明示的に確かめる。
      check(
        '調査員は Investigator と訳す',
        options.includes('Investigator'),
        options.join(' / '),
      );
    } else {
      check('役割の選択肢が日本語になっている', options.some(hasJapanese), options.join(' / '));
    }

    await context.close();
  }
} finally {
  console.log('\n--- 後片付け ---');
  if (browser) await browser.close();
  if (userId) {
    await sb(`/rest/v1/audit_logs?actor_id=eq.${userId}`, { method: 'DELETE' });
    await sb(`/rest/v1/admin_profiles?user_id=eq.${userId}`, { method: 'DELETE' });
    const r = await sb(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
    console.log(`  ${r.ok ? '削除' : '削除失敗'}  検証用アカウント`);
  }
  const left = await sb('/rest/v1/audit_logs?select=id,diff&actor_id=is.null');
  const ids = (Array.isArray(left.body) ? left.body : [])
    .filter((r) => JSON.stringify(r.diff ?? '').includes('Locale Check'))
    .map((r) => r.id);
  if (ids.length) {
    await sb(`/rest/v1/audit_logs?id=in.(${ids.join(',')})`, { method: 'DELETE' });
    console.log(`  削除  検証用の操作履歴 ${ids.length} 件`);
  }
}

console.log('');
if (failures.length) {
  console.error(`合格 ${pass} 件 / 失敗 ${failures.length} 件`);
  process.exitCode = 1;
} else {
  console.log(`合格 ${pass} 件 / 失敗 0 件 — 言語切り替えは画面全体に及んでいます。`);
}
