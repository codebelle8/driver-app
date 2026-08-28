/**
 * Storage のバケット設定を、意図した状態へ揃える。
 *
 *   node tools/setup-storage.mjs           確認のみ
 *   node tools/setup-storage.mjs --apply   差異を修正する
 *
 * なぜ SQL ではなくこれが要るのか:
 *   supabase/migrations/20260808000001_storage_buckets.sql は
 *   `insert into storage.buckets ...` でバケットを定義しているが、
 *   本番では容量上限も形式制限も反映されていなかった。
 *   Supabase の Storage はテーブルではなく専用のサービスが管理しており、
 *   SQL で行を書いても、サービス側の設定としては扱われない場合がある。
 *
 *   実際に 2026-08-27、画像専用のはずの facility-photos へ
 *   36MB の APK を投入できてしまうことを確認した。
 *
 *   確実なのは Storage API を使うこと。マイグレーションは
 *   ローカル検証のために残し、本番へはこちらで揃える。
 */
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

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
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const MB = 1024 * 1024;

/**
 * あるべきバケットの姿。
 *
 * いずれも Public にしている理由:
 *   アプリはオフラインで動くため、写真を端末へ保持する。
 *   署名付き URL は有効期限があり、期限切れの写真が端末に残ると
 *   圏外で表示できなくなる。書き込みは別途ポリシーで制限している。
 */
const BUCKETS = [
  {
    id: 'facility-photos',
    public: true,
    // スマートフォンの高画質写真でも収まり、誤って動画を入れた場合は弾ける水準
    file_size_limit: 20 * MB,
    allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    note: '現地写真・進入案内図',
  },
  {
    id: 'catalog',
    public: true,
    file_size_limit: 50 * MB,
    allowed_mime_types: ['application/json', 'application/gzip'],
    note: '配信用カタログ',
  },
  {
    id: 'builds',
    public: true,
    // プロジェクト全体の上限（無料枠は 50MB）を超える値は設定できない。
    // 200MB を指定したところ 413 EntityTooLarge で拒否された。
    // arm64 のみに絞った APK は 36MB のため収まる。
    // CPU 種別を絞らない場合は 90MB になり、この枠には入らない。
    file_size_limit: 50 * MB,
    allowed_mime_types: ['application/vnd.android.package-archive', 'application/octet-stream'],
    note: '動作確認用アプリの配布',
  },
];

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/storage/v1${path}`, {
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
  return { ok: res.ok, status: res.status, body: parsed };
}

/** 同じ設定かどうか。並び順の違いは差異とみなさない。 */
function matches(actual, want) {
  const sameTypes =
    JSON.stringify([...(actual.allowed_mime_types ?? [])].sort()) ===
    JSON.stringify([...want.allowed_mime_types].sort());
  return (
    actual.public === want.public &&
    actual.file_size_limit === want.file_size_limit &&
    sameTypes
  );
}

function describe(bucket) {
  const limit = bucket.file_size_limit
    ? `${Math.round(bucket.file_size_limit / MB)}MB`
    : '無制限';
  const types = bucket.allowed_mime_types?.length
    ? `${bucket.allowed_mime_types.length}種`
    : '制限なし';
  return `公開=${bucket.public} 上限=${limit} 形式=${types}`;
}

console.log(`Storage の設定確認: ${BASE}\n`);

const existing = await api('/bucket');
if (!existing.ok) {
  console.error('バケット一覧を取得できませんでした:', existing.status);
  process.exit(1);
}

const byId = new Map((existing.body ?? []).map((b) => [b.id, b]));
const problems = [];

for (const want of BUCKETS) {
  const actual = byId.get(want.id);

  if (!actual) {
    problems.push({ want, kind: 'create' });
    console.log(`  作成が必要  ${want.id.padEnd(16)} (${want.note})`);
    continue;
  }

  if (matches(actual, want)) {
    console.log(`  OK          ${want.id.padEnd(16)} ${describe(actual)}`);
    continue;
  }

  problems.push({ want, kind: 'update' });
  console.log(`  差異あり    ${want.id.padEnd(16)} (${want.note})`);
  console.log(`                現在: ${describe(actual)}`);
  console.log(`                意図: ${describe(want)}`);
}

if (problems.length === 0) {
  console.log('\n設定は意図どおりです。');
  process.exit(0);
}

if (!APPLY) {
  console.log(`\n${problems.length} 件の差異があります。`);
  console.log('修正するには --apply を付けて実行してください。');
  process.exit(1);
}

console.log('\n修正します...\n');

for (const { want, kind } of problems) {
  const payload = {
    public: want.public,
    file_size_limit: want.file_size_limit,
    allowed_mime_types: want.allowed_mime_types,
  };

  const result =
    kind === 'create'
      ? await api('/bucket', { method: 'POST', body: { id: want.id, name: want.id, ...payload } })
      : await api(`/bucket/${want.id}`, { method: 'PUT', body: payload });

  console.log(
    `  ${result.ok ? '完了' : '失敗'}  ${want.id}` +
      (result.ok ? '' : ` — ${JSON.stringify(result.body).slice(0, 160)}`),
  );
}

// 直したつもりで直っていない、を防ぐため取り直して確かめる
console.log('\n反映を確認します...\n');
const after = await api('/bucket');
const afterById = new Map((after.body ?? []).map((b) => [b.id, b]));

let failed = 0;
for (const want of BUCKETS) {
  const actual = afterById.get(want.id);
  const ok = actual && matches(actual, want);
  if (!ok) failed++;
  console.log(`  ${ok ? 'OK  ' : '失敗'}  ${want.id.padEnd(16)} ${actual ? describe(actual) : '存在しません'}`);
}

console.log('');
if (failed) {
  console.error(`${failed} 件が意図どおりになっていません。`);
  process.exitCode = 1;
} else {
  console.log('すべて意図どおりに設定されました。');
}
