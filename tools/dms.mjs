/**
 * 度分秒（DMS）表記の座標を十進度へ変換する。
 *
 * クライアント様の一覧は `35° 40'22.0"N 139° 45'27.4"E` という
 * 度分秒表記で届く。データベースは十進度で持つため変換が必要。
 *
 * 対応する書き方の例:
 *   35° 40'22.0"N        （半角スペースあり／なし）
 *   35°40'22.0"N
 *   35° 40' 22.0" N
 *   35°40′22.0″N         （プライム記号）
 *   全角の °′″ や全角数字が混ざっていても拾う
 */

/** 全角英数・記号を半角へ寄せる */
function normalize(input) {
  return String(input)
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[’′`´]/g, "'")
    .replace(/[”″〝〞]/g, '"')
    .replace(/[　]/g, ' ')
    .trim();
}

/**
 * 1つの座標を十進度へ。解釈できなければ null。
 * @returns {number | null}
 */
export function dmsToDecimal(input) {
  if (input === null || input === undefined) return null;
  const s = normalize(input);
  if (s === '') return null;

  // 既に十進度で書かれている場合はそのまま使う
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);

  const m = s.match(/(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)\s*'\s*(\d+(?:\.\d+)?)\s*"?\s*([NSEWnsew])?/);
  if (!m) return null;

  const [, deg, min, sec, hemi] = m;
  const value = Number(deg) + Number(min) / 60 + Number(sec) / 3600;
  const negative = hemi && /[SWsw]/.test(hemi);
  return negative ? -value : value;
}

/**
 * 「35° 40'22.0"N 139° 45'27.4"E」のように緯度経度が1セルに入っている場合、
 * 2つに分けて返す。
 * @returns {{ lat: number|null, lng: number|null }}
 */
export function parsePair(input) {
  const s = normalize(input);
  const parts = s.match(/\d+(?:\.\d+)?\s*°\s*\d+(?:\.\d+)?\s*'\s*\d+(?:\.\d+)?\s*"?\s*[NSEWnsew]?/g);
  if (!parts || parts.length < 2) return { lat: dmsToDecimal(s), lng: null };
  return { lat: dmsToDecimal(parts[0]), lng: dmsToDecimal(parts[1]) };
}

/** 日本の陸域におおむね収まるか（緯度経度の取り違え検出） */
export function isInJapan(lat, lng) {
  return lat !== null && lng !== null && lat >= 20 && lat <= 46 && lng >= 122 && lng <= 154;
}
