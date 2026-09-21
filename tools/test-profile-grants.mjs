/**
 * 会員自身が書ける列を、実際に書いて確かめる。
 *
 *   node tools/test-profile-grants.mjs
 *
 * **なぜ要るか**
 *   名簿（driver_profiles）の更新は、**列ごとに**渡してある。
 *   ここを取り違えると、静かに二種類の事故が起きる。
 *
 *     渡しすぎ … 会員が自分で status を 'active' にできる。**課金が崩れる**
 *     剥がしすぎ … 別の端末でログインできなくなる（device_id が書けない）
 *
 *   どちらも画面を見ているだけでは気づけない。前者は誰も困らないまま
 *   通り、後者は「久しぶりに開いたら入れない」という形で後から出る。
 *
 *   実際、paid_until を足す移行に `revoke update ... from authenticated`
 *   を書きかけた（2026-09-15）。あれを流していたら、列ごとの権限が
 *   まとめて消え、**料金の刻みも顔写真も端末の符号も書けなくなっていた。**
 *
 * **推測しない。** 権限の一覧を読むのではなく、会員自身の鍵で実際に
 * 書いてみる。通るべきものが通り、弾かれるべきものが弾かれることを見る。
 */
import { connect, createMember, removeMember } from './lib/member.mjs';

const conn = connect();
const NL = String.fromCharCode(10);

let pass = 0;
const fails = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fails.push(label);
    console.error(`  FAIL  ${label}`);
    if (detail) console.error(`        ${detail}`);
  }
};

let member = null;
try {
  member = await createMember(conn, 'grant');

  /* 会員自身の鍵でログインする */
  const r = await fetch(`${conn.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: member.email, password: member.password }),
  });
  const tok = (await r.json()).access_token;
  if (!tok) throw new Error('ログインできません');

  const asMe = {
    apikey: conn.anon,
    Authorization: `Bearer ${tok}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  /* 名簿の行を作らせる（ensure_driver_profile） */
  const made = await fetch(`${conn.url}/rest/v1/rpc/ensure_driver_profile`, {
    method: 'POST',
    headers: asMe,
    body: '{}',
  });
  const row = await made.json();
  check('登録の関数が paid_until まで返す', 'paid_until' in (row ?? {}), JSON.stringify(row).slice(0, 200));

  const put = async (patch) => {
    const res = await fetch(`${conn.url}/rest/v1/driver_profiles?user_id=eq.${member.userId}`, {
      method: 'PATCH',
      headers: asMe,
      body: JSON.stringify(patch),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  };

  /* 書けなければならない列 */
  for (const [name, patch] of [
    ['display_name', { display_name: '検査' }],
    ['plan', { plan: 'quarterly', plan_chosen_at: new Date().toISOString() }],
    ['device_id', { device_id: 'check-device' }],
    ['avatar_path', { avatar_path: null }],
  ]) {
    const res = await put(patch);
    check(`会員自身が ${name} を書ける`, res.ok, `${res.status} ${res.body.slice(0, 160)}`);
  }

  /* 書けてはならない列 */
  for (const [name, patch] of [
    ['paid_until', { paid_until: new Date(Date.now() + 9e10).toISOString() }],
    ['status', { status: 'active' }],
    ['trial_ends_at', { trial_ends_at: new Date(Date.now() + 9e10).toISOString() }],
  ]) {
    const res = await put(patch);
    check(`会員自身は ${name} を書けない`, !res.ok, `${res.status} ${res.body.slice(0, 160)}`);
  }
} finally {
  if (member) {
    const gone = await removeMember(conn, member);
    console.log(`${NL}  片付け  検査用の会員を消しました (${gone})`);
  }
  console.log(`${NL}  ${pass} 件が通り、${fails.length} 件が落ちました`);
  for (const f of fails) console.error(`    - ${f}`);
  process.exitCode = fails.length ? 1 : 0;
}
