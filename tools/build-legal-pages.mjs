/**
 * 規約類（docs/17-legal-final.md）から、紹介サイトの3つのページを作る（2026-11-23）。
 *
 *   node tools/build-legal-pages.mjs
 *
 *   site/terms.html    利用規約                    https://kurumayosenavi.com/terms
 *   site/privacy.html  プライバシーポリシー        https://kurumayosenavi.com/privacy
 *   site/law.html      特定商取引法に基づく表記    https://kurumayosenavi.com/law
 *
 * **元は docs/17-legal-final.md だけ。** 規約を直したら、このファイルを流し直す。
 * できた html を手で直さない（次に流したときに消える）。
 *
 * 読むのは、規約類で使っている書き方だけ。
 *   # 見出し          … ページの区切り。下の PAGES にある見出しだけを作る
 *                       （「10月8日版からの変更」など、ほかの見出しの節は載せない）
 *   **第1条（適用）**  … 条・項の見出し
 *   1. ／ - ／ 表（|） … 番号の付いた並び・点の並び・表。字下げで入れ子にできる
 *   **太字**・<br>     … 文の中で使ってよいのはこの2つだけ。ほかの < > はそのまま字で出す
 *
 * **行の継ぎ目に空白を入れない。** 元の文は日本語の途中で折り返している。
 * html では改行が空白になり、「本サー ビス」のように字の間が空いてしまう。
 * 英数字どうしの継ぎ目だけ、空白でつなぐ。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'docs', '17-legal-final.md');
const SITE = join(ROOT, 'site');

const SITE_URL = 'https://kurumayosenavi.com';
const APP_URL = 'https://app.kurumayosenavi.com/';

/**
 * 作業中のあいだは検索に載せない（index.html・vercel.json・robots.txt と同じ）。
 * 本公開のときは false にして流し直す（site/README.md「本公開の前に直すもの」）。
 */
const NOINDEX = true;

const PAGES = [
  {
    heading: '利用規約',
    file: 'terms.html',
    path: '/terms',
    label: 'TERMS OF SERVICE',
    description: '車寄せナビの利用規約です。会員登録、無料期間、利用料金、情報提供、チャットなどの決まりを定めています。',
    toc: true,
  },
  {
    heading: 'プライバシーポリシー',
    file: 'privacy.html',
    path: '/privacy',
    label: 'PRIVACY POLICY',
    description: '車寄せナビのプライバシーポリシーです。取得する情報、利用目的、業務委託先、お問い合わせ窓口を定めています。',
    toc: true,
  },
  {
    heading: '特定商取引法に基づく表記',
    file: 'law.html',
    path: '/law',
    label: 'LEGAL NOTICE',
    description: '車寄せナビの特定商取引法に基づく表記です。販売業者、所在地、販売価格、支払方法などを記載しています。',
    toc: false,
  },
];

/* ------------------------------------------------------------------------- */
/* 文の中                                                                    */
/* ------------------------------------------------------------------------- */

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s) {
  return escapeHtml(s)
    .replace(/&lt;br&gt;/g, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, (m) => `<a href="mailto:${m}">${m}</a>`);
}

/** 見出しの番号（「第1条」「1.」）だけを分け、緑で出す */
function headingHtml(title) {
  const m = title.match(/^(第\d+条|\d+\.)\s*(.*)$/);
  if (!m) return inline(title);
  /* 「第1条（適用）」は括弧の字そのものに余白があるので、間を詰める */
  const tight = m[2].startsWith('（') ? ' lg-no--tight' : '';
  return `<span class="lg-no${tight}">${inline(m[1])}</span>${inline(m[2])}`;
}

/** 折り返した行をつなぐ。英数字どうしの継ぎ目だけ空白を入れる */
function joinLines(lines) {
  let out = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (out && /[A-Za-z0-9.,)]$/.test(out) && /^[A-Za-z0-9(]/.test(line)) out += ' ';
    out += line;
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* かたまり                                                                  */
/* ------------------------------------------------------------------------- */

const indentOf = (line) => line.match(/^ */)[0].length;
const isBlank = (line) => line.trim() === '';
const isOl = (line) => /^\d+\.\s/.test(line);
const isUl = (line) => /^-\s/.test(line);
const isTable = (line) => /^\|/.test(line);
const isHeading = (line) => /^\*\*.+\*\*$/.test(line.trim()) && indentOf(line) === 0;

function dedent(lines) {
  const widths = lines.filter((l) => !isBlank(l)).map(indentOf);
  const w = widths.length ? Math.min(...widths) : 0;
  return lines.map((l) => (isBlank(l) ? '' : l.slice(w)));
}

function cells(row) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function table(rows) {
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  /* 「項目｜記載内容」の2列は、左の列を行の見出しにする（特商法の表） */
  const def = head.length === 2 && head[0] === '項目';
  if (def) {
    const trs = body
      .map(([k, v]) => `<tr><th scope="row">${inline(k)}</th><td>${inline(v ?? '')}</td></tr>`)
      .join('\n');
    return `<div class="lg-table lg-table--def"><table>\n<tbody>\n${trs}\n</tbody>\n</table></div>`;
  }
  const ths = head.map((h) => `<th scope="col">${inline(h)}</th>`).join('');
  /* data-label は、狭い画面で1行ずつ積んだときに添える列の名前（legal.css） */
  const trs = body
    .map((r) => `<tr>${r.map((c, k) => `<td data-label="${escapeHtml(head[k] ?? '')}">${inline(c)}</td>`).join('')}</tr>`)
    .join('\n');
  return `<div class="lg-table"><table>\n<thead><tr>${ths}</tr></thead>\n<tbody>\n${trs}\n</tbody>\n</table></div>`;
}

/**
 * 並びの1項目ぶんの行を集める。続きは字下げした行。空行をはさんでも、
 * その次が字下げした行なら同じ項目（第6条第1項の中の表）。
 */
function takeItem(lines, start) {
  const first = lines[start].replace(/^(\d+\.|-)\s+/, '');
  const rest = [];
  let i = start + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      let j = i + 1;
      while (j < lines.length && isBlank(lines[j])) j++;
      if (j < lines.length && indentOf(lines[j]) > 0) {
        rest.push('');
        i++;
        continue;
      }
      break;
    }
    if (indentOf(line) === 0) break;
    rest.push(line);
    i++;
  }
  return { first, rest: dedent(rest), next: i };
}

function itemHtml({ first, rest }) {
  /* 最初の行に続く文（次のかたまりの手前まで）を、項目の本文にする */
  const text = [first];
  let k = 0;
  while (k < rest.length && !isBlank(rest[k]) && !isOl(rest[k]) && !isUl(rest[k]) && !isTable(rest[k])) {
    text.push(rest[k]);
    k++;
  }
  const inner = blocks(rest.slice(k));
  return `<li>${inline(joinLines(text))}${inner ? `\n${inner}\n` : ''}</li>`;
}

function blocks(lines, ctx = null) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line) || line.trim() === '---') {
      i++;
      continue;
    }
    if (isHeading(line)) {
      const title = line.trim().replace(/^\*\*|\*\*$/g, '');
      const id = ctx ? ctx.idFor(title) : null;
      if (ctx) ctx.headings.push({ id, title });
      out.push(`<h2${id ? ` id="${id}"` : ''}>${headingHtml(title)}</h2>`);
      i++;
      continue;
    }
    if (isTable(line)) {
      const rows = [];
      while (i < lines.length && isTable(lines[i])) rows.push(lines[i++]);
      out.push(table(rows));
      continue;
    }
    if (isOl(line) || isUl(line)) {
      const ordered = isOl(line);
      const startNo = ordered ? Number(line.match(/^(\d+)/)[1]) : 1;
      const items = [];
      const same = (l) => (ordered ? isOl(l) : isUl(l));
      while (i < lines.length) {
        /* 項目のあいだの空行（第6条第1項の表の後ろ）は、次も同じ並びなら飛ばす */
        let j = i;
        while (j < lines.length && isBlank(lines[j])) j++;
        if (j >= lines.length || !same(lines[j])) break;
        const item = takeItem(lines, j);
        items.push(itemHtml(item));
        i = item.next;
      }
      const tag = ordered ? 'ol' : 'ul';
      const start = ordered && startNo !== 1 ? ` start="${startNo}"` : '';
      out.push(`<${tag}${start}>\n${items.join('\n')}\n</${tag}>`);
      continue;
    }
    /* ふつうの段落。制定日は、ページの終わりに別に出す */
    const para = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !isHeading(lines[i]) &&
      !isTable(lines[i]) &&
      !isOl(lines[i]) &&
      !isUl(lines[i])
    ) {
      para.push(lines[i++]);
    }
    const text = joinLines(para);
    if (/^制定日/.test(text)) {
      if (ctx) ctx.date = text.replace(/^制定日\s*/, '');
      continue;
    }
    out.push(`<p>${inline(text)}</p>`);
  }
  return out.join('\n');
}

/* ------------------------------------------------------------------------- */
/* ページ                                                                    */
/* ------------------------------------------------------------------------- */

function idMaker() {
  const used = new Set();
  return (title) => {
    let id = null;
    const article = title.match(/^第(\d+)条/);
    const section = title.match(/^(\d+)\.\s/);
    if (article) id = `article-${article[1]}`;
    else if (section) id = `section-${section[1]}`;
    if (!id || used.has(id)) return null;
    used.add(id);
    return id;
  };
}

function page(def, bodyHtml, headings, date) {
  const title = `${def.heading}｜車寄せナビ`;
  const tabs = PAGES.map((p) => {
    const current = p === def ? ' aria-current="page"' : '';
    return `      <li><a href="${p.path}"${current}>${escapeHtml(p.heading)}</a></li>`;
  }).join('\n');
  const toc =
    def.toc && headings.length
      ? `
  <details class="lg-toc">
    <summary>目次<span class="lg-toc__count">${headings.length}項目</span></summary>
    <ol>
${headings
  .filter((h) => h.id)
  .map((h) => `      <li><a href="#${h.id}">${headingHtml(h.title)}</a></li>`)
  .join('\n')}
    </ol>
  </details>
`
      : '';
  const footerLinks = [
    `<li><a href="/">車寄せナビ トップ</a></li>`,
    ...PAGES.map((p) => `<li><a href="${p.path}">${escapeHtml(p.heading)}</a></li>`),
    `<li><a href="${APP_URL}">アプリを開く</a></li>`,
  ]
    .map((l) => `        ${l}`)
    .join('\n');

  return `<!doctype html>
<!--
  このページは tools/build-legal-pages.mjs が docs/17-legal-final.md から作ったもの。
  手で直さない。規約を直したら、node tools/build-legal-pages.mjs を流し直す。
-->
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(def.description)}">
<meta name="theme-color" content="#0B192F">
${NOINDEX ? '<!-- 作業中のあいだは検索に載せない。本公開のときは build-legal-pages.mjs の NOINDEX を false に -->\n<meta name="robots" content="noindex, nofollow">\n' : ''}<link rel="canonical" href="${SITE_URL}${def.path}">

<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(def.description)}">
<meta property="og:url" content="${SITE_URL}${def.path}">
<meta property="og:image" content="${SITE_URL}/assets/og.jpg">

<link rel="icon" href="/assets/brand/icon.png">
<link rel="apple-touch-icon" href="/assets/brand/icon.png">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600&family=Noto+Sans+JP:wght@400;700&family=Zen+Kaku+Gothic+New:wght@700&display=swap">
<link rel="stylesheet" href="/legal.css">
<script src="/legal.js" defer></script>
</head>
<body>

<a class="skip-link" href="#main">本文へ移動</a>

<header class="lg-header">
  <a class="lg-header__logo" href="/" aria-label="車寄せナビ トップへ">
    <img src="/assets/brand/logo.png" alt="車寄せナビ Driver Entrance Navi" width="470" height="160">
  </a>
  <a class="lg-pill" href="${APP_URL}">アプリを開く<span class="lg-pill__arrow" aria-hidden="true"></span></a>
</header>

<main id="main" class="lg-main">
  <div class="lg-title">
    <p class="lg-title__label">${def.label}</p>
    <h1>${escapeHtml(def.heading)}</h1>
    <nav class="lg-tabs" aria-label="規約類">
      <ul>
${tabs}
      </ul>
    </nav>
  </div>
${toc}
  <article class="lg-body">
${bodyHtml}
  </article>
${date ? `\n  <p class="lg-date">制定日　${escapeHtml(date)}</p>\n` : ''}
</main>

<footer class="lg-footer">
  <div class="lg-footer__inner">
    <img class="lg-footer__logo" src="/assets/brand/logo-white.png" alt="車寄せナビ Driver Entrance Navi" width="470" height="160" loading="lazy">
    <nav aria-label="サイト内">
      <ul class="lg-footer__nav">
${footerLinks}
      </ul>
    </nav>
    <p class="lg-footer__copy">© 2026 車寄せナビ</p>
  </div>
</footer>

</body>
</html>
`;
}

/* ------------------------------------------------------------------------- */

const source = readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n');
const sections = new Map();
let current = null;
for (const line of source.split('\n')) {
  const h = line.match(/^# (.+)$/);
  if (h) {
    current = h[1].trim();
    sections.set(current, []);
    continue;
  }
  if (current) sections.get(current).push(line);
}

let failed = false;
for (const def of PAGES) {
  const lines = sections.get(def.heading);
  if (!lines) {
    console.error(`見出し「# ${def.heading}」が ${SOURCE} にない`);
    failed = true;
    continue;
  }
  const ctx = { headings: [], idFor: idMaker(), date: null };
  const body = blocks(lines, ctx);
  if (/【/.test(body)) {
    console.error(`${def.heading}: 空欄（【　】）が残っている。埋めてから作る`);
    failed = true;
    continue;
  }
  const html = page(def, body, ctx.headings, ctx.date);
  writeFileSync(join(SITE, def.file), html);
  console.log(`site/${def.file}  ${def.heading}（見出し ${ctx.headings.length}・制定日 ${ctx.date ?? 'なし'}）`);
}
if (failed) process.exit(1);
