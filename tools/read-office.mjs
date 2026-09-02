/**
 * Excel / Word のファイルを、変換を挟まずそのまま読む。
 *
 * **なぜ要るか**
 *   クライアント様からいただいた表を、メールや変換ツールを経由して
 *   受け取ると、日本語が「?」に置き換わって戻らないことがある。
 *   実際に 2026-08-30 のファイルがそうなり、施設名が読めなかった。
 *
 *   .xlsx も .docx も中身は zip + XML で、文字は最初から UTF-8 で入っている。
 *   直接開けば、変換による欠落は起きない。
 *
 *   使い方:
 *     node tools/read-office.mjs data/import/受領表.xlsx
 *     node tools/read-office.mjs data/import/受領表.docx
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('  ファイルを指定してください: node tools/read-office.mjs <path>');
  process.exit(1);
}

/** zip の中の1ファイルを、そのまま取り出す */
function entry(name) {
  try {
    return execFileSync('unzip', ['-p', file, name], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/** XML の実体参照を戻す */
function unescape(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

/** <t> の中身を順に取り出す（Excel の共有文字列・Word の本文とも同じ形） */
function texts(xml) {
  return [...xml.matchAll(/<(?:a:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:a:)?t>/g)].map((m) =>
    unescape(m[1]),
  );
}

// --- Excel ------------------------------------------------------------------
const shared = entry('xl/sharedStrings.xml');
if (shared !== null) {
  const strings = texts(shared);
  console.log(`  共有文字列 ${strings.length} 個`);

  for (let n = 1; n <= 10; n++) {
    const sheet = entry(`xl/worksheets/sheet${n}.xml`);
    if (sheet === null) continue;

    console.log('');
    console.log(`  === シート ${n} ===`);

    for (const row of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = c[1];
        const inner = c[2];
        const ref = (attrs.match(/r="([A-Z]+)\d+"/) ?? [])[1] ?? '';
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1];
        let value = '';
        if (/t="s"/.test(attrs) && v !== undefined) {
          value = strings[Number(v)] ?? '';
        } else if (/t="inlineStr"/.test(attrs)) {
          value = texts(inner).join('');
        } else if (v !== undefined) {
          value = unescape(v);
        }
        if (value !== '') cells.push(`${ref}:${value}`);
      }
      if (cells.length) console.log('    ' + cells.join('  |  '));
    }
  }
  process.exit(0);
}

// --- Word -------------------------------------------------------------------
const doc = entry('word/document.xml');
if (doc !== null) {
  // 段落ごとに、中の文字をつなぐ
  for (const p of doc.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const line = [...p[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((m) => unescape(m[1]))
      .join('');
    // 表の区切りが分かるよう、セルの終わりに印を入れる
    const cells = p[0].includes('</w:tc>') ? ' |' : '';
    if (line.trim()) console.log('    ' + line + cells);
  }
  process.exit(0);
}

console.error('  Excel でも Word でもないようです。中身の一覧:');
try {
  console.error(execFileSync('unzip', ['-l', file], { encoding: 'utf8' }));
} catch {
  console.error('  zip として開けませんでした。');
}
process.exit(1);
