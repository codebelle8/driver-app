/**
 * db/ 配下の SQL を PostgreSQL 本体のパーサ (WASM ビルド) で構文検証する。
 *
 *   node tools/check-sql.mjs
 *
 * サーバーを立てずに構文エラーを検出できる。意味的な検証 (参照先テーブルの
 * 存在確認など) は行われないため、実際の適用は Supabase 上で行うこと。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const targets = [
  ...readdirSync('db/migrations')
    .filter((f) => f.endsWith('.sql'))
    .map((f) => join('db/migrations', f)),
  ...readdirSync('db/seed')
    .filter((f) => f.endsWith('.sql'))
    .map((f) => join('db/seed', f)),
];

const init = (await import('pg-query-emscripten')).default;
const pg = await init();

let failed = 0;

for (const file of targets) {
  const sql = readFileSync(file, 'utf8');
  const result = pg.parse(sql);

  if (result.error) {
    failed++;
    console.error(`FAIL  ${file}`);
    console.error(`      ${result.error.message} (cursor ${result.error.cursorpos})`);
    const upto = sql.slice(0, result.error.cursorpos);
    console.error(`      line ${upto.split('\n').length}`);
  } else {
    const count = result.parse_tree?.stmts?.length ?? 0;
    console.log(`OK    ${file}  (${count} statements)`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} file(s) failed to parse.`);
  process.exit(1);
}
console.log('\nAll SQL files parsed successfully.');
