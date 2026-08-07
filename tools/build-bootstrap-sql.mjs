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
const OUT = 'supabase/_bootstrap.sql';

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
if (files.length === 0) throw new Error(`${DIR} に SQL がありません`);

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
