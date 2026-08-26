/** クライアント様の一覧から拾った座標が正しく変換できるかを確認する */
import { dmsToDecimal, isInJapan, parsePair } from './dms.mjs';

const samples = [
  ['帝国ホテル東京', `35° 40'22.0"N`, `139° 45'27.4"E`],
  ['ザ・ペニンシュラ東京', `35° 40'23.5"N`, `139° 45'36.1"E`],
  ['マンダリンオリエンタルホテル', `35° 41'14.0"N`, `139° 46'21.4"E`],
  ['アマン東京', `35° 41'08.5"N`, `139° 45'57.2"E`],
  ['ACホテル・バイ・マリオット東京', `35° 40'06.4"N`, `139° 45'55.6"E`],
  ['渋谷エクセルホテル東急', `35° 39'27.3"N`, `139° 41'47.7"E`],
  ['銀座クレストン', `35° 40'01.2"N`, `139° 46'42.0"E`],
];

console.log('度分秒 → 十進度の変換:\n');
let ok = 0;
for (const [name, latRaw, lngRaw] of samples) {
  const lat = dmsToDecimal(latRaw);
  const lng = dmsToDecimal(lngRaw);
  const valid = isInJapan(lat, lng);
  if (valid) ok++;
  console.log(
    `  ${name.padEnd(30, '　')} ${lat?.toFixed(6)}, ${lng?.toFixed(6)}  ${valid ? '✓' : '✗ 範囲外'}`,
  );
}

console.log(`\n1セルに緯度経度がまとまっている場合:`);
const pair = parsePair(`35° 40'22.0"N 139° 45'27.4"E`);
console.log(`  → lat=${pair.lat?.toFixed(6)} lng=${pair.lng?.toFixed(6)}`);

console.log(`\n全角・記号ゆれへの対応:`);
for (const s of [`３５° ４０'２２.０"Ｎ`, `35°40′22.0″N`, `35.672778`]) {
  console.log(`  ${s.padEnd(24, ' ')} → ${dmsToDecimal(s)?.toFixed(6)}`);
}

console.log(`\n${ok}/${samples.length} 件が日本国内の座標として妥当`);
