import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Ramp } from '@/components/ramp';
import { HAS_ART, HERO_ART } from '@/lib/art';
import { useTheme } from '@/theme-context';

/**
 * 上部に敷く絵。広い画面の「探す」でのみ使う。
 *
 * **左は空けておく**
 *   呼びかけと検索欄がこの上に乗る。写真を全面に敷くと、文字が
 *   写真の明るい部分に重なって読めなくなる。右側だけに置き、
 *   左へ向かって背景色へ溶かす。
 *
 * **写真が入るまでの姿**
 *   ご提示の画面図では、ホテルの車寄せに車が着いた写真が入る。
 *   まだ受け取っていないため、右側だけを淡い緑に染める。
 *   差し替えの手順は lib/art.ts に書いてある。
 */
export function HeroArt() {
  const c = useTheme();

  return (
    <View style={styles.box} pointerEvents="none">
      {HAS_ART ? (
        <>
          <Image
            source={HERO_ART}
            style={styles.photo}
            contentFit="cover"
            contentPosition="right"
            transition={0}
            accessibilityLabel=""
          />
          {/*
            写真の左端を背景色へ溶かす。

            そのまま置くと縁が直線で立ち、貼り付けたように見える。
            文字が乗る側は下地の色へ戻しておく。
          */}
          <View style={styles.fade}>
            <Ramp color={c.bg} direction="left" from={0} to={1} />
          </View>
        </>
      ) : (
        <View style={styles.photo}>
          <Ramp color={c.accentSoft} direction="right" from={0} to={1} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  photo: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    // 右のおよそ半分。左半分に呼びかけと検索欄が乗る。
    width: '52%',
  },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: '46%',
    width: '20%',
  },
});
