/**
 * 市区町村コードの対応表。
 *
 * **なぜ要るか**
 *   国土地理院の逆ジオコーダは、座標から「市区町村コード」と
 *   「町丁目名」を返す。都道府県名と市区町村名は返さないため、
 *   コードから引く表が要る。
 *
 * **手で書いた表を捨てた理由**
 *   以前は9区分だけを手で書いていた。35件が都心に限られていたため
 *   足りていたが、193件には千葉県（浦安・船橋）や大田区も含まれ、
 *   知らないコードが来ると住所が空になる。
 *   国土地理院が配っている表をそのまま取り込む。
 *
 *   更新するとき:
 *     node tools/lib/muni.mjs --update
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, 'muni.json');
const SOURCE = 'https://maps.gsi.go.jp/js/muni.js';

/**
 * コード → { pref, city } の表を返す。
 *
 * 取り込んだものを json で控える。取り込みのたびに国土地理院へ
 * 問い合わせると、相手方に無用な負荷をかける。
 */
export function loadMuni() {
  if (!existsSync(CACHE)) {
    throw new Error(
      '市区町村の表がありません。node tools/lib/muni.mjs --update で取り込んでください。',
    );
  }
  return JSON.parse(readFileSync(CACHE, 'utf8'));
}

/** 国土地理院から取り込んで控える */
export async function updateMuni() {
  const res = await fetch(SOURCE, { headers: { 'User-Agent': 'kurumayose-navi/1.0' } });
  if (!res.ok) throw new Error(`取り込めませんでした: ${res.status}`);
  const js = await res.text();

  const table = {};
  /*
    行の形:
      GSI.MUNI_ARRAY["13101"] = '13,東京都,13101,千代田区';

    政令指定都市は「札幌市　中央区」のように市名と区名が
    全角空白で繋がっている。分けずにそのまま持つ。
  */
  for (const m of js.matchAll(/GSI\.MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']*)'/g)) {
    const parts = m[2].split(',');
    if (parts.length < 4) continue;
    const [, pref, , city] = parts;
    if (!pref || !city) continue;
    // コードは5桁へ揃える（元データは先頭の0が落ちている）
    table[m[1].padStart(5, '0')] = { pref, city };
  }

  writeFileSync(CACHE, JSON.stringify(table, null, 0));
  return Object.keys(table).length;
}

if (process.argv.includes('--update')) {
  const n = await updateMuni();
  console.log(`  市区町村 ${n} 件を取り込みました → ${CACHE}`);
}
