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

const dirs = ['supabase/migrations', 'db/local', 'db/tests'];
const targets = dirs.flatMap((d) =>
  readdirSync(d)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => join(d, f)),
);

const init = (await import('pg-query-emscripten')).default;
const pg = await init();

let failed = 0;

/**
 * psql のメタコマンド (\set, \echo 等) を取り除く。
 * これらは psql クライアントの指示であって SQL ではないため、
 * PostgreSQL のパーサに渡すと構文エラーになる。
 * 行数を保つため、空行に置き換える。
 */
const stripPsqlMeta = (sql) =>
  sql.split('\n').map((line) => (/^\s*\\/.test(line) ? '' : line)).join('\n');

for (const file of targets) {
  const sql = stripPsqlMeta(readFileSync(file, 'utf8'));
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
