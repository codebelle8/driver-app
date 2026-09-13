import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme, useThemeControl } from '@/theme-context';
import { useT } from '@/lib/i18n/context';

/**
 * 一覧の先頭へ戻るボタン。
 *
 * 何件も送ったあと、上へ戻すのに何度も指を動かすのは
 * 走行前の限られた時間では負担になる。ひと押しで戻せるようにする。
 *
 * 一定量スクロールするまで出さないのは、先頭付近では不要なうえ、
 * 常に浮いていると一覧の内容を隠すため。
 */

/**
 * 車の画像。配色ごとに2種類ずつ持つ。
 *
 * ご提供いただいた車体は白 (rgb(223,236,250))。明るい配色のボタン面も
 * ほぼ白のため、そのまま載せると車体の輪郭が消える。
 * 明るい配色用は、車の形をぼかした暗いふちを裏に敷いてある
 * （tools/import-brand.mjs の withHalo）。図柄そのものは変えていない。
 *
 * 読み込めない場合は記号で代替する。
 */
let carImages: { off: number; on: number } | null = null;
let carImagesLight: { off: number; on: number } | null = null;
try {
  carImages = {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    off: require('@/assets/brand/car.png'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    on: require('@/assets/brand/car-brake.png'),
  };
  carImagesLight = {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    off: require('@/assets/brand/car-light.png'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    on: require('@/assets/brand/car-light-brake.png'),
  };
} catch {
  carImages = null;
  carImagesLight = null;
}

/**
 * 一覧の下に空けておく高さ。
 *
 * この釦は一覧の上に浮く。一覧の中身をそのまま下端まで敷くと、
 * **末尾の一行と「先頭へ」の文字が重なる。** 実際に重なっていた。
 *
 * 下からの位置(24) + 釦(64) + 隙間(4) + 文字(16) に、少し余裕を足した値。
 * 一覧側の contentContainerStyle で、この分だけ下を空ける。
 */
export const SCROLL_TOP_CLEARANCE = 120;

/** 操作を離れてから尾灯を消すまでの時間 (ms)。一覧が戻り切るまで点けておく。 */
const BRAKE_HOLD = 600;

export function ScrollTopButton({
  visible,
  onPress,
}: {
  visible: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const c = useTheme();
  const { theme } = useThemeControl();
  const styles = makeStyles(c);

  // 明るい配色では、ふち付きの版を使う（白い面でも輪郭が読めるように）
  const car = theme === 'light' ? carImagesLight : carImages;

  // 出入りを瞬間的に切り替えると、視界の端でちらついて気が散る
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [visible, fade]);

  /*
    操作している間、尾灯を点ける。車寄せで停まる動作はブレーキなので、
    操作の手応えを実際の車の挙動で返す。

    点けるのは、指を置いた時点（マウスなら重ねた時点）から。
    押し込むまで待つと、点いたことに気づかないまま操作が終わる。

    離してすぐ消さないのは、軽く叩いただけだと点灯が見えないため。
    一覧が先頭へ戻り切るまで点けておく。
  */
  const [braking, setBraking] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 消える前に画面から外れると、タイマーだけが残る
  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  function startBraking() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setBraking(true);
  }

  function endBraking() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setBraking(false), BRAKE_HOLD);
  }

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.wrap, { opacity: fade }]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={startBraking}
        onPressOut={endBraking}
        // マウスやトラックパッドで使う場合は、重ねた時点で点ける
        onHoverIn={startBraking}
        onHoverOut={endBraking}
        accessibilityRole="button"
        accessibilityLabel={t.common.topLabel}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        {car ? (
          /*
            2枚を重ねて置き、不透明度だけを切り替える。
            source を差し替える方式だと、初めて押した瞬間に
            点灯版の読み込みが始まり、一拍遅れて光ることになる。
          */
          <View style={styles.car}>
            <Image
              source={car.off}
              style={[styles.carLayer, braking && styles.hidden]}
              contentFit="contain"
              transition={0}
            />
            <Image
              source={car.on}
              style={[styles.carLayer, !braking && styles.hidden]}
              contentFit="contain"
              transition={0}
            />
          </View>
        ) : (
          <Ionicons name="car-sport" size={30} color={braking ? '#ff4133' : c.text} />
        )}
        <View style={styles.badge}>
          <Ionicons name="chevron-up" size={13} color={c.accentText} />
        </View>
      </Pressable>
      <Text style={styles.label}>{t.common.top}</Text>
    </Animated.View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      right: SPACE.lg,
      bottom: SPACE.xl,
      alignItems: 'center',
      gap: 4,
    },
    button: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      // 一覧の上に浮くため、影で高さを示す
      shadowColor: '#000',
      shadowOpacity: 0.28,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    pressed: { backgroundColor: c.surface2, borderColor: c.accent },
    // 元画像の縦横比 1232:1104 に合わせる。潰れて見えないようにする。
    car: { width: 44, height: 40 },
    // 通常時と点灯時を同じ位置に重ねる
    carLayer: { position: 'absolute', top: 0, left: 0, width: 44, height: 40 },
    hidden: { opacity: 0 },
    badge: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      // 下地と同じ色で縁取る。ボタンから切り抜いたように見せる。
      borderWidth: 2,
      borderColor: c.surface,
    },
    label: { fontSize: TEXT.small, color: c.textMuted },
  });
}
