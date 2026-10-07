import { Image } from 'expo-image';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useThemeControl } from '@/theme-context';

/**
 * チャット（情報交換）の背景。書き込みの一覧の後ろに敷き、スクロールしても動かない。
 * 飾りなので、押せず、読み上げもしない。
 *
 * **案内の女性（2026-10-07 ご指示）** 「女性が、チャットのルールのお知らせを指して
 * いるように置く」。左に置き、頭を一覧のいちばん上（ルールのお知らせのすぐ下）に
 * そろえる。画像は透明な余白を切り落としてあり、指先が右上の角（横 99%・縦 3%）に
 * 来る。こうすると、指先も指し棒も右上のお知らせへ向く。高さは一覧の高さに合わせる
 * （画面の大きさが変わっても、頭と指先の位置関係が崩れない）。
 *   原本: assets/art/12.png（1024x1536）。切り落として 480x1200 の webp にした
 *   （1.5MB → 63KB）。
 *
 * **ロゴ（2026-10-07 ご指示）** はじめは真ん中に大きく敷いたが、女性と重なるため
 * 右下へ小さめに移した。明暗で版を替える（ヘッダーのロゴと同じ。components/brand.tsx）。
 *
 * **濃さは画面の幅で変える。** 吹き出しは地の色を持つので、重なっても文字は
 * 読める。ただし名前・時刻・「通報」は吹き出しの外にある。
 *   広い画面（768px〜）… 女性は書き込みの列の左の余白に立ち、ほとんど重ならない。
 *                        はっきり見せる
 *   狭い画面（スマホ）… ほかの方の書き込みが左に並び、女性の上に重なる。名前が
 *                        髪に重なって読みにくかった（55% で確認）ので、薄くする
 * 暗い配色では明るい服が浮きやすいので、どちらも一段薄くする。
 */
const GUIDE = require('@/assets/art/chat-guide.webp');
const LOGO_DARK = require('@/assets/brand/logo.png');
const LOGO_LIGHT = require('@/assets/brand/logo-white.png');

/** 広い画面の境目（PC の見た目に切り替わる幅と同じ） */
const WIDE = 768;

/** 縦横比（案内の女性 480x1200・濃紺のロゴ 462x160・白抜きのロゴ 469x160） */
const GUIDE_ASPECT = 480 / 1200;
const ASPECT_DARK = 462 / 160;
const ASPECT_LIGHT = 469 / 160;

export function ChatBackdrop() {
  const { theme } = useThemeControl();
  const light = theme === 'light';
  const wide = useWindowDimensions().width >= WIDE;
  const guideShade = wide
    ? light
      ? styles.guideWideLight
      : styles.guideWideDark
    : light
      ? styles.guideNarrowLight
      : styles.guideNarrowDark;

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.wrap]}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={GUIDE}
        testID="chat-guide"
        style={[styles.guide, { aspectRatio: GUIDE_ASPECT }, guideShade]}
        contentFit="contain"
      />
      <Image
        source={light ? LOGO_DARK : LOGO_LIGHT}
        testID="chat-watermark"
        style={[
          styles.logo,
          { aspectRatio: light ? ASPECT_DARK : ASPECT_LIGHT },
          light ? styles.logoOnLight : styles.logoOnDark,
        ]}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', pointerEvents: 'none' },
  guide: { position: 'absolute', left: 4, top: 0, height: '100%', maxHeight: 760 },
  guideWideLight: { opacity: 0.6 },
  guideWideDark: { opacity: 0.42 },
  guideNarrowLight: { opacity: 0.3 },
  guideNarrowDark: { opacity: 0.2 },
  logo: { position: 'absolute', right: 16, bottom: 16, width: '42%', maxWidth: 260 },
  /* 濃紺は明るい地で強く出るので、白抜きより一段薄く */
  logoOnLight: { opacity: 0.07 },
  logoOnDark: { opacity: 0.08 },
});
