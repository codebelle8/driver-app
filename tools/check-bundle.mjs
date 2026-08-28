/**
 * 公開中の管理画面が、秘匿すべき値をブラウザへ配信していないか検査する。
 *
 *   node tools/check-bundle.mjs
 *   node tools/check-bundle.mjs https://別の公開先.vercel.app
 *
 * なぜ必要か:
 *   Next.js は `NEXT_PUBLIC_` の付いた変数だけをブラウザ向けの成果物へ
 *   埋め込む。この規約に頼れば安全なはずだが、
 *
 *     - サーバー専用のはずのモジュールをクライアント側から import した
 *     - 変数名の頭に NEXT_PUBLIC_ を付けてしまった
 *     - サーバーコンポーネントから props で値を渡してしまった
 *
 *   のいずれかが起きると、規約とは無関係に値が配信物へ混入する。
 *   コードを読んで確かめるのではなく、**実際に配信されている物を取得して**
 *   確かめるのがこの検査の役割。
 */
import { readFileSync } from 'node:fs';

const DEFAULT_URL = 'https://kurumayose-navi-admin.vercel.app';
const BASE = (process.argv[2] ?? DEFAULT_URL).replace(/\/$/, '');

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv('admin/.env.local');

/** 配信されていたら事故になる値 */
const MUST_NOT_APPEAR = [
  ['service_role キー', env.SUPABASE_SERVICE_ROLE_KEY],
  ['文字列 "service_role"', 'service_role'],
];

/** 配信されていて正常な値（無い方がおかしい） */
const MUST_APPEAR = [['anon キー', env.NEXT_PUBLIC_SUPABASE_ANON_KEY]];

/** 検査対象の画面。ログイン前に到達できるのはここだけ。 */
const PAGES = ['/login'];

console.log(`検査対象: ${BASE}\n`);

let served = '';
const files = new Set();

for (const page of PAGES) {
  const res = await fetch(`${BASE}${page}`);
  if (!res.ok) {
    console.error(`  ${page} の取得に失敗しました（${res.status}）`);
    process.exitCode = 1;
    continue;
  }
  const html = await res.text();
  served += html;

  // ページが読み込む JavaScript も本体と同じく「配信物」なので中身を見る
  for (const m of html.matchAll(/(?:src|href)="(\/_next\/[^"]+\.js)"/g)) {
    files.add(m[1]);
  }
}

for (const file of files) {
  const res = await fetch(`${BASE}${file}`);
  if (res.ok) served += await res.text();
}

console.log(`  取得した画面        ${PAGES.length} 件`);
console.log(`  取得した JavaScript ${files.size} 件`);
console.log(`  検査した総量        ${(served.length / 1024).toFixed(0)} KB\n`);

let failed = 0;

for (const [label, value] of MUST_NOT_APPEAR) {
  if (!value) {
    console.log(`  skip  ${label}（.env.local に値が無いため検査できません）`);
    continue;
  }
  if (served.includes(value)) {
    console.error(`  失敗  ${label} が配信物に含まれています`);
    failed++;
  } else {
    console.log(`  合格  ${label} は配信されていません`);
  }
}

for (const [label, value] of MUST_APPEAR) {
  if (!value) continue;
  if (served.includes(value)) {
    console.log(`  合格  ${label} は配信されています（設計どおり）`);
  } else {
    // 配信されていない = ブラウザから Supabase へ接続できない状態
    console.error(`  失敗  ${label} が配信されていません。ログインできないはずです`);
    failed++;
  }
}

console.log('');
if (failed) {
  console.error(`${failed} 件の問題があります。公開を取り下げて原因を調べてください。`);
  process.exitCode = 1;
} else {
  console.log('問題ありません。秘匿すべき値は配信されていません。');
}
