import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Ramp } from '@/components/ramp';
import { HAS_ART, RAIL_ART } from '@/lib/art';
import { useTheme } from '@/theme-context';

/**
 * 左メニューの下半分に敷く絵。
 *
 * **写真が入るまでの姿**
 *   ご提示の画面図では、ここに並木道と車の写真が入る。まだ受け取って
 *   いないため、上から下へ淡い緑を差す。「読み込みに失敗した箱」に
 *   見えないよう、それ自体で成り立つ面にする。
 *
 * **写真が届いたとき**
 *   app/src/assets/art/rail.jpg を置き、lib/art.ts を書き換えるだけで
 *   入れ替わる。画面側は触らない。
 */
export function RailArt() {
  const c = useTheme();

  if (HAS_ART) {
    return (
      <Image
        source={RAIL_ART}
        style={styles.fill}
        contentFit="cover"
        contentPosition="bottom"
        transition={0}
        accessibilityLabel=""
      />
    );
  }

  return (
    <View style={styles.fill}>
      <Ramp color={c.accentSoft} direction="down" from={0} to={1} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
