/**
 * 会員の名簿が守られているかを、外から見る。
 *
 *   node tools/check-account-guard.mjs
 *
 * **なぜ要るか**
 *   アプリの anon キーは配布物の中にあり、解析すれば読める。
 *   会員は自分の行を直せる必要がある（表示名）。**直せる範囲を
 *   間違えると、会員が自分の無料期間を好きなだけ延ばせる。**
 *
 *   RLS は「どの行か」しか絞れない。「どの列か」は列ごとの GRANT で
 *   絞る。そして Supabase は public スキーマの新しい表へ既定で
 *   すべての権限を渡しているため、**足すだけでは絞れない。先に
 *   剥がす必要がある。** これは足し忘れではなく、逆向きの間違いで、
 *   目視では気づけない。だから外から突いて確かめる。
 *
 * 見るのは6点。
 *   1〜3. 未ログイン（anon）から、読めない・書けない・関数を呼べない
 *   4. 登録の関数が存在すること（移行が当たっているか）
 *   5. **会員が自分の無料期間を延ばせないこと**
 *   6. **会員が自分の状態を「支払い済み」にできないこと**
 *
 * 5・6 のために検査用の会員を1人作り、最後に必ず消す。
 */
import { readFileSync } from 'node:fs';

function env(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const appEnv = env('app/.env.local');
const adminEnv = env('admin/.env.local');
const URL_ = appEnv.EXPO_PUBLIC_SUPABASE_URL;
const ANON = appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = adminEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) throw new Error('接続先または鍵がありません');

const anonHead = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };
const svcHead = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

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

// --- 未ログインから ------------------------------------------------------------
console.log('--- 未ログイン（anon）---');
{
  const r = await fetch(`${URL_}/rest/v1/driver_profiles?select=user_id&limit=1`, {
    headers: anonHead,
  });
  const body = await r.text();
  check('会員の名簿を読めない', r.status >= 400, `${r.status} ${body.slice(0, 100)}`);
}
{
  const r = await fetch(`${URL_}/rest/v1/driver_profiles`, {
    method: 'POST',
    headers: anonHead,
    body: JSON.stringify({
      user_id: '00000000-0000-0000-0000-000000000000',
      trial_ends_at: '2099-01-01T00:00:00Z',
    }),
  });
  check('会員の名簿へ書けない', r.status >= 400, `${r.status}`);
}
{
  const r = await fetch(`${URL_}/rest/v1/rpc/ensure_driver_profile`, {
    method: 'POST',
    headers: anonHead,
    body: '{}',
  });
  const body = await r.text();
  check('登録の関数を呼べない', r.status >= 400, `${r.status}`);
  check(
    '登録の関数そのものは存在する（未適用ではない）',
    !/could not find the function/i.test(body),
    body.slice(0, 140),
  );
}

// --- ログインした会員から -------------------------------------------------------
console.log('\n--- ログインした会員として ---');

const EMAIL = `kn-guard-${Date.now()}@example.com`;
const PASSWORD = 'kn-guard-password-2026';
let userId = null;

try {
  const made = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svcHead,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  const madeBody = await made.json();
  userId = madeBody.id ?? null;
  if (!userId) {
    check('検査用の会員を作れた', false, JSON.stringify(madeBody).slice(0, 160));
  } else {
    // 会員として入り直し、その人の鍵で叩く
    const signed = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const session = await signed.json();
    const jwt = session.access_token;
    check('検査用の会員でログインできた', !!jwt, JSON.stringify(session).slice(0, 140));

    if (jwt) {
      const me = { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

      // 名簿の行を作らせる（本来の入口）
      await fetch(`${URL_}/rest/v1/rpc/ensure_driver_profile`, {
        method: 'POST',
        headers: me,
        body: '{}',
      });

      const readBack = async () => {
        const r = await fetch(
          `${URL_}/rest/v1/driver_profiles?user_id=eq.${userId}&select=trial_ends_at,status,display_name`,
          { headers: svcHead },
        );
        const rows = await r.json();
        return Array.isArray(rows) && rows.length ? rows[0] : null;
      };

      const before = await readBack();
      check('自分の行ができている', !!before);

      /*
        無料期間を勝手に延ばせないこと。

        RLS は自分の行を通す。列ごとの GRANT で止めていなければ、
        ここが通ってしまう。通れば、会員は無期限に無料で使える。
      */
      const stretch = await fetch(`${URL_}/rest/v1/driver_profiles?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: me,
        body: JSON.stringify({ trial_ends_at: '2099-01-01T00:00:00Z' }),
      });
      const afterStretch = await readBack();
      check(
        '会員は自分の無料期間を延ばせない',
        !String(afterStretch?.trial_ends_at ?? '').startsWith('2099'),
        `${stretch.status} → ${afterStretch?.trial_ends_at}`,
      );

      /* 「支払い済み」に自分でできないこと */
      const promote = await fetch(`${URL_}/rest/v1/driver_profiles?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: me,
        body: JSON.stringify({ status: 'active' }),
      });
      const afterPromote = await readBack();
      check(
        '会員は自分を「支払い済み」にできない',
        afterPromote?.status !== 'active',
        `${promote.status} → ${afterPromote?.status}`,
      );

      /* 表示名は変えられること（絞りすぎていないか） */
      const rename = await fetch(`${URL_}/rest/v1/driver_profiles?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: me,
        body: JSON.stringify({ display_name: '検査' }),
      });
      const afterRename = await readBack();
      check(
        '表示名は自分で変えられる',
        afterRename?.display_name === '検査',
        `${rename.status} → ${afterRename?.display_name}`,
      );
    }
  }
} finally {
  if (userId) {
    await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svcHead });
  }
  const left = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: svcHead });
  const j = await left.json();
  check('検査用の会員を消した', !(j.users ?? []).some((u) => u.email === EMAIL));

  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
