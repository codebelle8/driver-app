/**
 * 書き出した web 版を、その場で配る。
 *
 * 実機での確認用。配信先（Vercel 等）を用意する前に、
 * 手元のマシンから見られるようにする。
 *
 *   node tools/serve-web.mjs <書き出し先> [ポート]
 *
 * **単一ページなので、どの経路でも index.html を返す。**
 *   /facility/xxx を直接開かれても、画面はアプリ側が組み立てる。
 *
 * **Service Worker は動かない。**
 *   ブラウザは https か localhost でしか常駐処理を許さない。
 *   このサーバーは http なので、オフライン動作とホーム画面への
 *   追加は確かめられない。画面と操作の確認までにあたる。
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = process.argv[2];
const PORT = Number(process.argv[3] ?? 8081);

if (!ROOT || !existsSync(join(ROOT, 'index.html'))) {
  console.error('  書き出し先を指定してください（index.html のある場所）');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
};

createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);

  // 上位ディレクトリへ抜けられないようにする
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, safe);

  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(ROOT, 'index.html');
  }

  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    // 確認用なので、常に最新を返す
    'Cache-Control': 'no-store',
  });
  res.end(readFileSync(file));
}).listen(PORT, () => {
  console.log(`  配信中: http://localhost:${PORT}`);
  console.log(`  元:     ${ROOT}`);
});
