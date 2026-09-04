/**
 * supabase/migrations/ を1つの SQL にまとめる。
 *
 *   node tools/build-bootstrap-sql.mjs
 *   → supabase/_bootstrap.sql
 *
 * 用途:
 *   アクセストークンが無く `supabase db push` が使えない場合に、
 *   Supabase ダッシュボードの SQL Editor へ貼り付けて適用するための一括ファイル。
 *
 * 重要:
 *   SQL Editor で流すと CLI のマイグレーション履歴が記録されないため、
 *   後で `supabase db push` を実行した際に同じ SQL を再適用しようとして失敗する。
 *   それを防ぐため、履歴テーブルへの登録も末尾に含める。
 *
 *   生成物は派生ファイルのため Git 管理外 (.gitignore 済み)。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';

/**
 * --only <接頭辞> を付けると、その接頭辞で始まるマイグレーションだけを出力する。
 *
 *   node tools/build-bootstrap-sql.mjs --only 20260827
 *   → supabase/_pending.sql
 *
 * 既にテーブルがある本番へ全件を流すと、最初の create table で衝突して
 * 止まってしまう。追加分だけを適用したい場面のためのもの。
 *
 * 接頭辞はカンマで複数指定できる。未適用のものが日付をまたいで
 * 飛び飛びに残る場合があり、1つの接頭辞では選べない。
 *
 *   node tools/build-bootstrap-sql.mjs --only 20260828,20260829,20260830
 */
const onlyIndex = process.argv.indexOf('--only');
const ONLY =
  onlyIndex === -1
    ? null
    : (process.argv[onlyIndex + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = ONLY ? 'supabase/_pending.sql' : 'supabase/_bootstrap.sql';

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .filter((f) => (ONLY ? ONLY.some((p) => f.startsWith(p)) : true))
  .sort();
if (files.length === 0) {
  throw new Error(
    ONLY
      ? `${DIR} に ${ONLY.join(' / ')} で始まる SQL がありません`
      : `${DIR} に SQL がありません`,
  );
}

const parts = [
  '-- =============================================================================',
  '-- 車寄せナビ — 一括適用ファイル (自動生成)',
  '--',
  '--   生成: node tools/build-bootstrap-sql.mjs',
  '--   用途: Supabase ダッシュボード → SQL Editor に貼り付けて実行',
  '--',
  '-- このファイルは編集しないこと。supabase/migrations/ を編集して再生成する。',
  '-- =============================================================================',
  '',
];

for (const f of files) {
  parts.push(
    '',
    `-- ▼▼▼ ${f} ▼▼▼`,
    '',
    readFileSync(join(DIR, f), 'utf8').trimEnd(),
    '',
    `-- ▲▲▲ ${f} ▲▲▲`,
    '',
  );
}

// CLI のマイグレーション履歴を記録し、後の `supabase db push` と整合させる
const rows = files
  .map((f) => {
    const version = f.split('_')[0];
    const name = f.replace(/^\d+_/, '').replace(/\.sql$/, '');
    return `  ('${version}', '${name}')`;
  })
  .join(',\n');

parts.push(
  '',
  '-- =============================================================================',
  '-- Supabase CLI のマイグレーション履歴を記録する',
  '--   これを入れておかないと、後で `supabase db push` を実行した際に',
  '--   同じマイグレーションを再適用しようとして失敗する。',
  '-- =============================================================================',
  'create schema if not exists supabase_migrations;',
  '',
  'create table if not exists supabase_migrations.schema_migrations (',
  '  version    text primary key,',
  '  statements text[],',
  '  name       text',
  ');',
  '',
  'insert into supabase_migrations.schema_migrations (version, name) values',
  `${rows}`,
  'on conflict (version) do nothing;',
  '',
);

const sql = parts.join('\n');
writeFileSync(OUT, sql, 'utf8');

console.log(`${OUT} を生成しました`);
console.log(`  対象 ${files.length} ファイル / ${sql.split('\n').length} 行 / ${(Buffer.byteLength(sql) / 1024).toFixed(1)} KB`);
files.forEach((f) => console.log(`  - ${f}`));

// -----------------------------------------------------------------------------
// 1回の貼り付けで流せない組み合わせを検出して知らせる
//
// SQL Editor は貼り付けた内容をまとめて1つのトランザクションとして実行する。
// PostgreSQL は「列挙型へ追加した値」を、追加したトランザクション内では
// 使わせない。したがって alter type ... add value を含む場合、
// 後続のマイグレーションと同時に流すと必ず失敗する。
// -----------------------------------------------------------------------------
const enumAdders = files.filter((f) =>
  /alter\s+type[\s\S]*?add\s+value/i.test(readFileSync(join(DIR, f), 'utf8')),
);

if (enumAdders.length > 0 && files.length > 1) {
  console.log('');
  console.log('  注意: 1回でまとめて実行できません。');
  console.log('  次のファイルは列挙型へ値を追加しており、追加した値は');
  console.log('  同じトランザクション内では使えません。');
  enumAdders.forEach((f) => console.log(`    - ${f}`));
  console.log('');
  console.log('  supabase/migrations/ の各ファイルを、名前順に1つずつ');
  console.log('  SQL Editor へ貼り付けて実行してください。');
}
