import { StyleSheet, View } from 'react-native';

import { HeroSlides } from '@/components/hero-slides';
import { Ramp } from '@/components/ramp';
import { useTheme } from '@/theme-context';

/**
 * 上部に敷く絵。広い画面の「探す」でのみ使う。
 *
 * **横一杯に敷く**
 *   いただいた4枚は、それぞれが一枚で完結する横長の絵として作られている。
 *   呼びかけの文字も絵の中にあるため、画面側で見出しを描かず絵に任せる。
 *   左メニューの右端から画面の右端まで、余白を置かずに敷く。
 *
 *   以前は右半分にだけ敷き、左に見出しと検索欄を置いていた。その作りだと
 *   絵の中の呼びかけと画面側の見出しが二度出ていた。
 *
 * **上を基準に切る**
 *   枠は横長で、絵の縦横比（およそ 2.1）より平たい。上下のどちらかが
 *   切れるため、上を基準にする。空と人物が残り、切れるのは足元や
 *   街並みの下端になる。
 *
 * **4枚を順に入れ替える**
 *   置かれている枚数だけで回る（components/hero-slides.tsx）。
 *   1枚も置かれていなければ、下敷きの淡い緑がそのまま残る。
 *   置き場所は app/public/art/ の README に書いてある。
 */
export function HeroArt() {
  const c = useTheme();

  return (
    <View style={styles.fill} pointerEvents="none">
      {/* 下敷き。写真が無いとき、または読み込むまでのあいだ。 */}
      <Ramp color={c.accentSoft} direction="down" from={0} to={1} />
      <HeroSlides style={styles.slide} contentPosition={{ top: 0 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  slide: { width: '100%', height: '100%' },
});
