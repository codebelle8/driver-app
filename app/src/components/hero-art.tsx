import { StyleSheet, View } from 'react-native';

import { HeroSlides } from '@/components/hero-slides';
import { Ramp } from '@/components/ramp';
import { useTheme } from '@/theme-context';

/**
 * 上部に敷く絵。広い画面の「探す」でのみ使う。
 *
 * **横一杯に敷く**
 *   いただいた絵は、それぞれが一枚で完結する横長の絵として作られている。
 *   呼びかけの文字も絵の中にあるため、画面側で見出しを描かず絵に任せる。
 *   左メニューの右端から画面の右端まで、余白を置かずに敷く。
 *
 * **切らずに、まるごと出す**
 *   縦横の比を保ったまま枠に収める。余った側には、同じ絵を広げて
 *   ぼかしたものを敷く（components/hero-slides.tsx）。
 *
 * **押せるようにしておく**
 *   送りの矢印がこの中にある。層ごと操作を通さない設定にすると
 *   矢印まで押せなくなるため、ここでは塞がない。
 *
 * **写真が無くても成り立つ**
 *   下敷きに淡い緑を敷いてある。1枚も置かれていなければそれが残る。
 *   置き場所は app/public/art/ の README に書いてある。
 */
export function HeroArt() {
  const c = useTheme();

  return (
    <View style={styles.fill}>
      {/* 下敷き。写真が無いとき、または読み込むまでのあいだ。 */}
      <View style={styles.fill} pointerEvents="none">
        <Ramp color={c.accentSoft} direction="down" from={0} to={1} />
      </View>
      <HeroSlides />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
