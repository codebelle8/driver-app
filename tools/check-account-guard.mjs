/**
 * 会員の名簿が、鍵を持っているだけの相手から守られているかを外から見る。
 *
 *   node tools/check-account-guard.mjs
 *
 * **なぜ要るか**
 *   アプリの anon キーは配布物の中にあり、解析すれば読める。
 *   「RLS を有効にした」だけでは足りず、GRANT の付け外しを誤ると
 *   会員のメールアドレスや無料期間が誰にでも読める状態になる。
 *
 *   ここでは何も書き込まない。読めないこと・呼べないことだけを確かめる。
 *
 * 見るのは3点。
 *   1. anon で driver_profiles を読めないこと
 *   2. anon で driver_profiles へ書けないこと
 *   3. anon で ensure_driver_profile() を呼べないこと
 */
import { readFileSync } from 'node:fs';

/** app/.env.local から読む。値は画面に出さない。 */
function env() {
  const raw = readFileSync('app/.env.local', 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const e = env();
const URL_ = e.EXPO_PUBLIC_SUPABASE_URL;
const KEY = e.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) throw new Error('app/.env.local に接続先がありません');

const head = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

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

console.log(`会員の名簿の守りの検査: ${URL_.replace(/https:\/\/([^.]+)\./, 'https://***.')}\n`);

// 1. 読めないこと
{
  const r = await fetch(`${URL_}/rest/v1/driver_profiles?select=user_id&limit=1`, { headers: head });
  const body = await r.text();
  check(
    'anon では会員の名簿を読めない',
    r.status === 401 || r.status === 403 || r.status === 404,
    `${r.status} ${body.slice(0, 120)}`,
  );
}

// 2. 書けないこと（存在しない利用者を差し込もうとする。通れば重大）
{
  const r = await fetch(`${URL_}/rest/v1/driver_profiles`, {
    method: 'POST',
    headers: head,
    body: JSON.stringify({
      user_id: '00000000-0000-0000-0000-000000000000',
      trial_ends_at: '2099-01-01T00:00:00Z',
    }),
  });
  const body = await r.text();
  check(
    'anon では会員の名簿へ書けない',
    r.status >= 400,
    `${r.status} ${body.slice(0, 120)}`,
  );
}

// 3. 登録の関数を呼べないこと
{
  const r = await fetch(`${URL_}/rest/v1/rpc/ensure_driver_profile`, {
    method: 'POST',
    headers: head,
    body: '{}',
  });
  const body = await r.text();
  check(
    'anon では登録の関数を呼べない',
    r.status >= 400,
    `${r.status} ${body.slice(0, 160)}`,
  );

  /*
    「関数が無い」と「呼ぶ権限が無い」を見分ける。

    PostgREST はどちらも 404 で返すことがある。移行が当たっていない
    のに「守られている」と読み違えないよう、文面まで見る。
  */
  check(
    '登録の関数そのものは存在する（未適用ではない）',
    !/could not find the function/i.test(body),
    body.slice(0, 160),
  );
}

console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
for (const f of failures) console.error(`  - ${f}`);
process.exitCode = failures.length ? 1 : 0;
