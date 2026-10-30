/**
 * 配った内容が本番に届いているかを、束の中身から見る。
 *
 *   node tools/check-live-build.mjs
 *   node tools/check-live-build.mjs https://app.kurumayosenavi.com
 *
 * なぜ要るか:
 *   Vercel が「READY」と言っても、利用者が受け取る束が新しいとは限らない。
 *   常駐処理（Service Worker）が前の index.html を返していた事故が実際にあり、
 *   そのときは画面を見ても気づけなかった（前の版がそのまま動くため）。
 *
 *   ここでは配信されている JS を直接取り、目印の文字が入っているかで判じる。
 *   画面を開く必要がなく、控えの影響も受けない。
 *
 * 目印は minify されても消えない文字列を選ぶ。関数名や変数名は
 * 潰されるが、画面に出る文言と testID は残る。
 */
const BASE = (process.argv[2] ?? 'https://app.kurumayosenavi.com').replace(/\/$/, '');

/** [表示名, 入っているべきか, 目印] */
const MARKS = [
  ['画面の中の札', true, 'confirm-cancel'],
  ['取り消せない旨を別行に', true, '元には戻せません。'],
  ['前の版の一続きの文面', false, '件を履歴から削除します。元には戻せません。'],
  ['履歴の複数選択', true, '選んだ履歴を削除'],
  ['お気に入りの削除', true, 'お気に入りから外します'],
];

const html = await (await fetch(`${BASE}/`, { cache: 'no-store' })).text();
const src = html.match(/src="([^"]+\.js)"/)?.[1];
if (!src) throw new Error('束の場所が index.html から読み取れません');

const raw = await (await fetch(BASE + src)).text();
/*
  \uXXXX を戻してから探す。

  minify が日本語を全部 \u に置き換えるため、そのままでは
  文字列として一致しない。ここを忘れると「入っていない」と
  誤って読んでしまう（実際に一度そう読んだ）。
*/
const js = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

console.log(`本番の束: ${src}`);
console.log(`大きさ:   ${(raw.length / 1024 / 1024).toFixed(2)} MB\n`);

let bad = 0;
for (const [label, want, needle] of MARKS) {
  const has = js.includes(needle);
  const ok = has === want;
  if (!ok) bad++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} — ${has ? 'あり' : 'なし'}`);
}

console.log(bad === 0 ? '\n配った内容が届いています。' : `\n${bad} 件が想定と違います。`);
process.exitCode = bad ? 1 : 0;
