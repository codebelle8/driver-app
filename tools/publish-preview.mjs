/**
 * アプリを Expo Go で開ける形に公開する。
 *
 *   node tools/publish-preview.mjs                 公開する
 *   node tools/publish-preview.mjs --check         準備が整っているかだけ見る
 *   node tools/publish-preview.mjs -m "説明"       変更内容を添えて公開する
 *
 * なぜ Expo Go なのか:
 *   iPhone へアプリを配る通常の方法（TestFlight）には Apple Developer
 *   Program が必要で、本件ではその取得を完成版の確認後まで後ろ倒しにした。
 *   Expo Go は App Store にある無料アプリで、これを使えば
 *   開発者アカウントを取らずに実機でご確認いただける。
 *
 * 事前に一度だけ `npx eas login` が必要（ブラウザ認証のため自動化できない）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_DIR = resolve(process.cwd(), 'app');
const APP_JSON = resolve(APP_DIR, 'app.json');
const ENV_FILE = resolve(APP_DIR, '.env.local');

const CHECK_ONLY = process.argv.includes('--check');
const messageIndex = process.argv.findIndex((a) => a === '-m' || a === '--message');
const MESSAGE =
  messageIndex === -1 ? '動作確認用の更新' : (process.argv[messageIndex + 1] ?? '更新');

/** Expo Go はチャンネルを使わず、この名前の枝を直接開く */
const BRANCH = 'preview';

function die(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function quote(arg) {
  return /^[A-Za-z0-9@._:/=-]+$/.test(arg) ? arg : `"${arg.replace(/(["\\])/g, '\\$1')}"`;
}

/** eas / expo の CLI を実行する */
function run(bin, args, { quiet = false } = {}) {
  const command = ['npx', '--yes', bin, ...args].map(quote).join(' ');
  const result = spawnSync(command, {
    cwd: APP_DIR,
    encoding: 'utf8',
    stdio: quiet ? 'pipe' : 'inherit',
    shell: true,
  });
  return { code: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

// --- 1. 設定が揃っているか ----------------------------------------------------

if (!existsSync(ENV_FILE)) {
  die(
    'app/.env.local がありません。\n' +
      '  EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY が必要です。',
  );
}

const env = readFileSync(ENV_FILE, 'utf8');
for (const key of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']) {
  if (!new RegExp(`^\\s*${key}\\s*=\\s*\\S`, 'm').test(env)) {
    die(`app/.env.local に ${key} がありません。`);
  }
}

const appJson = JSON.parse(readFileSync(APP_JSON, 'utf8'));
const projectId = appJson.expo?.extra?.eas?.projectId;
const updatesUrl = appJson.expo?.updates?.url;

// runtimeVersion があると Expo Go は「互換性がない」として開けなくなる。
// Expo Go は自分の runtime（exposdk:57.0.0）と比べるため、
// アプリのバージョン（1.0.0）を宣言していると一致しない。
const blockers = [];
if (appJson.expo?.runtimeVersion) {
  blockers.push('  runtimeVersion … 互換性の判定で弾かれ、そもそも開けません');
}
if (appJson.expo?.updates) {
  blockers.push('  updates … 存在しない更新の取得を待ち続け、起動が止まります');
}
if (blockers.length) {
  die(
    [
      'app.json に、Expo Go で開けなくなる設定が残っています。',
      ...blockers,
      '',
      '  Expo Go で確認する間は外してください（docs/08-distribution.md を参照）。',
      '  製品版のビルドへ移る際に戻します。',
    ].join(String.fromCharCode(10)),
  );
}

console.log('準備の確認:');
console.log(`  接続先          ${env.match(/EXPO_PUBLIC_SUPABASE_URL\s*=\s*(\S+)/)?.[1]}`);
console.log(`  Expo プロジェクト ${projectId ?? '（未設定）'}`);
console.log(`  更新の配信先     ${updatesUrl ?? '（未設定）'}`);

// --- 2. ログイン --------------------------------------------------------------

const who = run('eas-cli', ['whoami'], { quiet: true });
if (who.code !== 0) {
  die(
    'Expo にログインしていません。次を実行してください:\n\n' +
      '      cd app\n' +
      '      npx eas login\n\n' +
      '  アカウントが無い場合は https://expo.dev/signup で作成できます（無料）。',
  );
}
console.log(`  ログイン中       ${who.out.trim().split('\n').pop().trim()}`);

if (CHECK_ONLY) {
  const ready = Boolean(projectId && updatesUrl);
  console.log(
    ready
      ? '\n公開できる状態です。'
      : '\nまだ Expo のプロジェクトと結び付いていません。--check を外して実行すると設定します。',
  );
  process.exit(0);
}

// --- 3. プロジェクトとの結び付け（初回のみ） ----------------------------------

if (!projectId) {
  console.log('\nExpo 上にプロジェクトを作成します...\n');
  if (run('eas-cli', ['init', '--non-interactive']).code !== 0) {
    die('プロジェクトの作成に失敗しました。');
  }
}

if (!updatesUrl) {
  console.log('\n更新の配信先を設定します...\n');
  if (run('eas-cli', ['update:configure', '--non-interactive']).code !== 0) {
    die('更新の配信先の設定に失敗しました。');
  }
}

// --- 4. 公開 ------------------------------------------------------------------

console.log(`\n「${BRANCH}」として公開します...\n`);
const published = run('eas-cli', [
  'update',
  '--branch',
  BRANCH,
  '--message',
  MESSAGE,
  '--non-interactive',
]);
if (published.code !== 0) die('公開に失敗しました。上のログを確認してください。');

console.log('\n公開が完了しました。');
console.log('上のログに出ている URL を、Expo Go でお読み取りいただけます。');
console.log('（iPhone・Android とも App Store / Google Play で「Expo Go」を検索）');
