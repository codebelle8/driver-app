import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useT } from '@/lib/i18n/context';
import { SPACE } from '@/theme';

/**
 * ご意見箱の入口（2026-11-02）。「探す」画面の右下に浮かべる。
 *
 * ご提示いただいた場所（画面の右下、下のタブのすぐ上）と、ご提供いただいた絵
 * （「ご意見箱」の札を持った案内役）をそのまま使う。絵は背景が透けているので、
 * 枠も影も付けない。押すとご意見箱（app/feedback.tsx）が開く。
 *
 * **大きさ。** 札の「ご意見箱」の文字が読める幅にしている（狭い画面で幅 84）。
 * 広い画面では一回り大きく。
 */

/** 絵の縦横比（330 x 440。原本 1086 x 1448 と同じ） */
const ASPECT = 440 / 330;
const ART = require('@/assets/art/feedback-box.webp');

export function FeedbackButton({ wide = false }: { wide?: boolean }) {
  const router = useRouter();
  const t = useT();
  const width = wide ? 110 : 84;

  return (
    <Pressable
      onPress={() => router.push('/feedback')}
      accessibilityRole="button"
      accessibilityLabel={t.feedback.open}
      testID="feedback-button"
      hitSlop={4}
      style={({ pressed, hovered }) => [
        styles.wrap,
        { width, height: width * ASPECT },
        hovered && styles.hovered,
        pressed && styles.pressed,
      ]}
    >
      <Image source={ART} style={styles.art} contentFit="contain" />
    </Pressable>
  );
}

/** 下に重なる中身が隠れないよう、送る領域の下に足す余白（大きいほうの絵に合わせる） */
export const FEEDBACK_BUTTON_SPACE = 110 * ASPECT + SPACE.md;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: SPACE.md,
    bottom: SPACE.md,
    zIndex: 5,
  },
  art: { width: '100%', height: '100%' },
  hovered: { transform: [{ scale: 1.04 }] },
  pressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
});
