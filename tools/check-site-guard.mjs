/**
 * 規約類の掲載先が守られているかを、外から見る。
 *
 *   node tools/check-site-guard.mjs
 *
 * **なぜ要るか**
 *   ここには**お問い合わせ先**が入る。会員が書き換えられると、
 *   利用者を別の宛先へ誘導できてしまう。掲載先のURLも同じで、
 *   偽の規約や偽の窓口へ差し替えられる。
 *
 *   会員は「読める」必要があり（読めなければ画面に出せない）、
 *   「書けない」必要がある。読み書きを1つの表で分けるので、
 *   目視では確かめきれない。外から突く。
 *
 *   Supabase は public スキーマの新しい表へ既定ですべての権限を
 *   渡している。**足すだけでは絞れない。先に剥がす。**
 *   （20260908000003 の顛末。同じ穴を二度あけない。）
 *
 * 見るのは5点。
 *   1. 未ログイン（anon）から読めない
 *   2. 未ログイン（anon）から書けない
 *   3. **会員は読める**（画面に出すために要る）
 *   4. **会員は書けない**
 *   5. 会員は行を増やせない
 *
 * 3〜5 のために検査用の会員を1人作り、最後に必ず消す。
 */
import { connect, createMember, removeMember } from './lib/member.mjs';

const conn = connect();
const anonHead = {
  apikey: conn.anon,
  Authorization: `Bearer ${conn.anon}`,
  'Content-Type': 'application/json',
};

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

/** いま入っている値。書き換わっていないことを、これで見る。 */
const readBack = async () => {
  const r = await fetch(`${conn.url}/rest/v1/site_settings?id=eq.1&select=*`, { headers: conn.svc });
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
};

let member = null;

try {
  console.log(
    `掲載先の守りの検査: ${conn.url.replace(/https:\/\/([^.]+)\./, 'https://***.')}\n`,
  );

  const before = await readBack();
  check('表がある（移行が当たっている）', before !== null);

  // --- 未ログインから ---------------------------------------------------------
  console.log('\n--- 未ログイン（anon）---');
  {
    const r = await fetch(`${conn.url}/rest/v1/site_settings?select=id&limit=1`, {
      headers: anonHead,
    });
    check('掲載先を読めない', r.status >= 400, `${r.status}`);
  }
  {
    const r = await fetch(`${conn.url}/rest/v1/site_settings?id=eq.1`, {
      method: 'PATCH',
      headers: anonHead,
      body: JSON.stringify({ contact_email: 'attacker@example.com' }),
    });
    check('掲載先を書き換えられない', r.status >= 400, `${r.status}`);
  }

  // --- ログインした会員から ---------------------------------------------------
  console.log('\n--- ログインした会員として ---');
  member = await createMember(conn, 'siteguard');

  const signed = await fetch(`${conn.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: conn.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: member.email, password: member.password }),
  });
  const session = await signed.json();
  const jwt = session.access_token;
  check('検査用の会員でログインできた', !!jwt, JSON.stringify(session).slice(0, 140));

  if (jwt) {
    const me = { apikey: conn.anon, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

    {
      const r = await fetch(
        `${conn.url}/rest/v1/site_settings?id=eq.1&select=terms_url,privacy_url,law_url,contact_email`,
        { headers: me },
      );
      const body = await r.text();
      check('会員は読める（画面に出せる）', r.ok, `${r.status} ${body.slice(0, 120)}`);
    }

    {
      const r = await fetch(`${conn.url}/rest/v1/site_settings?id=eq.1`, {
        method: 'PATCH',
        headers: me,
        body: JSON.stringify({ contact_email: 'attacker@example.com' }),
      });
      const after = await readBack();
      check(
        '会員はお問い合わせ先を書き換えられない',
        after?.contact_email !== 'attacker@example.com',
        `${r.status} → ${after?.contact_email}`,
      );
    }

    {
      const r = await fetch(`${conn.url}/rest/v1/site_settings?id=eq.1`, {
        method: 'PATCH',
        headers: me,
        body: JSON.stringify({ terms_url: 'https://attacker.example.com/terms' }),
      });
      const after = await readBack();
      check(
        '会員は掲載先を差し替えられない',
        after?.terms_url !== 'https://attacker.example.com/terms',
        `${r.status} → ${after?.terms_url}`,
      );
    }

    {
      const r = await fetch(`${conn.url}/rest/v1/site_settings`, {
        method: 'POST',
        headers: me,
        body: JSON.stringify({ id: 1, contact_email: 'attacker@example.com' }),
      });
      check('会員は行を増やせない', r.status >= 400, `${r.status}`);
    }
  }

  const after = await readBack();
  check(
    '検査の前後で中身が変わっていない',
    JSON.stringify(before) === JSON.stringify(after),
    `${JSON.stringify(before)} → ${JSON.stringify(after)}`,
  );
} finally {
  console.log('\n--- 後片付け ---');
  if (member) check('検査用の会員を消した', await removeMember(conn, member));

  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
