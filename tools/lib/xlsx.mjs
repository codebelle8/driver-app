/**
 * .xlsx を、変換を挟まず読む。
 *
 * **なぜ自前で読むか**
 *   受領した表を CSV へ変換すると、環境によって日本語が「?」に
 *   置き換わって戻らない。実際に2度そうなった。
 *   .xlsx は zip + XML で、文字は最初から UTF-8。直接開けば失われない。
 *
 * **ふりがなを扱える**
 *   Excel は日本語セルに <rPh> としてふりがなを持ち、sb/eb で
 *   本文の何文字目に対応するかまで記録している。
 *   これを合成すると、漢字混じりの名前から正確なよみがなが作れる。
 */
import { execFileSync } from 'node:child_process';

/** zip の中の1ファイルを取り出す */
export function entry(file, name) {
  return execFileSync('unzip', ['-p', file, name], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** XML の実体参照を戻す */
export function unescapeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

const T = (xml) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]));

/**
 * 共有文字列を読む。
 *
 * 返すのは `{ text, kana }`。
 *   text … 本文（ふりがなを除く）
 *   kana … 本文の漢字部分をふりがなで置き換えたもの。
 *          ふりがなが無ければ本文そのまま。
 *
 * **ふりがなを本文から外す必要がある。**
 *   <rPh> の中にも <t> があり、単純に並べると別項目として数えられて
 *   以降の索引がすべてずれる。実際に列が総崩れになった。
 */
export function readSharedStrings(file) {
  const xml = entry(file, 'xl/sharedStrings.xml');

  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => {
    const si = m[1];
    const text = T(si.replace(/<rPh[\s\S]*?<\/rPh>/g, '')).join('');

    // 位置つきのふりがなを集める
    const ruby = [...si.matchAll(/<rPh\s+sb="(\d+)"\s+eb="(\d+)"[^>]*>([\s\S]*?)<\/rPh>/g)]
      .map((r) => ({ sb: Number(r[1]), eb: Number(r[2]), yomi: T(r[3]).join('') }))
      .sort((a, b) => a.sb - b.sb);

    if (ruby.length === 0) return { text, kana: text };

    // 本文の該当範囲をふりがなへ差し替える
    const chars = [...text];
    let out = '';
    let at = 0;
    for (const r of ruby) {
      if (r.sb < at) continue; // 重なりは無視する
      out += chars.slice(at, r.sb).join('') + r.yomi;
      at = r.eb;
    }
    out += chars.slice(at).join('');

    return { text, kana: out };
  });
}

/** 行ごとに、列名 → 値 の対応を作る */
export function readSheet(file, sheet = 'xl/worksheets/sheet1.xml') {
  const strings = readSharedStrings(file);
  const xml = entry(file, sheet);

  const rows = [];
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};

    /*
      空のセルは `<c r="A2" s="1"/>` と自己完結の形で書かれる。
      対のタグだけを拾うと解釈が崩れ、見出しが数値として読まれる。
    */
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = (c[1].match(/r="([A-Z]+)\d+"/) ?? [])[1];
      if (!col) continue;

      const inner = c[2] ?? '';
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1];

      let value = '';
      let kana = '';
      if (/t="s"/.test(c[1]) && v !== undefined) {
        const s = strings[Number(v)];
        value = s?.text ?? '';
        kana = s?.kana ?? '';
      } else if (/t="inlineStr"/.test(c[1])) {
        value = T(inner).join('');
        kana = value;
      } else if (v !== undefined) {
        value = unescapeXml(v);
        kana = value;
      }

      if (value.trim() !== '') cells[col] = { text: value.trim(), kana: kana.trim() };
    }

    if (Object.keys(cells).length) rows.push(cells);
  }
  return rows;
}
