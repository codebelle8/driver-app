/**
 * 見積りの内訳を、台帳から引き直す。
 *
 *   node tools/build-estimate.mjs           確かめるだけ
 *   node tools/build-estimate.mjs --write   docs/11-estimate.md を書き換える
 *
 * **なぜ要るか**
 *   `docs/10-additional-work.md` が人日の台帳で、`docs/11-estimate.md` は
 *   そこへ単価を掛けただけのもの。**台帳が正で、見積りは派生**にあたる。
 *
 *   ところが、その派生を手で書き写していた。**一度取り違えている。**
 *   第2期を 28.4人日 と書いていたが、台帳を足すと 29.1人日 だった。
 *   項目名も、記憶で書いて半分ほど違っていた。
 *
 *   人日は請求の根拠にあたる。**手で写すのをやめる。**
 *
 * **区分の扱い**
 *   依頼      … 発注元からのご依頼。請求する
 *   判断      … 当方が必要と判断して足したもの。請求する
 *   不具合    … 当方が作ったものの直し。**請求しない**
 *   不具合＋依頼 … SPLIT に内訳を書く。合計が合わなければ止める
 */
import { readFileSync, writeFileSync } from 'node:fs';

const NL = String.fromCharCode(10);
const LEDGER = 'docs/10-additional-work.md';
const ESTIMATE = 'docs/11-estimate.md';

/** 人日単価（税抜）。変えるときは、ここだけ。 */
const RATE = 40_000;

/**
 * 「不具合＋依頼」の項目の、内訳。
 *
 * 台帳の本文に書いてある分け方をここへ写す。**合計が台帳の人日と
 * 合わなければ、そこで止める。** 写し間違いに気づけないと、請求の
 * 根拠がずれる。
 */
const SPLIT = {
  'P-41': { 依頼: 0.3, 不具合: 0.2 },
  'P-48': { 依頼: 0.6, 不具合: 0.5 },
  'P-49': { 依頼: 0.6, 不具合: 0.4 },
};

const write = process.argv.includes('--write');

const rows = [...readFileSync(LEDGER, 'utf8').matchAll(
  /^### (P-\d+)\.\s*(.+?)\s*—\s*(.+?)\s*\/\s*([0-9.]+)人日\s*$/gm,
)].map((m) => ({ no: m[1], name: m[2], kind: m[3], days: Number(m[4]) }));

if (rows.length === 0) throw new Error('台帳から項目を読めません');
rows.sort((a, b) => Number(a.no.slice(2)) - Number(b.no.slice(2)));

/* --- 足す ----------------------------------------------------------------- */

let ask = 0;
let judge = 0;
let bug = 0;
for (const r of rows) {
  if (r.kind === '依頼') ask += r.days;
  else if (r.kind === '判断') judge += r.days;
  else if (r.kind === '不具合＋依頼') {
    const split = SPLIT[r.no];
    if (!split) throw new Error(`${r.no} の内訳が SPLIT にありません`);
    if (Math.abs(split.依頼 + split.不具合 - r.days) > 0.001) {
      throw new Error(`${r.no} の分け方が台帳の人日と合いません`);
    }
    ask += split.依頼;
    bug += split.不具合;
  } else bug += r.days;
}

const r1 = (n) => Math.round(n * 10) / 10;
ask = r1(ask);
judge = r1(judge);
bug = r1(bug);
const billable = r1(ask + judge);
const total = r1(ask + judge + bug);

const yen = (days) => Math.round(days * RATE).toLocaleString('en-US');

console.log(`台帳: ${rows.length} 件${NL}`);
console.log(`  依頼            ${ask.toFixed(1)} 人日   ${yen(ask)} 円`);
console.log(`  判断            ${judge.toFixed(1)} 人日   ${yen(judge)} 円`);
console.log(`  ご請求の対象    ${billable.toFixed(1)} 人日   ${yen(billable)} 円（税抜）`);
console.log(`  不具合（請求外） ${bug.toFixed(1)} 人日`);
console.log(`  台帳の総計      ${total.toFixed(1)} 人日`);

/* --- 書き換える ----------------------------------------------------------- */

if (!write) {
  console.log(`${NL}（--write を付けると ${ESTIMATE} を書き換えます）`);
  process.exit(0);
}

const out = [
  `## 第2期の内訳（P-2 〜 ${rows[rows.length - 1].no}）`,
  '',
  '**台帳から機械的に引いている**（`node tools/build-estimate.mjs --write`）。',
  '手で書き写すと取り違える。実際、一度取り違えた。',
  '',
  '| # | 項目 | 区分 | 人日 |',
  '|---|---|---|---:|',
  ...rows.map((r) => `| ${r.no} | ${r.name} | ${r.kind} | ${r.days} |`),
  '',
  '| 区分 | 人日 |',
  '|---|---:|',
  `| 依頼（「不具合＋依頼」のご依頼ぶんを含む） | ${ask.toFixed(1)} |`,
  `| 判断 | ${judge.toFixed(1)} |`,
  `| **ご請求の対象** | **${billable.toFixed(1)}** |`,
  `| 〔不具合〕（請求しない） | ${bug.toFixed(1)} |`,
  `| 台帳の総計 | ${total.toFixed(1)} |`,
  '',
];

/*
  改行を揃えてから探す。

  この書類は CRLF（復帰＋改行）で保存されている。改行1文字で区切りを
  探すと見つからず、**黙って何もしないまま終わる。** 読むときに
  揃えて、書き戻すときに元へ戻す。
*/
const CRLF = String.fromCharCode(13) + String.fromCharCode(10);

const raw = readFileSync(ESTIMATE, 'utf8');
const crlf = raw.includes(CRLF);
const src = crlf ? raw.split(CRLF).join(NL) : raw;

const from = src.indexOf('## 第2期の内訳');
if (from < 0) throw new Error('見積りに「第2期の内訳」がありません');
const to = src.indexOf(`${NL}---${NL}`, from);
if (to < 0) throw new Error('「第2期の内訳」の終わりが見つかりません');

const next = src.slice(0, from) + out.join(NL) + src.slice(to);
writeFileSync(ESTIMATE, crlf ? next.split(NL).join(CRLF) : next, 'utf8');
console.log(`${NL}${ESTIMATE} を書き換えました`);
