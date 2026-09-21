/**
 * 操作履歴のうち、当方の検査が残したものを洗い出す。
 *
 *   node tools/list-test-audit.mjs              一覧を出すだけ
 *   node tools/list-test-audit.mjs --delete     消す
 *
 * **数えるだけと、消すのを分ける。**
 *   以前、一括で消して**発注元ご自身の記録を200件巻き添えにした。**
 *   同じことを繰り返さないよう、まず何が当たるのかを目で見られる形で
 *   出し、消すのは別の指示でだけ行う。
 *
 * **当たりの決め方**
 *   検査が作る値は、必ず次のどれかを含む。本番のデータは含まない。
 *
 *     ZZZ-0000            検査用の施設コード
 *     @example.com        検査用の会員（規格で予約された、届かない領域）
 *     kurumayose.invalid  検査用の職員（同じく届かない領域）
 *     verify/             検査用の写真の置き場
 *     検査用 / 検証用     検査用の表示名・施設名・カテゴリ名
 *     通し検査 / 写真の検査 同上
 *
 *   **「検査」の2文字だけでは広すぎる**ため、本番のデータに同じ語が
 *   入っていないことも併せて数える。1件でも当たれば、そこで止める。
 */
import { readFileSync } from 'node:fs';

const NL = String.fromCharCode(10);
const remove = process.argv.includes('--delete');

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(NL)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv('admin/.env.local');
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) throw new Error('接続先または鍵がありません');

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const get = async (path) => {
  const r = await fetch(`${SB}${path}`, { headers: H });
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};

/** 検査が作った値の目印 */
const MARKS = [
  'ZZZ-0000',
  '@example.com',
  'kurumayose.invalid',
  'verify/',
  '通し検査',
  '検査用',
  '検証用',
  '期限の検査',
  '写しの検査',
  '保存の検査',
  '写真の検査',
  '検証用調査員',
];

/* --- 全部読む ------------------------------------------------------------- */

let rows = [];
for (let from = 0; ; from += 1000) {
  const page = await get(
    `/rest/v1/audit_logs?select=id,created_at,actor_id,action,table_name,record_id,diff` +
      `&order=id.asc&offset=${from}&limit=1000`,
  );
  if (!Array.isArray(page) || page.length === 0) break;
  rows = rows.concat(page);
  if (page.length < 1000) break;
}

const hit = (x) => {
  const s = JSON.stringify(x.diff ?? {});
  return MARKS.find((m) => s.includes(m)) ?? null;
};

const mine = rows.filter((x) => hit(x));
const theirs = rows.filter((x) => !hit(x));

console.log(`操作履歴 ${rows.length} 件${NL}`);
console.log(`  当方の検査が残したもの  ${mine.length} 件`);
console.log(`  それ以外                ${theirs.length} 件${NL}`);

/* --- 内訳 ----------------------------------------------------------------- */

const tally = (list, key) => {
  const m = new Map();
  for (const x of list) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log('  日付ごと');
for (const [d, n] of tally(mine, (x) => String(x.created_at).slice(0, 10)).sort()) {
  console.log(`    ${d}  ${String(n).padStart(3)} 件`);
}

console.log(`${NL}  表ごと`);
for (const [t, n] of tally(mine, (x) => x.table_name)) {
  console.log(`    ${t.padEnd(16)} ${String(n).padStart(3)} 件`);
}

console.log(`${NL}  目印ごと`);
for (const [m, n] of tally(mine, (x) => hit(x))) {
  console.log(`    ${m.padEnd(20)} ${String(n).padStart(3)} 件`);
}

/* --- 消す先の行が、まだ残っていないか ------------------------------------- */

const ids = [...new Set(mine.map((x) => x.record_id).filter(Boolean))];
let alive = 0;
for (const table of ['facilities', 'entry_points', 'photos', 'categories', 'admin_profiles']) {
  const targets = mine.filter((x) => x.table_name === table).map((x) => x.record_id);
  const uniq = [...new Set(targets.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50);
    const key = table === 'admin_profiles' ? 'user_id' : 'id';
    const found = await get(`/rest/v1/${table}?select=${key}&${key}=in.(${chunk.join(',')})`);
    if (Array.isArray(found) && found.length > 0) {
      alive += found.length;
      console.log(`${NL}  ※ ${table} に、まだ残っている行があります: ${found.length} 件`);
    }
  }
}
console.log(
  `${NL}  対象が指す ${ids.length} 件の行のうち、いま存在するもの: ${alive} 件` +
    (alive === 0 ? '（すべて削除済み）' : ''),
);

/* --- いちばん古い行（半年ごとの整理に関わる）------------------------------ */

const oldest = rows[0];
const oldestMine = mine[0];
console.log(
  `${NL}  いちばん古い記録  全体: ${String(oldest?.created_at).slice(0, 10)}` +
    ` / 当方のぶん: ${String(oldestMine?.created_at).slice(0, 10)}`,
);

if (!remove) {
  console.log(`${NL}（--delete を付けると、上の ${mine.length} 件を消します）`);
  process.exit(0);
}

/* --- 消す ----------------------------------------------------------------- */

let gone = 0;
for (let i = 0; i < mine.length; i += 100) {
  const chunk = mine.slice(i, i + 100).map((x) => x.id);
  const r = await fetch(`${SB}/rest/v1/audit_logs?id=in.(${chunk.join(',')})`, {
    method: 'DELETE',
    headers: { ...H, Prefer: 'return=representation' },
  });
  if (r.ok) {
    const b = await r.json();
    gone += Array.isArray(b) ? b.length : 0;
  }
}
console.log(`${NL}  ${gone} 件を消しました。`);

const left = await get('/rest/v1/audit_logs?select=id&limit=1&order=id.desc');
const after = await get('/rest/v1/audit_logs?select=id');
console.log(`  残り ${Array.isArray(after) ? after.length : '?'} 件`);
