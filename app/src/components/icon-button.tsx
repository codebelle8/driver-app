import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import type { Palette } from '@/theme';
import { HIT_SLOP } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 記号だけのボタン。
 *
 * **なぜ部品にするか**
 *   上部の帯に並ぶ記号（戻る・共有・お気に入り）が、押しても乗せても
 *   見た目が変わらなかった。マウスで使う画面では、触れる画面と違って
 *   「押せる」手がかりが見た目にしかない。
 *
 *   お知らせの鐘だけが反応する作りになっていたため、同じ反応をここへ
 *   まとめ、記号を置くところは全部これを通す。
 *
 * **反応の決め方**
 *   乗せたら淡い下地、押したら濃い下地。入っている状態（お気に入りなど）は
 *   記号を塗りつぶし、色を変える。形が変わるので、色が見分けにくい方にも
 *   状態が伝わる。
 *
 * **当たり判定は見た目より広く取る**
 *   走行前の車内では指が正確に狙えない。丸の外側にも余地を持たせる。
 */
export function IconButton({
  /** 押していない状態の記号 */
  icon,
  /** 入っている状態の記号。省くと icon のまま。 */
  iconOn,
  on = false,
  onPress,
  label,
  size = 20,
  disabled = false,
  compact = false,
  onDark = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconOn?: keyof typeof Ionicons.glyphMap;
  /** 入っている状態か（お気に入りに留めてある、など） */
  on?: boolean;
  onPress?: () => void;
  /** 読み上げと、マウスを乗せたときの説明 */
  label: string;
  size?: number;
  disabled?: boolean;
  /** 欄の中など、丸を小さく収めたいところ */
  compact?: boolean;
  /** 写真など暗い地の上。白い地に濃い記号で置く。 */
  onDark?: boolean;
}) {
  const c = useTheme();
  const s = makeStyles(c);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  /*
    記号の色。

    暗い地の上では、白い丸に濃い記号で置く。色だけを変える作りにすると、
    明るい写真の上では消え、暗い写真の上では読めなくなる。
  */
  const color = disabled
    ? c.textFaint
    : onDark
      ? '#171c20'
      : on || pressed
        ? c.accent
        : c.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => {
        setHovered(false);
        setPressed(false);
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, disabled }}
      style={s.hit}
    >
      <View
        style={StyleSheet.flatten([
          s.box,
          compact && s.boxCompact,
          onDark && s.boxDark,
          hovered && !disabled && (onDark ? s.hoverDark : s.hover),
          pressed && !disabled && (onDark ? s.hoverDark : s.press),
          on && s.on,
        ])}
      >
        <Ionicons name={on && iconOn ? iconOn : icon} size={size} color={color} />
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    hit: {
      padding: 4,
      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
    },
    box: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxCompact: { width: 28, height: 28, borderRadius: 14 },
    boxDark: { backgroundColor: '#ffffff', opacity: 0.82 },
    hoverDark: { backgroundColor: '#ffffff', opacity: 1 },
    hover: { backgroundColor: c.surface2 },
    press: { backgroundColor: c.accentSoft },
    on: { backgroundColor: c.accentSoft },
  });
