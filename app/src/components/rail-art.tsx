import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Ramp } from '@/components/ramp';
import { CAN_LOAD_ART, RAIL_ART_URL } from '@/lib/art';
import { useTheme } from '@/theme-context';

/**
 * 左メニューの下半分に敷く絵。
 *
 * **写真が無くても成り立つ**
 *   下敷きに淡い緑の階調を常に敷き、その上へ写真を重ねる。
 *   写真（app/public/art/rail.jpg）が置かれていなければ読み込みに失敗し、
 *   下敷きがそのまま残る。置き場所は同じ場所の README に書いてある。
 *
 * 上端は行先の並びに向かって薄くする。写真を入れたときも同じ位置で
 * 本文と切り替わるよう、高さの取り方は変えない。
 */
export function RailArt() {
  const c = useTheme();
  const [failed, setFailed] = useState(false);

  return (
    <View style={styles.fill} pointerEvents="none">
      <Ramp color={c.accentSoft} direction="down" from={0} to={1} />

      {CAN_LOAD_ART && !failed && (
        <>
          <Image
            source={{ uri: RAIL_ART_URL }}
            style={styles.fill}
            contentFit="cover"
            contentPosition="bottom"
            transition={200}
            onError={() => setFailed(true)}
            accessibilityLabel=""
          />
          {/* 上端を下地へ溶かす。行先の並びとのあいだに線を作らない。 */}
          <View style={styles.top}>
            <Ramp color={c.surface} direction="up" from={0} to={1} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, height: 96 },
});
