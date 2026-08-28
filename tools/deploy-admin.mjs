/**
 * 管理画面を Vercel へ公開する。
 *
 *   node tools/deploy-admin.mjs            本番へ公開
 *   node tools/deploy-admin.mjs --preview  検証用URLへ公開（本番URLは変わらない）
 *
 * 事前に一度だけ `npx vercel login` が必要（ブラウザ認証のため自動化できない）。
 *
 * このスクリプトがやること:
 *   1. ログイン済みか確認する
 *   2. Vercel 上のプロジェクトと結び付ける（初回のみ作成される）
 *   3. admin/.env.local の中身を Vercel の環境変数へ反映する
 *   4. 公開する
 *
 * 環境変数を毎回入れ直している理由:
 *   キーを更新したのに Vercel 側が古いままで動かない、という事故を防ぐため。
 *   手元の .env.local を唯一の正とし、公開のたびに上書きする。
 */
import { spawnSync } from 'node:child_process';
import { existsSync as exists, readFileSync as read } from 'node:fs';
import { resolve } from 'node:path';

const ADMIN_DIR = resolve(process.cwd(), 'admin');
const ENV_FILE = resolve(ADMIN_DIR, '.env.local');
const PREVIEW = process.argv.includes('--preview');

/** Vercel へ渡す環境変数。ここに無いものは公開先へ送られない。 */
const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const OPTIONAL = ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'];

/**
 * 各変数を「公開してよいか」で分類する。
 *
 * Vercel は `NEXT_PUBLIC_` が付いた鍵らしき値に対し、意図した公開かどうかの
 * 明示を求める。取り違えると本来秘匿すべき鍵をブラウザへ配信してしまうため、
 * ここで1か所にまとめて宣言し、判断の根拠をコードに残す。
 *
 *   config … ブラウザへ配信される。公開前提の値のみ。
 *   secret … サーバー側だけで使われる。ブラウザへは配信されない。
 */
const TYPE = {
  // 接続先URL。秘匿する意味がない。
  NEXT_PUBLIC_SUPABASE_URL: 'config',
  // anon キーは公開前提。権限は RLS が制御しており、鍵自体は秘密ではない。
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'config',
  // service_role は RLS を迂回する。絶対にブラウザへ出さない。
  SUPABASE_SERVICE_ROLE_KEY: 'secret',
  // 地図キーは配信されるため、Google 側でリファラ制限をかけて守る。
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'config',
};

function die(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/**
 * vercel CLI を実行する。stdin へ文字列を流し込める。
 *
 * 引数を配列で渡さず1本の文字列に組み立てているのは、Windows では
 * npx が .cmd のため shell 経由でしか起動できず、その状態で配列を渡すと
 * Node が「引数がエスケープされない」と警告するため。ここで自分で
 * 引用符を付けてから渡す。
 */
function quote(arg) {
  return /^[A-Za-z0-9@._:/=-]+$/.test(arg) ? arg : `"${arg.replace(/(["\\])/g, '\\$1')}"`;
}

function vercel(args, { input, quiet = false } = {}) {
  const command = ['npx', '--yes', 'vercel@59.6.2', ...args].map(quote).join(' ');
  const result = spawnSync(command, {
    cwd: ADMIN_DIR,
    input,
    encoding: 'utf8',
    stdio: input === undefined && !quiet ? 'inherit' : 'pipe',
    shell: true,
  });
  return {
    code: result.status,
    out: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

/** .env.local を読み、KEY=VALUE の対応表にする */
function readEnvFile(path) {
  const env = {};
  for (const line of read(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    // 値が引用符で囲まれている場合は外す
    env[m[1]] = m[2].replace(/^["'](.*)["']$/, '$1');
  }
  return env;
}

// --- 1. 前提の確認 -----------------------------------------------------------
if (!exists(ENV_FILE)) {
  die(`${ENV_FILE} が見つかりません。docs/06-supabase-setup.md を参照してください。`);
}

const env = readEnvFile(ENV_FILE);
const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length) die(`admin/.env.local に次の値がありません: ${missing.join(', ')}`);

console.log('Vercel へのログイン状態を確認します...');
const who = vercel(['whoami'], { quiet: true });
if (who.code !== 0) {
  die(
    'Vercel にログインしていません。次を実行してください:\n\n' +
      '      npx vercel login\n\n' +
      '  ブラウザが開くので、メールアドレスまたは GitHub 等で認証します。',
  );
}
const account = who.out.trim().split('\n').pop().trim();
console.log(`  ログイン中: ${account}\n`);

// --- 2. プロジェクトとの結び付け ---------------------------------------------
if (!exists(resolve(ADMIN_DIR, '.vercel', 'project.json'))) {
  console.log('Vercel 上のプロジェクトを作成します...');
  const link = vercel(['link', '--yes', '--project', 'kurumayose-navi-admin']);
  if (link.code !== 0) die('プロジェクトの作成に失敗しました。');
  console.log('');
}

// --- 3. 環境変数の反映 -------------------------------------------------------
// 公開先は本番と検証の2種類。管理画面はどちらも同じ Supabase を見る。
const TARGETS = ['production', 'preview'];

console.log('環境変数を反映します...');
for (const key of [...REQUIRED, ...OPTIONAL]) {
  const value = env[key];
  if (!value) {
    console.log(`  skip  ${key}（.env.local に無し）`);
    continue;
  }
  for (const target of TARGETS) {
    // 既存の値があると add は失敗するため、先に消しておく
    vercel(['env', 'rm', key, target, '--yes'], { quiet: true });
    const added = vercel(['env', 'add', key, target, '--type', TYPE[key], '--yes'], {
      input: `${value}\n`,
    });
    if (added.code !== 0) die(`${key}（${target}）の設定に失敗しました:\n${added.out}`);
  }
  // 値そのものは表示しない（鍵が端末の履歴に残るのを避ける）
  const visibility = TYPE[key] === 'secret' ? 'サーバー側のみ' : 'ブラウザへ配信';
  console.log(`  set   ${key}  (${value.length} 文字 / ${visibility})`);
}

// --- 4. 公開 -----------------------------------------------------------------
console.log(`\n${PREVIEW ? '検証用URL' : '本番'}へ公開します...\n`);
const deploy = vercel(PREVIEW ? ['deploy'] : ['deploy', '--prod']);
if (deploy.code !== 0) die('公開に失敗しました。上のログを確認してください。');

console.log('\n公開が完了しました。');
console.log('URL は上のログの Production / Preview の行に表示されています。');
