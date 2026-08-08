/**
 * 本番 Supabase に対して、anon キーで到達できる範囲を検証する。
 *
 *   node tools/verify-production.mjs
 *
 * ローカルの db/tests は「スキーマがそう書かれているか」を検証する。
 * こちらは「本番で実際にそう振る舞うか」を検証する。
 *
 * 両方が必要な理由:
 *   Supabase は public スキーマの新規テーブルへ anon に既定で権限を付与する。
 *   このためローカルと本番で権限構成がずれることがあり、実際に 2026-08-08 に
 *   その差異を検出した。以後、本番への変更後は必ずこれを実行する。
 *
 * 認証情報は admin/.env.local から読む（リポジトリには含めない）。
 */
import { readFileSync } from 'node:fs';

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
if (!BASE || !ANON) throw new Error('admin/.env.local に URL / anon key がありません');

let pass = 0;
const failures = [];

async function check({ label, path, method = 'GET', body, mustDeny }) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ok = res.ok;
  const text = ok ? '' : await res.text();

  if (mustDeny ? !ok : ok) {
    pass++;
    console.log(`  PASS  ${label}${mustDeny ? ` (HTTP ${res.status})` : ''}`);
  } else {
    const msg = `${label} -> HTTP ${res.status} ${text}`.trim();
    failures.push(msg);
    console.error(`  FAIL  ${msg}`);
  }
}

console.log(`本番環境の検証: ${BASE}\n`);

console.log('--- anon が触れてはならないもの ---');
await check({ label: 'anon は管理者テーブルを読めない', path: 'admin_profiles?select=role', mustDeny: true });
await check({ label: 'anon は監査ログを読めない', path: 'audit_logs?select=id', mustDeny: true });
await check({
  label: 'anon は施設を追加できない', path: 'facilities', method: 'POST', mustDeny: true,
  body: { code: 'HTL-9999', name: 'probe', name_kana: 'probe', prefecture: '東京都', address_line: 'probe' },
});
await check({
  label: 'anon はカテゴリを追加できない', path: 'categories', method: 'POST', mustDeny: true,
  body: { code: 'probe', name: 'probe', code_prefix: 'PRB' },
});
await check({
  label: 'anon は自分を管理者にできない', path: 'admin_profiles', method: 'POST', mustDeny: true,
  body: { user_id: '00000000-0000-0000-0000-000000000000', display_name: 'probe', role: 'admin' },
});

console.log('\n--- アプリが必要とする読み取り ---');
for (const [label, path] of [
  ['カテゴリを読める', 'categories?select=name'],
  ['施設を読める（公開済みのみ）', 'facilities?select=code'],
  ['進入口を読める', 'entry_points?select=id'],
  ['注意事項を読める', 'cautions?select=id'],
  ['写真を読める', 'photos?select=id'],
]) {
  await check({ label: `anon は${label}`, path, mustDeny: false });
}

console.log('');
if (failures.length) {
  console.error(`合格 ${pass} 件 / 失敗 ${failures.length} 件`);
  process.exit(1);
}
console.log(`合格 ${pass} 件 / 失敗 0 件 — 本番の権限構成は意図どおりです。`);
