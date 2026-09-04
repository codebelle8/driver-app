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

let failed = 0;

/**
 * psql のメタコマンド (\set, \echo 等) を取り除く。
 * これらは psql クライアントの指示であって SQL ではないため、
 * PostgreSQL のパーサに渡すと構文エラーになる。
 * 行数を保つため、空行に置き換える。
 */
const stripPsqlMeta = (sql) =>
  sql.split('\n').map((line) => (/^\s*\\/.test(line) ? '' : line)).join('\n');

/**
 * psql の変数参照 (:SURVEYOR、:'NAME') を仮の文字列に置き換える。
 *
 * db/tests/ は `\set SURVEYOR '…'` で定めた値を `:SURVEYOR` として使う。
 * 置き換えないと「: の近くで構文エラー」となり、実際には正しい SQL が
 * 落ちたものとして数えられる。
 *
 * 型キャスト (`::text`) と代入 (`:=`) は別物なので巻き込まない。
 * 文字数を保つため、変数名と同じ長さの文字列に置き換える。誤りの位置が
 * ずれないようにするため。
 */
const fillPsqlVars = (sql) =>
  sql.replace(/(^|[^:\w]):'?([A-Za-z_][A-Za-z0-9_]*)'?/g, (all, before, name) =>
    `${before}'${'x'.repeat(Math.max(1, all.length - before.length - 2))}'`,
  );

for (const file of targets) {
  const sql = fillPsqlVars(stripPsqlMeta(readFileSync(file, 'utf8')));

  /*
    ファイルごとにパーサを作り直す。

    1つのパーサで13ファイルを続けて解析すると、WASM 側が
    「Ma[...] is not a function」で落ちる（Node 24 で再現）。
    作り直せば起きない。検証に数秒かかるが、確実に全件を見られる。
  */
  const pg = await init();
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
