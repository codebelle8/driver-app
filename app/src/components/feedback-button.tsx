import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet } from 'react-native';

import { RAIL_WIDTH } from '@/components/side-rail';
import { useT } from '@/lib/i18n/context';
import { useIntroDone } from '@/lib/intro-state';
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
 *
 * bubble は吹き出しの幅。**絵とは別に、画面の大きさから決める**（ご指摘 2026-11-02
 * 「スマホと PC で大きさが変わらない」）。以前は絵の幅の 2.4 倍にしていたが、PC の絵は
 * ほとんど画面の高さで決まるため、窓の幅を変えても吹き出しは変わらず、スマホ（206）と
 * PC（259）の差も見た目には分からなかった。
 *
 *   スマホ … 画面の幅の 56%（180〜250）。320 で 180、390 で 218、430 で 241
 *   PC     … 画面の幅の 21%（230〜400）。背の低い画面では高さの 40% まで
 *            （1024×768 で 230、1366×768 で 287、1440×900 で 302、1920×1080 で 400）
 *
 * 下限は 320px のスマホでも2行の文字が読める大きさ。上限は、大きい画面で吹き出しが
 * 本文の中ほどまで張り出さないところ。どの大きさでも、吹き出しは画面の内側に収まる。
 */
export function useFeedbackButtonSize() {
  const { width, height, isWide } = useLayout();
  const art = isWide
    ? clamp(Math.min(height * 0.12, (width - RAIL_WIDTH) * 0.16), 88, 120)
    : clamp(Math.min(width * 0.22, height * 0.13), 70, 96);
  const w = Math.round(art);
  const h = Math.round(art * ASPECT);
  const gap = isWide ? 20 : 12;
  const bubble = Math.round(
    isWide ? clamp(Math.min(width * 0.21, height * 0.4), 230, 400) : clamp(width * 0.56, 180, 250),
  );
  return { width: w, height: h, gap, space: h + gap * 2, bubble };
}

/*
  吹き出し「あなたの声が アプリを進化させる。」（ご提供の画像。2026-11-02 に
  「みんなでアプリを開発する」から差し替え）。原本は背景が黒く塗られていたため、
  外側から黒い背景をたどって透かし（中の濃い緑の文字は残る）、640 × 290 にした
  （原本は feedback-bubble-original.png）。しっぽは右下で、先は幅の 91.4%・高さの 99.2%。
*/
const BUBBLE = require('@/assets/art/feedback-bubble.webp');
const BUBBLE_ASPECT = 290 / 640;
const TAIL_X = 0.914;
const TAIL_Y = 0.992;

/**
 * しっぽの先を当てる場所（絵の中の位置。幅・高さに対する割合）。
 * 女性の頭の左上。ここから吹き出しが左上へ広がり、顔に向かって話している形になる。
 */
const SPEAKER_X = 0.3;
const SPEAKER_Y = 0.14;

/** 触れる画面（マウスを重ねられない）で、開いたときに吹き出しを見せておく長さ */
const TOUCH_SHOW_MS = 4000;

/**
 * 触れる画面で吹き出しを見せたか（アプリを開いているあいだに1回だけ）。
 * 「探す」画面へ戻るたびに出すと、毎回同じ言葉が目の前を横切ってうるさい。
 */
let shownOnTouch = false;

/** マウスを重ねられる画面か（PC）。端末（APK）と、指で触る画面は false */
function canHover(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function FeedbackButton() {
  const router = useRouter();
  const t = useT();
  const { width, height, gap, bubble: bubbleW } = useFeedbackButtonSize();

  /*
    吹き出し（ご指示 2026-11-02「マウスを重ねたとき、絵の女性が話しているように」）。
      PC          … 絵にマウスを重ねている（またはキーボードで選んでいる）あいだ出す
      スマホ・端末 … 重ねるという操作が無いので、開いたときに4秒だけ出す（1回だけ）
    大きさは画面の大きさから決める（上の useFeedbackButtonSize）。
  */
  const bubbleH = Math.round(bubbleW * BUBBLE_ASPECT);
  const show = useRef(new Animated.Value(0)).current;
  const native = Platform.OS !== 'web';
  const toggle = useCallback(
    (on: boolean) =>
      Animated.timing(show, {
        toValue: on ? 1 : 0,
        duration: on ? 220 : 160,
        easing: on ? Easing.out(Easing.back(1.6)) : Easing.in(Easing.quad),
        useNativeDriver: native,
      }).start(),
    [show, native],
  );

  /*
    触れる画面では、導入映像が終わり、「探す」画面を見ているときに出す。
    映像の裏で出すと、見えないまま消えていた（2026-11-02 に確かめた）。
    見せている途中でほかの画面へ移ったら、そこで消す。
  */
  const introDone = useIntroDone();
  useFocusEffect(
    useCallback(() => {
      if (!introDone || canHover() || shownOnTouch) return;
      shownOnTouch = true;
      const start = setTimeout(() => toggle(true), 600);
      const end = setTimeout(() => toggle(false), 600 + TOUCH_SHOW_MS);
      return () => {
        clearTimeout(start);
        clearTimeout(end);
        toggle(false);
      };
    }, [introDone, toggle]),
  );

  return (
    <Pressable
      onPress={() => router.push('/feedback')}
      onHoverIn={() => toggle(true)}
      onHoverOut={() => toggle(false)}
      onFocus={() => toggle(true)}
      onBlur={() => toggle(false)}
      accessibilityRole="button"
      accessibilityLabel={t.feedback.open}
      testID="feedback-button"
      hitSlop={4}
      style={({ pressed }) => [
        styles.wrap,
        { width, height, right: gap, bottom: gap },
        pressed && styles.pressed,
      ]}
    >
      <Image source={ART} style={styles.art} contentFit="contain" />

      {/* しっぽの先を、女性の頭の左上に当てる。押せない飾り（下の中身の操作を妨げない） */}
      <Animated.View
        pointerEvents="none"
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="feedback-bubble"
        style={[
          styles.bubble,
          {
            width: bubbleW,
            height: bubbleH,
            left: width * SPEAKER_X - bubbleW * TAIL_X,
            top: height * SPEAKER_Y - bubbleH * TAIL_Y,
            transformOrigin: `${TAIL_X * 100}% ${TAIL_Y * 100}%`,
            opacity: show,
            transform: [{ scale: show.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          },
        ]}
      >
        <Image source={BUBBLE} style={styles.art} contentFit="contain" />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 5,
  },
  art: { width: '100%', height: '100%' },
  bubble: { position: 'absolute' },
  pressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
});
