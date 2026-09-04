import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { HeroSlides } from '@/components/hero-slides';
import { Ramp } from '@/components/ramp';
import type { Palette } from '@/theme';
import { RADIUS, SPACE } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 上部の帯。広い画面の「探す」でのみ使う。
 *
 * **写真を切らずに、まるごと見せる**
 *   いただいた4枚は、それぞれが一枚で完結する横長の絵として作られている。
 *   文字や案内の図がその中に入っており、端を切ると意味が変わる。
 *   縦横の比を保ったまま、全体が収まる大きさで置く。
 *
 *   以前は右半分にだけ敷き、左に見出しと検索欄を重ねていた。
 *   その作りだと、絵の中の「行きたい場所を見つけよう」と画面側の見出しが
 *   二度出て、絵の中の検索窓と本物の検索欄が並んでしまった。
 *
 * **本文と同じ幅に置く**
 *   検索欄やカテゴリの札と左右の端を揃える。中央へ寄せて置いたところ、
 *   帯だけが内側にずれ、下の並びと段差ができていた。
 *
 *   広すぎる画面では本文そのものに上限があるため（page の maxWidth）、
 *   帯の高さも自ずと収まる。1920px の画面で 545px ほど。
 *
 * **写真が無くても成り立つ**
 *   1枚も置かれていなければ、淡い緑の面が残る。
 *   置き場所は app/public/art/ の README に書いてある。
 */

/**
 * 絵の縦横の比。
 *
 * いただいた4枚はいずれも 1819×865 前後（およそ 2.1）。
 * ここを実際の比に合わせておくと、上下左右に余りが出ない。
 */
const ASPECT = 2.1;

export function HeroArt() {
  const c = useTheme();
  const s = makeStyles(c);

  /** 置ける幅。画面幅から引き算せず、枠を実測する。 */
  const [room, setRoom] = useState(0);

  const height = room / ASPECT;

  return (
    <View
      style={s.wrap}
      onLayout={(e) => setRoom(Math.round(e.nativeEvent.layout.width))}
    >
      {room > 0 && (
        <View style={[s.banner, { height }]}>
          {/* 下敷き。写真が無いとき、または読み込むまでのあいだ。 */}
          <Ramp color={c.accentSoft} direction="down" from={0} to={1} />
          <HeroSlides style={s.slide} contentFit="contain" />
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { paddingTop: SPACE.xl },
    banner: {
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
      backgroundColor: c.surface2,
    },
    slide: { width: '100%', height: '100%' },
  });
