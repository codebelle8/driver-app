/**
 * プッシュ通知まわりの守りを、外から見る。
 *
 *   node tools/check-push-guard.mjs
 *
 * **なぜ要るか**
 *   配信の秘密鍵が会員に読めると、誰でも全員の端末へ通知を送れる。
 *   RLS は「どの行か」しか絞らず、列は GRANT で絞る。**足すだけでは
 *   絞れない**（20260908000003 の顛末）。外から突いて確かめる。
 *
 *   宛先（endpoint）も同じ。他人の宛先が読めれば、その端末へ送れる。
 *
 * 見るのは6点。
 *   1. 未ログインから、鍵も宛先も読めない
 *   2. 会員は公開鍵を読める（読めないと購読できない）
 *   3. 会員は秘密鍵を読めない
 *   4. 会員は自分の宛先を登録できる
 *   5. 会員は他人の宛先を読めない
 *   6. 後片付け
 */
import { connect, createMember, removeMember } from './lib/member.mjs';

const conn = connect();

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label} ${detail}`);
  }
};

const anon = { apikey: conn.anon, Authorization: `Bearer ${conn.anon}`, 'Content-Type': 'application/json' };

let a = null;
let b = null;

try {
  console.log('プッシュ通知の守りの検査\n');

  // --- 1. 未ログインから -------------------------------------------------------
  console.log('--- 未ログイン ---');
  for (const [name, path] of [
    ['配信の鍵', '/rest/v1/push_settings?id=eq.1&select=public_key'],
    ['宛先', '/rest/v1/push_subscriptions?select=endpoint'],
  ]) {
    const r = await fetch(`${conn.url}${path}`, { headers: anon });
    check(`${name}を読めない`, r.status >= 400, `${r.status}`);
  }

  a = await createMember(conn, 'push-a');
  b = await createMember(conn, 'push-b');

  const tokenOf = async (m) => {
    const r = await fetch(`${conn.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: m.email, password: m.password }),
    });
    return (await r.json()).access_token;
  };
  const headers = (jwt) => ({
    apikey: conn.anon,
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  });

  const aHead = headers(await tokenOf(a));
  const bHead = headers(await tokenOf(b));

  // --- 2〜3. 鍵 ----------------------------------------------------------------
  console.log('\n--- 会員として（鍵）---');
  {
    const r = await fetch(`${conn.url}/rest/v1/push_settings?id=eq.1&select=public_key`, {
      headers: aHead,
    });
    check('会員は公開鍵を読める', r.ok, `${r.status}`);
  }
  {
    const r = await fetch(`${conn.url}/rest/v1/push_settings?id=eq.1&select=private_key`, {
      headers: aHead,
    });
    const body = await r.text();
    check(
      '会員は秘密鍵を読めない',
      !r.ok,
      `${r.status} ${body.slice(0, 90)}`,
    );
  }

  // --- 4〜5. 宛先 --------------------------------------------------------------
  console.log('\n--- 会員として（宛先）---');
  const endpoint = `https://example.com/push/${Date.now()}`;
  {
    const r = await fetch(`${conn.url}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers: aHead,
      body: JSON.stringify({
        user_id: a.userId,
        endpoint,
        p256dh: 'test-p256dh',
        auth: 'test-auth',
      }),
    });
    check('自分の宛先を登録できる', r.ok, `${r.status} ${(await r.text()).slice(0, 90)}`);
  }
  {
    const r = await fetch(
      `${conn.url}/rest/v1/push_subscriptions?select=endpoint&endpoint=eq.${encodeURIComponent(endpoint)}`,
      { headers: bHead },
    );
    const rows = await r.json();
    check(
      '他人の宛先は読めない',
      Array.isArray(rows) && rows.length === 0,
      JSON.stringify(rows).slice(0, 90),
    );
  }
  {
    const r = await fetch(`${conn.url}/rest/v1/push_subscriptions?select=endpoint`, {
      headers: aHead,
    });
    const rows = await r.json();
    check('自分の宛先は読める', Array.isArray(rows) && rows.length === 1, JSON.stringify(rows).slice(0, 90));
  }
} finally {
  console.log('\n--- 後片付け ---');
  check('検査で作った会員Aを消した', await removeMember(conn, a));
  check('検査で作った会員Bを消した', await removeMember(conn, b));

  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
