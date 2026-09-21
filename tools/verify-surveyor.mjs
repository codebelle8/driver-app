/**
 * 調査員の権限が「本番で実際にそう振る舞うか」を検証する。
 *
 *   node tools/verify-surveyor.mjs
 *
 * db/tests は「スキーマがそう書かれているか」を、
 * こちらは「本番のAPI経由でも同じ結果になるか」を確かめる。
 *
 * 実際に調査員アカウントを作り、そのアカウントとしてAPIを叩き、
 * 終わったら消す。作ったものは finally で必ず片付ける。
 */
import { readFileSync } from 'node:fs';

import { purgeAuditLogs } from './lib/audit-cleanup.mjs';

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv('admin/.env.local');
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_EMAIL = 'surveyor-check@kurumayose.invalid';
const TEST_PASSWORD = 'Kv7mNp2qRt9wXz';

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

async function api(path, { method = 'GET', token = SERVICE, body, prefer } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      apikey: token === SERVICE ? SERVICE : ANON,
      Authorization: `Bearer ${token}`,
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
  return { status: res.status, ok: res.ok, body: parsed };
}

let userId = null;
let facilityId = null;
let publishedId = null;

try {
  console.log(`本番での調査員権限の検証: ${BASE}\n`);

  // --- 準備: 調査員アカウントを作る -----------------------------------------
  // 前回が途中で止まっている場合に備え、残骸を先に消す
  const existing = await api('/auth/v1/admin/users?page=1&per_page=200');
  const stale = (existing.body?.users ?? []).find((u) => u.email === TEST_EMAIL);
  if (stale) await api(`/auth/v1/admin/users/${stale.id}`, { method: 'DELETE' });

  const created = await api('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true },
  });
  if (!created.ok) throw new Error(`アカウント作成に失敗: ${JSON.stringify(created.body)}`);
  userId = created.body.id;
  check('調査員アカウントを発行できる', Boolean(userId));

  const profile = await api('/rest/v1/admin_profiles', {
    method: 'POST',
    body: { user_id: userId, display_name: '検証用調査員', role: 'surveyor' },
  });
  check('surveyor 役割を登録できる', profile.ok, JSON.stringify(profile.body));

  // --- 検証用の公開済み施設を用意する ---------------------------------------
  const categories = await api('/rest/v1/categories?select=id&code=eq.hotel');
  const categoryId = categories.body?.[0]?.id;

  const pub = await api('/rest/v1/facilities', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      code: 'HTL-9901',
      name: '検証用_公開済み',
      name_kana: 'けんしょうようこうかいずみ',
      category_id: categoryId,
      prefecture: '東京都',
      address_line: '検証1-1',
      status: 'published',
    },
  });
  publishedId = pub.body?.[0]?.id;

  // --- 調査員としてログインする ---------------------------------------------
  const signIn = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const session = await signIn.json();
  const token = session.access_token;
  check('調査員としてログインできる', Boolean(token));

  console.log('\n--- 調査員にできること ---');

  const draft = await api('/rest/v1/facilities', {
    method: 'POST',
    token,
    prefer: 'return=representation',
    body: {
      code: 'HTL-9902',
      name: '検証用_下書き',
      name_kana: 'けんしょうようしたがき',
      category_id: categoryId,
      prefecture: '東京都',
      address_line: '検証2-2',
    },
  });
  facilityId = draft.body?.[0]?.id;
  check('surveyor は下書きの施設を登録できる', draft.ok, JSON.stringify(draft.body));

  const edit = await api(`/rest/v1/facilities?id=eq.${facilityId}`, {
    method: 'PATCH',
    token,
    prefer: 'return=representation',
    body: { summary: '調査員による記入' },
  });
  check('surveyor は下書きを編集できる', edit.ok && edit.body?.length === 1);

  console.log('\n--- 調査員にできてはならないこと ---');

  const publish = await api(`/rest/v1/facilities?id=eq.${facilityId}`, {
    method: 'PATCH',
    token,
    body: { status: 'published' },
  });
  check('surveyor は施設を公開できない', !publish.ok, `HTTP ${publish.status}`);

  // 公開済みの行は using に弾かれるため、対象0件になり行が返らない
  const tamper = await api(`/rest/v1/facilities?id=eq.${publishedId}`, {
    method: 'PATCH',
    token,
    prefer: 'return=representation',
    body: { name: '改ざん' },
  });
  check(
    'surveyor は公開済みの施設を書き換えられない',
    !tamper.ok || (tamper.body?.length ?? 0) === 0,
    JSON.stringify(tamper.body),
  );

  const del = await api(`/rest/v1/facilities?id=eq.${publishedId}`, {
    method: 'DELETE',
    token,
    prefer: 'return=representation',
  });
  check(
    'surveyor は施設を削除できない',
    !del.ok || (del.body?.length ?? 0) === 0,
    JSON.stringify(del.body),
  );

  const category = await api('/rest/v1/categories', {
    method: 'POST',
    token,
    body: { code: 'bogus', name: '偽', code_prefix: 'BGS' },
  });
  check('surveyor はカテゴリを追加できない', !category.ok, `HTTP ${category.status}`);

  const logs = await api('/rest/v1/audit_logs?select=id', { token });
  check(
    'surveyor は操作履歴を読めない',
    !logs.ok || (logs.body?.length ?? 0) === 0,
    `HTTP ${logs.status}`,
  );

  const escalate = await api(`/rest/v1/admin_profiles?user_id=eq.${userId}`, {
    method: 'PATCH',
    token,
    prefer: 'return=representation',
    body: { role: 'admin' },
  });
  const after = await api(`/rest/v1/admin_profiles?user_id=eq.${userId}&select=role`);
  check(
    'surveyor は自分を管理者に昇格できない',
    after.body?.[0]?.role === 'surveyor',
    JSON.stringify(escalate.body),
  );

  console.log('\n--- 操作履歴が残っているか ---');

  const audit = await api(
    `/rest/v1/audit_logs?select=action,table_name,actor_id&actor_id=eq.${userId}`,
  );
  const actions = (audit.body ?? []).map((r) => r.action);
  check('調査員の登録操作が記録されている', actions.includes('insert'));
  check('調査員の編集操作が記録されている', actions.includes('update'));
  check(
    '拒否された操作は記録されていない',
    !(audit.body ?? []).some((r) => r.action === 'publish'),
  );
} finally {
  // --- 後片付け ---------------------------------------------------------------
  console.log('\n--- 後片付け ---');

  /*
    消す前に、ぶら下がっている行の id を控える。
    施設を消すと入口も写真も一緒に消え、そのたびに記録が1件ずつ増える。
    id を知らないと、あとで拾えない。
  */
  const touched = [facilityId, publishedId, userId].filter(Boolean);
  for (const id of [facilityId, publishedId].filter(Boolean)) {
    for (const table of ['entry_points', 'photos']) {
      const kids = await api(`/rest/v1/${table}?select=id&facility_id=eq.${id}`);
      for (const k of Array.isArray(kids.body) ? kids.body : []) touched.push(k.id);
    }
  }

  for (const [label, id] of [
    ['下書きの施設', facilityId],
    ['公開済みの施設', publishedId],
  ]) {
    if (!id) continue;
    const res = await api(`/rest/v1/facilities?id=eq.${id}`, { method: 'DELETE' });
    console.log(`  ${res.ok ? '削除' : '削除失敗'}  ${label}`);
  }

  if (userId) {
    // 履歴には actor_id の外部キーがあるため、利用者より先に消す
    await api(`/rest/v1/audit_logs?actor_id=eq.${userId}`, { method: 'DELETE' });
    await api(`/rest/v1/admin_profiles?user_id=eq.${userId}`, { method: 'DELETE' });
    const res = await api(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
    console.log(`  ${res.ok ? '削除' : '削除失敗'}  検証用アカウント`);
  }

  /*
    service_role で行った操作の履歴は actor_id が空になるため、
    上の actor_id 指定では消えない。

    **以前はここで、actor_id が空の記録を全部読んで名前で拾っていた。**
    ところが一度に読める数には上限（1000件）があり、**操作履歴が
    1000件を超えた時点で、今日の記録が読めなくなった。** 黙って
    片付けたつもりになり、「検証用_公開済み」が本番に残り続けた。

    触った行の id で消す。読み込みの上限に左右されない。
  */
  const gone = await purgeAuditLogs(
    (path, init) => api(path, init).then((r) => ({ ok: r.ok, body: r.body })),
    touched,
  );
  console.log(`  削除  検証用の操作履歴 ${gone} 件`);
}

console.log('');
if (failures.length) {
  console.error(`合格 ${pass} 件 / 失敗 ${failures.length} 件`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exitCode = 1;
} else {
  console.log(`合格 ${pass} 件 / 失敗 0 件 — 本番でも調査員の権限は意図どおりです。`);
}
