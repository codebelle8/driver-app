/**
 * 検証で残った操作履歴を掃除する。
 *
 *   node tools/purge-verify-logs.mjs          対象を見るだけ
 *   node tools/purge-verify-logs.mjs --apply  消す
 *
 * **なぜ要るか**
 *   各検査は自分で後片付けをするが、取りこぼしが出ることがある。
 *   実際に「作った行の id を控え忘れる」「後片付けを合否の分岐の
 *   中に置いてしまう」という抜けがあり、発注元の操作履歴に
 *   検証用の行が紛れ込んだ。抜けは形を変えて再び起きるため、
 *   まとめて掃除できる手立てを別に持っておく。
 *
 * **何を対象にするか**
 *   「指している行がもう存在しない記録」だけ。消えた記録を指す行は、
 *   その対象がもう無いことを意味する。発注元が実際に消したものも
 *   同じ形になるため、既定では当日ぶんだけを見る。
 */
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const dayIndex = process.argv.indexOf('--since');
const SINCE = dayIndex === -1 ? new Date().toISOString().slice(0, 10) : process.argv[dayIndex + 1];

const env = {};
for (const l of readFileSync('admin/.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const sb = async (p, method = 'GET') => {
  const r = await fetch(SB + p, {
    method,
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
  });
  const t = await r.text();
  return { ok: r.ok, body: t ? JSON.parse(t) : null };
};

const all = await sb(
  `/rest/v1/audit_logs?select=id,table_name,action,record_id,diff,created_at&created_at=gte.${SINCE}&order=created_at.desc&limit=2000`,
);
const rows = all.body ?? [];
console.log(`${SINCE} 以降の操作履歴: ${rows.length} 件`);

/** その行がまだ在るか。表ごとにまとめて引く。 */
const alive = new Map();
for (const table of [...new Set(rows.map((r) => r.table_name))]) {
  const ids = [
    ...new Set(rows.filter((r) => r.table_name === table && r.record_id).map((r) => r.record_id)),
  ];
  const key = table === 'admin_profiles' ? 'user_id' : 'id';
  const found = new Set();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await sb(`/rest/v1/${table}?select=${key}&${key}=in.(${ids.slice(i, i + 100).join(',')})`);
    for (const row of r.body ?? []) found.add(row[key]);
  }
  alive.set(table, found);
}

const dead = rows.filter((r) => r.record_id && !alive.get(r.table_name)?.has(r.record_id));
console.log(`指している行がもう無いもの: ${dead.length} 件`);

const byTable = {};
for (const r of dead) byTable[r.table_name] = (byTable[r.table_name] ?? 0) + 1;
for (const [t, n] of Object.entries(byTable)) console.log(`  ${t}: ${n} 件`);

for (const r of dead.slice(0, 8)) {
  console.log(`  ${r.created_at.slice(11, 19)} ${r.table_name} ${r.action} ${JSON.stringify(r.diff).slice(0, 55)}`);
}

if (!APPLY) {
  console.log('\n消すには --apply を付けてください');
  process.exit(0);
}

let gone = 0;
for (let i = 0; i < dead.length; i += 100) {
  const ids = dead.slice(i, i + 100).map((r) => r.id);
  const res = await sb(`/rest/v1/audit_logs?id=in.(${ids.join(',')})`, 'DELETE');
  if (res.ok) gone += (res.body ?? []).length;
}
console.log(`\n${gone} 件を消しました`);
