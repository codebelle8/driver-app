/**
 * ブランドマーク（ピン＋車寄せ＋ナビ矢印）の共通定義。
 *
 * ロゴとアプリアイコンの両方から使うため、図形はここ一箇所で持つ。
 * 修正はこのファイルだけ直せば両方に反映される。
 *
 * 配色はカラーガイドに準拠:
 *   #0C1B2E 背景の濃紺 / #1A2F4A ピン本体の紺
 *   #F5A623 目的地ピンの橙 / #00B8C6 ナビ矢印の水色
 */

export const COLORS = {
  ink: '#0C1B2E',
  navy: '#1A2F4A',
  amber: '#F5A623',
  cyan: '#00B8C6',
  white: '#FFFFFF',
};

/**
 * マーク本体。viewBox は 0 0 220 260。
 *
 * @param {object} opts
 * @param {string} opts.pinFill    ピン（しずく形）の塗り
 * @param {string} opts.detail     車寄せと車の描画色
 */
export function markSvg({ pinFill = COLORS.navy, detail = COLORS.white } = {}) {
  return `
  <!-- ピン（しずく形）: 目的地を示す -->
  <path
    d="M110 252 C 70 200, 15 168, 15 105 A 95 95 0 1 1 205 105 C 205 168, 150 200, 110 252 Z"
    fill="${pinFill}" />

  <!-- 目的地ピン（橙）: 「ここが目的地」 -->
  <path
    d="M110 101 C 101 89, 89 81, 89 67 A 21 21 0 1 1 131 67 C 131 81, 119 89, 110 101 Z"
    fill="${COLORS.amber}" />
  <circle cx="110" cy="66" r="7.5" fill="${COLORS.white}" />

  <!-- 車寄せの屋根（キャノピー）: 正面玄関の庇 -->
  <path
    d="M46 164 V143 C 46 112, 174 112, 174 143 V164"
    fill="none" stroke="${detail}" stroke-width="10"
    stroke-linecap="round" stroke-linejoin="round" />
  <path d="M57 150 H163" stroke="${detail}" stroke-width="5.5" stroke-linecap="round" />

  <!-- 車（正面）: 車寄せに着けた状態 -->
  <path d="M83 169 L91 156 H129 L137 169 Z" fill="${detail}" />
  <rect x="70" y="167" width="80" height="19" rx="7" fill="${detail}" />
  <!-- ヘッドライト -->
  <rect x="75" y="173" width="12" height="6.5" rx="3.25" fill="${COLORS.amber}" />
  <rect x="133" y="173" width="12" height="6.5" rx="3.25" fill="${COLORS.amber}" />
  <!-- タイヤ -->
  <circle cx="87" cy="189" r="6.5" fill="${pinFill}" stroke="${detail}" stroke-width="3" />
  <circle cx="133" cy="189" r="6.5" fill="${pinFill}" stroke="${detail}" stroke-width="3" />

  <!-- ナビ矢印（水色）: 正確な到着へ導く -->
  <path d="M110 197 L125 226 L110 218 L95 226 Z" fill="${COLORS.cyan}" />
  <path d="M110 232 V241" stroke="${detail}" stroke-width="5" stroke-linecap="round" />
`;
}

/** マークを単体の SVG として組み立てる */
export function markStandalone(opts) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 260" width="220" height="260">
${markSvg(opts)}
</svg>`;
}

/**
 * アプリアイコン。角丸の濃紺タイルにマークを載せる。
 * 端末のホーム画面で潰れないよう、マークは中央に大きめに配置する。
 */
export function iconSvg(size = 1024) {
  const r = size * 0.2237; // iOS の角丸（スーパー楕円）に近い比率
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${COLORS.ink}" />
  <!-- しずく形は下側が細いため、幾何的な中央より少し上に置くと目に均等に見える -->
  <g transform="translate(${size * 0.19} ${size * 0.128}) scale(${(size * 0.62) / 220})">
${markSvg({ pinFill: COLORS.navy, detail: COLORS.white })}
  </g>
</svg>`;
}
