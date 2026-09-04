import { StyleSheet, View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { Ramp } from '@/components/ramp';
import { RAIL_ART_URLS } from '@/lib/art';
import { useTheme } from '@/theme-context';

/**
 * 左メニューの下半分に敷く絵。
 *
 * **写真が無くても成り立つ**
 *   下敷きに淡い緑の階調を常に敷き、その上へ写真を重ねる。
 *   写真（app/public/art/rail.jpg）が無ければ読み込みに失敗し、
 *   下敷きがそのまま残る。置き場所は同じ場所の README に書いてある。
 *
 * 上端は行先の並びに向かって薄くする。写真を入れたときも同じ位置で
 * 本文と切り替わるよう、高さの取り方は変えない。
 */
export function RailArt() {
  const c = useTheme();

  return (
    <View style={styles.fill} pointerEvents="none">
      <Ramp color={c.accentSoft} direction="down" from={0} to={1} />

      <ArtImage urls={RAIL_ART_URLS} style={styles.fill} contentPosition="bottom" />

      {/* 上端を下地へ溶かす。行先の並びとのあいだに線を作らない。 */}
      <View style={styles.top}>
        <Ramp color={c.surface} direction="up" from={0} to={1} />
      </View>

      {/*
        下端も下地へ溶かす。

        ここには「スムーズな到着を、もっと快適に。」が重なる。
        写真の上へ直に置くと、明るい車体と灰色の文字で見分けが付かず、
        実際に読めなくなっていた。文字が乗る範囲だけ下地へ戻す。
      */}
      <View style={styles.bottom}>
        <Ramp color={c.surface} direction="down" from={0} to={1} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, height: 96 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 132 },
});
