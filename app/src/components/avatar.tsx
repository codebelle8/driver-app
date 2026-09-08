import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 顔写真の丸。
 *
 * **写真が無くても穴を空けない**
 *   未設定の方のほうが多い。空の丸を置くと、読み込みに失敗しているのか
 *   まだ設定していないのか見分けがつかない。お名前（無ければメール
 *   アドレス）の頭の1文字を出す。
 *
 * **頭の1文字の選び方**
 *   絵文字や結合文字で1文字を取ると、途中で切れて豆腐（□）になる。
 *   Intl.Segmenter があるときはそれで、無ければ書記素をおおまかに拾う。
 */
export function Avatar({
  url,
  name,
  size = 32,
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
}) {
  const c = useTheme();
  const s = makeStyles(c);

  const round = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[s.photo, round]}
        contentFit="cover"
        transition={120}
        accessibilityLabel=""
      />
    );
  }

  return (
    <View style={[s.blank, round]}>
      <Text style={[s.letter, { fontSize: Math.round(size * 0.44) }]}>{initialOf(name)}</Text>
    </View>
  );
}

/** 頭の1文字。無ければ人の形の代わりに「・」を出す。 */
function initialOf(name?: string | null): string {
  const t = (name ?? '').trim();
  if (!t) return '·';

  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const first = seg.segment(t)[Symbol.iterator]().next();
    if (!first.done) return first.value.segment.toUpperCase();
  } catch {
    // Intl.Segmenter の無い環境。下の当てで足りる。
  }
  return [...t][0]?.toUpperCase() ?? '·';
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    photo: { backgroundColor: c.surface2 },
    blank: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accentSoft,
      borderWidth: 1,
      borderColor: c.accent,
    },
    letter: { fontWeight: '800', color: c.accent },
  });
