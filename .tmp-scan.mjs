/* accentSoft を地にしている箱の、上に乗る文字の色を洗い出す */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
});

for (const f of walk('app/src')) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    if (!/backgroundColor:\s*c\.accentSoft/.test(l)) return;
    // その style 定義の名前を上へさかのぼって探す
    let name = '?';
    for (let j = i; j >= 0 && j > i - 12; j--) {
      const m = lines[j].match(/^\s{4}([A-Za-z0-9_]+):\s*\{/);
      if (m) { name = m[1]; break; }
    }
    console.log(`${f.replace(/\/g, '/')}:${i + 1}  style「${name}」`);
  });
}
