/**
 * 調査員としてログインし、画面が権限どおりに出ているかを確認する。
 *
 *   node tools/test-surveyor-ui.mjs                       本番を検査
 *   node tools/test-surveyor-ui.mjs http://localhost:3000 手元を検査
 *
 * verify-surveyor.mjs が「API として拒否されるか」を見るのに対し、
 * こちらは「そもそも押せないようになっているか」を見る。
 *
 * 両方が必要な理由:
 *   拒否されること自体は正しくても、押せてしまうと利用者は
 *   「壊れている」と受け取る。とくに公開済みの施設の編集は、
 *   RLS が対象0件に絞るため、保存できたように見えて何も変わらない。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';

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

const EMAIL = 'ui-surveyor-check@kurumayose.invalid';
const PASSWORD = 'Qf4hLm8sVt3yZb';

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

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SB}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
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
  return { ok: res.ok, status: res.status, body: parsed };
}

let userId = null;
let publishedId = null;
let draftId = null;
let browser = null;

try {
  console.log(`調査員から見た画面の検査: ${BASE}\n`);

  // --- 検証用の調査員と施設を作る ---------------------------------------------
  const users = await sb('/auth/v1/admin/users?page=1&per_page=200');
  const stale = (users.body?.users ?? []).find((u) => u.email === EMAIL);
  if (stale) await sb(`/auth/v1/admin/users/${stale.id}`, { method: 'DELETE' });

  const created = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD, email_confirm: true },
  });
  userId = created.body?.id;
  if (!userId) throw new Error(`アカウント作成に失敗: ${JSON.stringify(created.body)}`);

  await sb('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: userId, display_name: 'UI検証用調査員', role: 'surveyor' },
  });

  const cat = await sb('/rest/v1/categories?select=id&code=eq.hotel');
  const categoryId = cat.body?.[0]?.id;

  const mk = async (code, name, kana, status) => {
    const r = await sb('/rest/v1/facilities', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        code,
        name,
        name_kana: kana,
        category_id: categoryId,
        prefecture: '東京都',
        address_line: 'UI検証1-1',
        status,
      },
    });
    return r.body?.[0]?.id;
  };

  publishedId = await mk('HTL-9801', 'UI検証用_公開済み', 'ゆーあいけんしょうようこうかい', 'published');
  draftId = await mk('HTL-9802', 'UI検証用_下書き', 'ゆーあいけんしょうようしたがき', 'draft');

  // --- 調査員としてログインする -----------------------------------------------
  browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'ja-JP' });
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
  check('調査員としてログインできる', true);

  // --- ヘッダーに管理者専用の項目が出ていないか --------------------------------
  console.log('\n--- ヘッダー ---');
  const navHrefs = await page.$$eval('header nav a', (as) =>
    as.map((a) => a.getAttribute('href')),
  );
  check('アカウント管理の項目が出ていない', !navHrefs.includes('/accounts'), navHrefs.join(','));
  check('操作履歴の項目が出ていない', !navHrefs.includes('/history'), navHrefs.join(','));
  check('施設一覧の項目は出ている', navHrefs.includes('/facilities'));

  // textContent ではなく innerText を使う。
  // textContent は <script> の中身まで拾うため、Next.js が埋め込む
  // RSC ペイロード（辞書一式が入っている）に一致してしまい、
  // 画面に出ていない文言まで「ある」と判定されてしまう。
  const roleBadge = await page.innerText('header');
  check('役割が「調査員」と表示される', (roleBadge ?? '').includes('調査員'));

  // --- 直接たどり着けないか ----------------------------------------------------
  console.log('\n--- 管理者専用の画面へ直接移動 ---');
  for (const path of ['/accounts', '/history']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    check(`${path} へは入れない`, !page.url().includes(path), `到達先: ${page.url()}`);
  }

  // --- 下書きの施設 — 編集できる状態か ----------------------------------------
  console.log('\n--- 下書きの施設 ---');
  await page.goto(`${BASE}/facilities/${draftId}`, { waitUntil: 'networkidle' });
  const draftBody = await page.innerText('body');

  check('施設情報の編集欄が出ている', (await page.$('input[name="name"]')) !== null);
  check('入口・車寄せを追加できる', draftBody.includes('入口・車寄せを追加'));
  check(
    '公開ボタンは出ていない（公開は管理者の操作）',
    !draftBody.includes('この施設を公開する'),
  );
  check('公開の切り替えは管理者が行う旨が出ている', draftBody.includes('公開の切り替えは管理者'));

  // --- 公開済みの施設 — 読み取り専用か ----------------------------------------
  console.log('\n--- 公開済みの施設 ---');
  await page.goto(`${BASE}/facilities/${publishedId}`, { waitUntil: 'networkidle' });
  const pubBody = await page.innerText('body');

  check('変更できない旨が明示されている', pubBody.includes('公開中のため、変更できません'));
  check(
    '施設情報の編集欄が出ていない',
    (await page.$('input[name="name"]')) === null,
    '編集欄が残っていると、保存できたように見えて何も変わらない',
  );
  check('入口・車寄せの追加ボタンが出ていない', !pubBody.includes('入口・車寄せを追加'));
  check('写真の投入欄が出ていない', (await page.$('input[type="file"]')) === null);
} finally {
  console.log('\n--- 後片付け ---');
  if (browser) await browser.close();

  for (const [label, id] of [
    ['公開済みの施設', publishedId],
    ['下書きの施設', draftId],
  ]) {
    if (!id) continue;
    const r = await sb(`/rest/v1/facilities?id=eq.${id}`, { method: 'DELETE' });
    console.log(`  ${r.ok ? '削除' : '削除失敗'}  ${label}`);
  }

  if (userId) {
    await sb(`/rest/v1/audit_logs?actor_id=eq.${userId}`, { method: 'DELETE' });
    await sb(`/rest/v1/admin_profiles?user_id=eq.${userId}`, { method: 'DELETE' });
    const r = await sb(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
    console.log(`  ${r.ok ? '削除' : '削除失敗'}  検証用アカウント`);
  }

  // service_role による操作は actor_id が空になるため名前で拾う
  const left = await sb('/rest/v1/audit_logs?select=id,diff&actor_id=is.null');
  const ids = (Array.isArray(left.body) ? left.body : [])
    .filter((r) => JSON.stringify(r.diff ?? '').includes('UI検証'))
    .map((r) => r.id);
  if (ids.length) {
    await sb(`/rest/v1/audit_logs?id=in.(${ids.join(',')})`, { method: 'DELETE' });
    console.log(`  削除  検証用の操作履歴 ${ids.length} 件`);
  }
}

/*
  操作履歴はいちばん最後に消す。先に消すと、上の削除がまた行を作る。

  合否の分岐の中に置いていたため、通ったときだけ消し漏れていた。
  検査が通るほど残骸が積み上がる、という具合の悪い形になっていた。
*/
const purged = await purgeAuditLogs(sb, [publishedId, draftId, userId]);
console.log(`  削除    検証で残した操作履歴 ${purged} 件`);

console.log('');
if (failures.length) {
  console.error(`合格 ${pass} 件 / 失敗 ${failures.length} 件`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exitCode = 1;
} else {
  console.log(`合格 ${pass} 件 / 失敗 0 件 — 画面は権限どおりに出ています。`);
}
