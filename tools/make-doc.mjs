/**
 * 覚え書き（Markdown）を、Word で開ける書類に直す。
 *
 *   node tools/make-doc.mjs docs/16-legal-drafts.md "車寄せナビ_規約類（たたき台）"
 *
 * **なぜ要るか**
 *   規約は、発注元が弁護士へお見せになり、赤を入れて戻ってくるもの。
 *   Markdown のままでは、先方が開けない。**受け取った方がそのまま
 *   直せる形**でお渡しする。
 *
 * **作りかた**
 *   ここでは HTML までを作る。Word への変換は tools/make-doc.ps1 が
 *   Word 本体にやらせる。**変換を自前で書かない。** 書式の取りこぼしを
 *   自分で埋めるより、Word に開かせて保存させたほうが確かにあたる。
 *
 * **空行で塊に分けてから読む**
 *   1行ずつ見て組み立てると、**条文の番号がすべて「1.」になる。**
 *   折り返した2行目で箇条書きが閉じてしまうため。空行までをひと塊と
 *   して扱い、塊の中で継ぎ足す。最初にそれで失敗している。
 *
 * **扱う記法は、この文書に出てくるものだけ**
 *   見出し／強調／表／箇条書き（入れ子は1段）／字下げの補足／区切り線。
 *   一般の Markdown をすべて通すためのものではない。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const NL = String.fromCharCode(10);
const src = process.argv[2];
const title = process.argv[3] ?? 'document';
if (!src) throw new Error('入力のファイルを指定してください');

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * 行の中の記法。**強調** と `符号` だけ。
 *
 * **必ず、行をつないでから呼ぶこと。** 強調が行をまたいで書かれている
 * 箇所があり、1行ずつ当てると閉じられずに `**` がそのまま出る。
 */
function inline(t) {
  let out = esc(t);
  /* <br> は表の中で使っているため、書いたまま通す */
  out = out.split('&lt;br&gt;').join('<br>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

const isRow = (t) => /^\|.*\|$/.test(t.trim());
const isRule = (t) => /^\|[\s:|-]+\|$/.test(t.trim());
const marker = (line) => line.match(/^(\s*)(\d+)\.\s+(.*)$/) ?? line.match(/^(\s*)([-*])\s+(.*)$/);

const cells = (t) =>
  t
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

/* --- 空行で塊に分ける ----------------------------------------------------- */

const blocks = [];
let cur = [];
for (const line of readFileSync(src, 'utf8').split(/\r?\n/)) {
  if (line.trim() === '') {
    if (cur.length) blocks.push(cur);
    cur = [];
  } else {
    cur.push(line);
  }
}
if (cur.length) blocks.push(cur);

/* --- 塊ごとに組み立てる --------------------------------------------------- */

const html = [];
let firstH1 = true;

/** 箇条書きの塊を組み立てる。入れ子は1段まで。 */
function renderList(lines) {
  /** { num, mark, indent, text } の並びにする */
  const items = [];
  for (const line of lines) {
    const m = marker(line);
    if (m) {
      items.push({
        indent: m[1].length,
        ordered: /^\d+$/.test(m[2]),
        num: /^\d+$/.test(m[2]) ? Number(m[2]) : null,
        text: [m[3]],
        children: [],
      });
    } else if (items.length) {
      /* 折り返し。いま開いている項目へ継ぎ足す */
      const last = items[items.length - 1];
      const target = last.children.length ? last.children[last.children.length - 1] : last;
      target.text.push(line.trim());
    }
  }

  /* 字下げの深い項目を、直前の浅い項目の下へ入れる */
  const top = [];
  for (const it of items) {
    const parent = top[top.length - 1];
    if (parent && it.indent > parent.indent) parent.children.push(it);
    else top.push(it);
  }
  if (top.length === 0) return;

  const open = (it, list) => {
    if (!it.ordered) return '<ul>';
    /*
      表をはさむと箇条書きがいったん閉じる。番号を1に戻さないよう、
      書かれている番号から続ける。
    */
    return it.num && it.num > 1 ? `<ol start="${it.num}">` : '<ol>';
  };

  html.push(open(top[0]));
  for (const it of top) {
    html.push(`<li>${inline(it.text.join(''))}`);
    if (it.children.length) {
      html.push(open(it.children[0]));
      for (const ch of it.children) html.push(`<li>${inline(ch.text.join(''))}</li>`);
      html.push(it.children[0].ordered ? '</ol>' : '</ul>');
    }
    html.push('</li>');
  }
  html.push(top[0].ordered ? '</ol>' : '</ul>');
}

for (const lines of blocks) {
  const head = lines[0].trim();

  /* 区切り線だけの塊は落とす（大見出しの改ページで代える） */
  if (lines.length === 1 && /^-{3,}$/.test(head)) continue;

  /* 見出し */
  const h = head.match(/^(#{1,4})\s+(.*)$/);
  if (h && lines.length === 1) {
    const level = h[1].length;
    /*
      大見出しは改ページで始める。規約・プライバシーポリシー・特商法を
      一枚に混ぜると、**掲示のときに切り出しにくい。**
    */
    const cls = level === 1 && !firstH1 ? ' class="break"' : '';
    if (level === 1) firstH1 = false;
    html.push(`<h${level}${cls}>${inline(h[2])}</h${level}>`);
    continue;
  }

  /* 表 */
  if (isRow(head)) {
    html.push('<table>');
    const rows = lines.filter((l) => isRow(l));
    const ruled = rows.length > 1 && isRule(rows[1]);
    rows.forEach((r, i) => {
      if (ruled && i === 1) return;
      const tag = ruled && i === 0 ? 'th' : 'td';
      html.push('<tr>' + cells(r).map((c) => `<${tag}>${inline(c)}</${tag}>`).join('') + '</tr>');
    });
    html.push('</table>');
    continue;
  }

  /* 箇条書き */
  if (marker(lines[0])) {
    renderList(lines);
    continue;
  }

  /*
    字下げた塊は、補足として囲む。

    この文書では「※」や条文への注記がこの形で書かれている。
    本文と同じ見た目にすると、規約の一部と読まれてしまう。
  */
  if (/^\s{2,}/.test(lines[0])) {
    html.push(`<p class="note">${inline(lines.map((l) => l.trim()).join(''))}</p>`);
    continue;
  }

  /* ふつうの段落 */
  html.push(`<p>${inline(lines.map((l) => l.trim()).join(''))}</p>`);
}

/*
  字体は、先方の環境にあるものだけを指す。
  游明朝・MS明朝は、Windows になければ Word が勝手に置き換える。
*/
const doc = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  body { font-family: "游明朝", "Yu Mincho", "ＭＳ 明朝", serif;
         font-size: 10.5pt; line-height: 1.75; color: #000; }
  h1 { font-size: 16pt; border-bottom: 1.5pt solid #000; padding-bottom: 6pt;
       margin: 24pt 0 12pt; }
  h1.break { page-break-before: always; }
  h2 { font-size: 13pt; margin: 20pt 0 8pt; border-left: 4pt solid #000;
       padding-left: 8pt; }
  h3 { font-size: 11.5pt; margin: 16pt 0 6pt; }
  p { margin: 6pt 0; }
  p.note { margin: 6pt 0 6pt 16pt; font-size: 9.5pt; color: #333; }
  ol, ul { margin: 6pt 0 6pt 6pt; padding-left: 18pt; }
  li { margin: 4pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.5pt; }
  th, td { border: 0.5pt solid #666; padding: 4pt 6pt; vertical-align: top;
           text-align: left; }
  th { background: #eee; font-weight: bold; }
  code { font-family: "ＭＳ ゴシック", monospace; font-size: 9.5pt; }
  strong { font-weight: bold; }
</style>
</head>
<body>
${html.join(NL)}
</body>
</html>
`;

mkdirSync('docs/out', { recursive: true });
const out = `docs/out/${title}.html`;
writeFileSync(out, doc, 'utf8');
console.log(out);
