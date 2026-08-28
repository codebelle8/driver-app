/**
 * APK を一時的に配布するための窓口を開く。
 *
 *   node tools/serve-apk.mjs
 *
 * なぜ要るか:
 *   このサーバーはクラウド上にあり、受信ポートは閉じている。
 *   端末と同じLANにも居ないため、出来上がった APK を手元の端末へ
 *   渡す手段が無い。外向きの接続でトンネルを張り、その URL から
 *   ダウンロードできるようにする。
 *
 *   ファイアウォールを開けない理由:
 *     クラウドサーバーの受信ポートをインターネットへ晒すことになり、
 *     このような一時的な用途に対して代償が大きすぎる。
 *
 * 止め方: Ctrl+C（トンネルも一緒に閉じる）
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, resolve } from 'node:path';

import { connect } from '@expo/ngrok';

const PORT = 8123;
const APK = resolve(
  process.argv[2] ?? 'dist/kurumayose-navi-1.0.0.apk',
);

if (!existsSync(APK)) {
  console.error(`\n  ${APK} が見つかりません。`);
  console.error('  先に APK をビルドしてください（docs/08-distribution.md を参照）。\n');
  process.exit(1);
}

const size = statSync(APK).size;
const fileName = basename(APK);

const server = createServer((req, res) => {
  // どのパスで来ても APK を返す。端末側で URL を打ち間違えても届くように。
  res.writeHead(200, {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Length': String(size),
    // ブラウザに「開く」ではなく「保存」させる
    'Content-Disposition': `attachment; filename="${fileName}"`,
  });
  createReadStream(APK).pipe(res);
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`配布するファイル: ${fileName}（${(size / 1024 / 1024).toFixed(0)} MB）`);
  console.log('トンネルを開いています...\n');

  try {
    const url = await connect({ addr: PORT, proto: 'http' });
    const httpsUrl = url.replace(/^http:/, 'https:');

    console.log('  端末のブラウザで次を開いてください:');
    console.log('');
    console.log(`    ${httpsUrl}`);
    console.log('');
    console.log('  ダウンロード後、通知またはファイル一覧から開くと');
    console.log('  インストールできます。');
    console.log('');
    console.log('  ※「提供元不明のアプリ」の確認が出ます。ストアを経由せず');
    console.log('    直接入れるため正常です。許可してお進みください。');
    console.log('');
    console.log('  終了するには Ctrl+C を押してください。');
  } catch (error) {
    console.error('\n  トンネルを開けませんでした:', String(error).slice(0, 200));
    console.error('  しばらく置いてから、もう一度お試しください。\n');
    server.close();
    process.exit(1);
  }
});
