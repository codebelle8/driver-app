import { StyleSheet, View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { Ramp } from '@/components/ramp';
import { HERO_ART_URLS } from '@/lib/art';
import { useTheme } from '@/theme-context';

/**
 * 上部に敷く絵。広い画面の「探す」でのみ使う。
 *
 * **左は空けておく**
 *   呼びかけと検索欄がこの上に乗る。全面に敷くと、文字が写真の明るい
 *   部分に重なって読めなくなる。右側だけに置き、左へ向かって背景色へ溶かす。
 *
 * **写真が無くても成り立つ**
 *   下敷きに淡い緑の階調を常に敷き、その上へ写真を重ねる。
 *   写真（app/public/art/hero.jpg）が無ければ読み込みに失敗し、
 *   下敷きがそのまま残る。置き場所は同じ場所の README に書いてある。
 */
export function HeroArt() {
  const c = useTheme();

  return (
    <View style={styles.box} pointerEvents="none">
      {/* 下敷き。写真の有無にかかわらず敷く。 */}
      <View style={styles.photo}>
        <Ramp color={c.accentSoft} direction="right" from={0} to={1} />
      </View>

      {/*
        右上を基準に切り取る。

        高さ280に対して写真は縦長寄りのため、上下のどちらかが切れる。
        中央に合わせると人物の頭が切れた。上を基準にすれば、
        切れるのは足元と路面になる。
      */}
      <ArtImage
        urls={HERO_ART_URLS}
        style={styles.photo}
        contentPosition={{ top: 0, right: 0 }}
      />

      {/*
        写真の縁を背景色へ溶かす。

        そのまま置くと縁が直線で立ち、貼り付けたように見える。

        **帯は写真の上に重ねる。**
          写真の外側に置いても縁は消えない。溶かしたい線をまたぐ位置に
          置き、線のところで最も濃く、写真の内側へ向かって薄くする。
          外側に置いていたため、縦線がそのまま残っていた。

        写真が無くても、下敷きの縁を溶かす役に立つ。常に出しておく。
      */}
      <View style={styles.fadeLeft}>
        <Ramp color={c.bg} direction="left" from={0} to={1} />
      </View>
      <View style={styles.fadeBottom}>
        <Ramp color={c.bg} direction="down" from={0} to={1} />
      </View>
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
  /*
    左の縁をまたぐ帯。

    写真は右から 52%。その左端（左から 48%）にちょうど重なるよう、
    右から 34% の位置に 18% の幅で置く。左端で最も濃く、
    写真の内側へ向かって薄くする。
  */
  fadeLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: '34%',
    width: '18%',
  },
  /* 下の縁も同じ考え方で溶かす。中身との境に線を作らない。 */
  fadeBottom: {
    position: 'absolute',
    left: '48%',
    right: 0,
    bottom: 0,
    height: 72,
  },
});
