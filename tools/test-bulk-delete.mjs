/**
 * 管理画面の「まとめて削除」を見る。
 *
 *   node tools/test-bulk-delete.mjs                       本番を検査
 *   node tools/test-bulk-delete.mjs http://localhost:3000 手元を検査
 *
 * 見るのは5点。
 *   1. 「選択」で選べる状態に入れるか
 *   2. 「すべて選ぶ」で全部に印が付くか
 *   3. 「削除 (n)」の件数が選んだ数と合っているか
 *   4. 札で「キャンセル」すると1件も消えないか
 *   5. 「削除」で選んだぶんだけが消え、選ばなかったぶんは残るか
 *
 * 5 の後半が要点。まとめて消す処理は .in('id', ids) で当てており、
 * 条件の作り方を誤ると関係の無い行まで巻き込む。選ばなかったものが
 * 残っていることまで確かめないと、そこに気づけない。
 */
import { readFileSync } from 'node:fs';

import { chromium } from 'playwright';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';

const BASE = (process.argv[2] ?? 'https://admin.kurumayosenavi.com').replace(/\/$/, '');

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

const EMAIL = 'ui-bulk-check@kurumayose.invalid';
const PASSWORD = 'Hm3nQv7zXd2kPs';

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

/** 触った行の id。後片付けで操作履歴を消すのに使う。 */
const touched = [];

let userId = null;
let facilityId = null;
let browser = null;

try {
  console.log(`まとめて削除の検査: ${BASE}\n`);

  // --- 検証用の管理者と施設を作る ---------------------------------------------
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
    body: { user_id: userId, display_name: 'まとめて削除検証', role: 'admin' },
  });

  const cat = await sb('/rest/v1/categories?select=id&code=eq.hotel');
  const fac = await sb('/rest/v1/facilities', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      code: 'HTL-9810',
      name: 'まとめて削除検証_下書き',
      name_kana: 'まとめてさくじょけんしょう',
      category_id: cat.body?.[0]?.id,
      prefecture: '東京都',
      address_line: 'まとめて1-1',
      status: 'draft',
    },
  });
  facilityId = fac.body?.[0]?.id;
  touched.push(facilityId);
  if (!facilityId) throw new Error(`施設作成に失敗: ${JSON.stringify(fac.body)}`);

  /*
    入口を3つ作る。

    3つにしているのは「すべて選ぶ」と「一部だけ選ぶ」を
    どちらも試すため。2つでは、一部を選んだつもりが
    全部になっている取り違えを見分けられない。
  */
  const eps = [];
  for (const [code, name] of [
    ['A', '検証入口A'],
    ['B', '検証入口B'],
    ['C', '検証入口C'],
  ]) {
    const r = await sb('/rest/v1/entry_points', {
      method: 'POST',
      prefer: 'return=representation',
      body: { facility_id: facilityId, code, kind: 'dropoff', name },
    });
    if (!r.body?.[0]?.id) throw new Error(`入口作成に失敗: ${JSON.stringify(r.body)}`);
    eps.push(r.body[0].id);
    touched.push(r.body[0].id);
  }

  // 注意事項と写真は先頭の入口へ3件ずつ
  for (const n of [1, 2, 3]) {
    /*
      作った行の id を控える。

      控えないと、後片付けで操作履歴を消せない。実際に
      「検証用の注意事項その1」などが発注元の履歴に残った。
    */
    const ca = await sb('/rest/v1/cautions', {
      method: 'POST',
      prefer: 'return=representation',
      body: { entry_point_id: eps[0], body: `検証用の注意事項その${n}` },
    });
    touched.push(ca.body?.[0]?.id);

    const ph = await sb('/rest/v1/photos', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        entry_point_id: eps[0],
        facility_id: facilityId,
        kind: 'dropoff',
        storage_path: `verify/bulk-${n}.jpg`,
        caption: `検証用の写真その${n}`,
        sort_order: n,
      },
    });
    touched.push(ph.body?.[0]?.id);
  }

  // --- ログイン ---------------------------------------------------------------
  browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();

  let nativeDialogs = [];
  page.on('dialog', async (d) => {
    nativeDialogs.push(`${d.type()}: ${d.message()}`);
    await d.dismiss();
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 });
  check('管理者としてログインできる', true);

  const card = page.getByTestId('confirm-card');
  const cancel = page.getByTestId('confirm-cancel');
  const accept = page.getByTestId('confirm-accept');

  const open = async () => {
    await page.goto(`${BASE}/facilities/${facilityId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
  };

  const rows = async (table, query) =>
    (await sb(`/rest/v1/${table}?select=id,${query.field}&${query.filter}`)).body ?? [];

  /**
   * 1か所ぶんを通しで見る。
   *
   * @param name      見出しに出す名前
   * @param kind      その一覧に振ってある目印（bulk-<kind>）
   * @param keep      印を外して残すものの名前
   * @param remaining いま残っているものの名前を返す
   */
  async function run({ name, kind, keep, remaining }) {
    console.log(`\n--- ${name} ---`);
    await open();
    nativeDialogs = [];

    /*
      目印で選び分ける。

      画面には入口ごとに写真と注意事項の一覧が並ぶため、DOM の形
      （近い div、近い section）で絞ろうとすると隣の一覧を掴む。
    */
    const box = page.getByTestId(`bulk-${kind}`);
    const checks = page.locator(`[data-testid="bulk-check-${kind}"]`);
    const select = box.getByRole('button', { name: '選択', exact: true });
    check(`${name}: 「選択」が出ている`, (await select.count()) === 1, `${await select.count()}個`);
    if ((await select.count()) !== 1) return;

    await select.click();
    await page.waitForTimeout(400);

    check(`${name}: 3件ぶんのチェックが出る`, (await checks.count()) === 3, `${await checks.count()}個`);

    // --- すべて選ぶ -------------------------------------------------------------
    await box.getByRole('button', { name: 'すべて選ぶ' }).click();
    await page.waitForTimeout(400);
    check(
      `${name}: 「すべて選ぶ」で3件に印が付く`,
      (await page.locator(`[data-testid="bulk-check-${kind}"]:checked`).count()) === 3,
    );
    check(
      `${name}: 「削除 (3)」になっている`,
      (await box.getByRole('button', { name: '削除 (3)' }).count()) === 1,
    );

    // --- 1つだけ外す ------------------------------------------------------------
    await page.locator(`[data-testid="bulk-check-${kind}"][aria-label="${keep}"]`).click();
    await page.waitForTimeout(400);
    check(
      `${name}: 1つ外すと「削除 (2)」になる`,
      (await box.getByRole('button', { name: '削除 (2)' }).count()) === 1,
    );

    // --- 札でやめる -------------------------------------------------------------
    await box.getByRole('button', { name: '削除 (2)' }).click();
    await page.waitForTimeout(700);
    check(
      `${name}: ブラウザの confirm を使っていない`,
      nativeDialogs.length === 0,
      nativeDialogs.join(' / '),
    );
    check(`${name}: 画面の中に札が出る`, (await card.count()) === 1);
    const text = (await card.count()) ? await card.innerText() : '';
    check(`${name}: 札に件数が入っている`, text.includes('2 件'), text);
    check(`${name}: 元に戻せない旨が入っている`, text.includes('元には戻せません'), text);

    await cancel.click();
    await page.waitForTimeout(600);
    check(`${name}: 「キャンセル」で1件も消えない`, (await remaining()).length === 3);

    // --- 決める -----------------------------------------------------------------
    await box.getByRole('button', { name: '削除 (2)' }).click();
    await page.waitForTimeout(500);
    await accept.click();
    await page.waitForTimeout(3000);

    const left = await remaining();
    check(`${name}: 選んだ2件が消える`, left.length === 1, `残り${left.length}件: ${left}`);
    check(
      `${name}: 選ばなかったものが残っている`,
      left.length === 1 && left[0] === keep,
      `残ったのは ${left[0]}（外したのは ${keep}）`,
    );
  }

  await run({
    name: '注意事項',
    kind: 'caution',
    keep: '検証用の注意事項その1',
    remaining: async () => {
      const r = await sb(`/rest/v1/cautions?select=body&entry_point_id=eq.${eps[0]}`);
      return (r.body ?? []).map((x) => x.body);
    },
  });

  await run({
    name: '写真',
    kind: 'photo',
    keep: '検証用の写真その1',
    remaining: async () => {
      const r = await sb(`/rest/v1/photos?select=caption&entry_point_id=eq.${eps[0]}`);
      return (r.body ?? []).map((x) => x.caption);
    },
  });

  await run({
    name: '入口・車寄せ',
    kind: 'entry-point',
    keep: '検証入口A',
    remaining: async () => {
      const r = await sb(`/rest/v1/entry_points?select=name&facility_id=eq.${facilityId}`);
      return (r.body ?? []).map((x) => x.name);
    },
  });
} finally {
  console.log('\n--- 後片付け ---');
  if (browser) await browser.close();

  if (facilityId) {
    const r = await sb(`/rest/v1/facilities?id=eq.${facilityId}`, { method: 'DELETE' });
    console.log(`  ${r.ok ? '削除' : '削除失敗'}  検証用の施設`);
  }
  if (userId) {
    await sb(`/rest/v1/audit_logs?actor_id=eq.${userId}`, { method: 'DELETE' });
    await sb(`/rest/v1/admin_profiles?user_id=eq.${userId}`, { method: 'DELETE' });
    const r = await sb(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
    console.log(`  ${r.ok ? '削除' : '削除失敗'}  検証用のアカウント`);
  }

  // 操作履歴はいちばん最後に消す。先に消すと、上の削除がまた行を作る。
  touched.push(userId, facilityId);
  const purged = await purgeAuditLogs(sb, touched);
  console.log(`  削除    検証で残した操作履歴 ${purged} 件`);

  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
