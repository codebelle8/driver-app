import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { RAIL_WIDTH } from '@/components/side-rail';
import { useT } from '@/lib/i18n/context';
import { useLayout } from '@/lib/layout';

/**
 * ご意見箱の入口（2026-11-02）。「探す」画面の右下に浮かべる。
 *
 * ご提示いただいた場所（画面の右下、下のタブのすぐ上）と、ご提供いただいた絵
 * （「ご意見箱」の札を持った案内役）をそのまま使う。絵は背景が透けているので、
 * 枠も影も付けない。押すとご意見箱（app/feedback.tsx）が開く。
 *
 * **大きさは画面に合わせて少しずつ変える**（ご指示 2026-11-02「PC でもスマホでも、
 * どの幅でも見た目よく」）。決まった2つの大きさでは、小さいスマホで大きすぎ、
 * 大きい画面で小さすぎた。下の useFeedbackButtonSize。
 */

/** 絵の縦横比（330 x 440。原本 1086 x 1448 と同じ） */
const ASPECT = 440 / 330;
const ART = require('@/assets/art/feedback-box.webp');

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 絵の大きさと、右下からの間。
 *
 *   スマホ（〜767）     … 画面の幅の 22%（70〜96）。背の低い画面では高さの 13% まで
 *                          （320×568 で 70、390×844 で 86、430×932 で 95）
 *   PC の骨格（768〜） … 画面の高さの 12%（88〜120）。本文の幅の 16% は超えない
 *                          （iPad 縦 768×1024 で 88、1366×768 で 92、1440×900 で 108、
 *                          1920×1080 で 120）
 *
 * 札の「ご意見箱」の文字が読めることを下限にしている（幅 70 で 1文字およそ 11px）。
 * 上限は、PC で本文の右下を覆いすぎないところ。
 *
 * space は、いちばん下の中身が絵に隠れないよう、送る領域の下に足す余白。
 */
export function useFeedbackButtonSize() {
  const { width, height, isWide } = useLayout();
  const art = isWide
    ? clamp(Math.min(height * 0.12, (width - RAIL_WIDTH) * 0.16), 88, 120)
    : clamp(Math.min(width * 0.22, height * 0.13), 70, 96);
  const w = Math.round(art);
  const h = Math.round(art * ASPECT);
  const gap = isWide ? 20 : 12;
  return { width: w, height: h, gap, space: h + gap * 2 };
}

export function FeedbackButton() {
  const router = useRouter();
  const t = useT();
  const { width, height, gap } = useFeedbackButtonSize();

  return (
    <Pressable
      onPress={() => router.push('/feedback')}
      accessibilityRole="button"
      accessibilityLabel={t.feedback.open}
      testID="feedback-button"
      hitSlop={4}
      style={({ pressed, hovered }) => [
        styles.wrap,
        { width, height, right: gap, bottom: gap },
        hovered && styles.hovered,
        pressed && styles.pressed,
      ]}
    >
      <Image source={ART} style={styles.art} contentFit="contain" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 5,
  },
  art: { width: '100%', height: '100%' },
  hovered: { transform: [{ scale: 1.04 }] },
  pressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
});
