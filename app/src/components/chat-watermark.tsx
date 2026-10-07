import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useThemeControl } from '@/theme-context';

/**
 * チャットの背景に敷くロゴ（すかし）。2026-10-07 ご指示「チャット画面の背景に、
 * ロゴを見栄えよく置く」。
 *
 * **書き込みが並ぶ場所の真ん中に、大きく・ごく薄く。** 一覧の後ろに置き、
 * スクロールしても動かない（書き込みだけが上を流れる）。濃さは、書き込みの
 * 文字を邪魔しない程度に抑える。吹き出しは地の色を持つので、重なっても読める。
 *
 * **明暗で版を替える**（ヘッダーのロゴと同じ。components/brand.tsx）。濃紺版を
 * 暗い地に敷くと沈んで見えず、白抜き版を明るい地に敷くと見えない。
 *
 * **飾りなので、押せず、読み上げもしない。**
 */
const LOGO_DARK = require('@/assets/brand/logo.png');
const LOGO_LIGHT = require('@/assets/brand/logo-white.png');

/** 画像の縦横比（濃紺版 462x160・白抜き版 469x160） */
const ASPECT_DARK = 462 / 160;
const ASPECT_LIGHT = 469 / 160;

export function ChatWatermark() {
  const { theme } = useThemeControl();
  const light = theme === 'light';

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.wrap]}
      testID="chat-watermark"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={light ? LOGO_DARK : LOGO_LIGHT}
        style={[
          styles.logo,
          { aspectRatio: light ? ASPECT_DARK : ASPECT_LIGHT },
          light ? styles.onLight : styles.onDark,
        ]}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  logo: { width: '74%', maxWidth: 400 },
  /* 濃紺は明るい地で強く出るので、白抜きより一段薄く */
  onLight: { opacity: 0.07 },
  onDark: { opacity: 0.08 },
});
