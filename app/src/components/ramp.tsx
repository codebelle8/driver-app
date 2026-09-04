import { StyleSheet, View } from 'react-native';

/**
 * 色が少しずつ移り変わる面。
 *
 * **なぜ自前で作るか**
 *   なめらかな階調を描く道具（expo-linear-gradient）を入れていない。
 *   絵の下敷きのためだけに依存を増やすと、実機の作り直しが必要になり、
 *   端末側の不具合を持ち込む余地も増える。
 *
 * **どう作るか**
 *   同じ色の帯を並べ、透け具合だけを少しずつ変える。
 *   帯を細かくすれば、境目は目に付かなくなる。4本では縞に見えたため
 *   既定を24本にしている。
 */
export function Ramp({
  color,
  /** 'right' … 右へ濃く / 'left' … 左へ濃く / 'down' … 下へ濃く / 'up' … 上へ濃く */
  direction,
  /** 濃い側の透け具合 */
  to = 1,
  /** 薄い側の透け具合 */
  from = 0,
  steps = 24,
  style,
}: {
  color: string;
  direction: 'right' | 'left' | 'down' | 'up';
  to?: number;
  from?: number;
  steps?: number;
  style?: object;
}) {
  const horizontal = direction === 'right' || direction === 'left';
  const reversed = direction === 'left' || direction === 'up';

  const bands = Array.from({ length: steps }, (_, i) => {
    const t = steps === 1 ? 1 : i / (steps - 1);
    return from + (to - from) * (reversed ? 1 - t : t);
  });

  return (
    <View
      style={[
        styles.box,
        { flexDirection: horizontal ? 'row' : 'column' },
        style,
      ]}
      pointerEvents="none"
    >
      {bands.map((opacity, i) => (
        <View key={i} style={[styles.band, { backgroundColor: color, opacity }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  band: { flex: 1 },
});
