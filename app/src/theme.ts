/**
 * 配色と寸法。
 *
 * 管理画面 (admin/src/app/globals.css) と同じ値を使い、
 * 発注元から見て同じ製品に見えるようにしている。
 *
 * 暗い配色を既定にしている理由:
 *   このアプリは走行中の車内で使われる。夜間に白い画面を出すと
 *   目が慣れるまでの数秒間、前方が見えにくくなる。
 */
const light = {
  bg: '#f6f8f9',
  bgSub: '#eef1f3',
  surface: '#ffffff',
  surface2: '#f2f5f6',
  border: '#dde3e7',
  borderStrong: '#c3cdd3',
  text: '#171c20',
  textMuted: '#5a666e',
  textFaint: '#8b969d',
  accent: '#0f7a55',
  accentSoft: '#e6f2ed',
  accentText: '#ffffff',
  danger: '#b3261e',
  dangerSoft: '#fdecea',
  // 塗りつぶした danger の上に乗せる文字。
  // 明るい配色では地が濃いので白、暗い配色では地が明るいので濃い墨。
  // accentText と同じ考え方。白のままでは暗い配色で 3:1 まで落ちる。
  dangerText: '#ffffff',
  warn: '#9a6410',
  warnSoft: '#fdf3e2',
  // as const を付けないのは、付けると各色が固定値の型になり
  // 暗い配色を同じ型として扱えなくなるため。
};

const dark: typeof light = {
  bg: '#0f1416',
  bgSub: '#0a0e10',
  surface: '#161d20',
  surface2: '#1d262a',
  border: '#2a353a',
  borderStrong: '#3d4c53',
  text: '#e8edef',
  textMuted: '#9aa8ae',
  textFaint: '#6b7a81',
  accent: '#2ea87d',
  accentSoft: '#12291f',
  accentText: '#06120d',
  danger: '#e5675c',
  dangerSoft: '#2a1614',
  dangerText: '#2a0b08',
  warn: '#d9a441',
  warnSoft: '#2a2113',
};

export type Palette = typeof light;

/**
 * 配色の実体。取り出すのは theme-context.tsx の useTheme() を使う。
 * ここから直接読むと、利用者が選んだ設定が反映されない。
 */
export const palettes = { light, dark };

/**
 * 走行前後の車内で押される前提の寸法。
 *
 * 44 は指で確実に押せる最小の大きさとして広く使われている値。
 * 揺れる車内ではさらに余裕が要るため、主要な操作は 56 にしている。
 */
export const HIT = {
  min: 44,
  primary: 56,
} as const;

/**
 * 小さな記号の当たり判定を広げる量。
 *
 * 見た目は 20px 前後でも、走行前の車内では指が正確に狙えない。
 * 押せる範囲だけを外側へ広げ、見た目は変えない。
 */
export const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;
