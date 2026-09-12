import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { HIT, RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import { useT } from '@/lib/i18n/context';

/**
 * カテゴリの横並び。
 *
 * 端の矢印について:
 *   横に並ぶ項目は、画面に収まりきらない分があることに気づかれにくい。
 *   「すべて」と「ホテル」しか見えなければ、そこで打ち止めだと思われる。
 *   続きがある側にだけ矢印を出し、押すと1つずつ送る。
 *
 *   常に出しっぱなしにしないのは、端まで送ったあとも矢印が残ると
 *   「まだあるのに動かない」と受け取られるため。
 */

export interface CategoryItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}

/**
 * 端の判定に持たせる遊び。
 *
 * 幅は小数で報告されることがあり、ちょうど端まで送っても
 * 1px 未満の差が残る。厳密に比べると矢印が消えない。
 */
const EDGE_SLOP = 12;

/**
 * 矢印の円の大きさ。送り先を決めるとき、この分だけ余分に寄せる。
 *
 * 角のある帯ではなく円にしているのは、周りの項目が角丸のため。
 * 四角い面が1つ混ざると、そこだけ浮いて見える。
 */
const ARROW_SIZE = 32;

/**
 * 矢印を置く枠の幅。
 *
 * 矢印は並びの「上」ではなく「横」に置いている。
 * 重ねると、送っている途中で項目が円の下を通り、
 * 地を塗らない円では文字と矢印が混ざって双方読めなくなる。
 * 内容の左右に余白を取っても、両端にしか効かないため解決しない。
 *
 * 矢印が出ていないときも枠は残す。出入りのたびに並びが
 * 左右へずれると、押そうとした項目が動いてしまう。
 */
const ARROW_SLOT = 40;

interface ChipLayout {
  x: number;
  width: number;
}

export function CategoryStrip({ items }: { items: CategoryItem[] }) {
  const c = useTheme();
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const viewportWidth = useRef(0);
  const contentWidth = useRef(0);
  const offset = useRef(0);
  /** 各項目の位置と幅。1つずつ送るために要る。 */
  const chips = useRef<ChipLayout[]>([]);

  const recompute = useCallback(() => {
    setCanScrollLeft(offset.current > EDGE_SLOP);
    setCanScrollRight(
      offset.current + viewportWidth.current < contentWidth.current - EDGE_SLOP,
    );
  }, []);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewportWidth.current = e.nativeEvent.layout.width;
      recompute();
    },
    [recompute],
  );

  const onContentSizeChange = useCallback(
    (w: number) => {
      contentWidth.current = w;
      recompute();
    },
    [recompute],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = e.nativeEvent.contentOffset.x;
      // 表示領域と内容の幅も、この機会に取り直す。
      // onLayout / onContentSizeChange は初回しか呼ばれないことがあり、
      // 端末の回転や文字サイズの変更に追随できない。
      viewportWidth.current = e.nativeEvent.layoutMeasurement.width;
      contentWidth.current = e.nativeEvent.contentSize.width;
      recompute();
    },
    [recompute],
  );

  const onChipLayout = useCallback((index: number, layout: ChipLayout) => {
    chips.current[index] = layout;
  }, []);

  /**
   * 1つ分だけ送る。
   *
   * 「隠れている項目を出す」方式では動く量が場所によって変わる。
   * 項目が矢印に 20px しか隠れていない場面では 20px しか動かず、
   * 見た目が変わらないため「押しても反応しない」と受け取られる。
   *
   * そこで、左端に来ている項目を基準に、その前後の項目を
   * 左端へ揃える方式にした。どの位置でも必ず1つ分動く。
   */
  const step = useCallback((direction: 'left' | 'right') => {
    const list = chips.current.filter(Boolean);
    if (list.length === 0 || !scrollRef.current) return;

    // 矢印に覆われない領域の左端。ここに項目の頭を合わせる。
    const clearLeft = offset.current;

    // いま左端に来ている項目
    let anchor = 0;
    let nearest = Number.POSITIVE_INFINITY;
    list.forEach((chip, index) => {
      const distance = Math.abs(chip.x - clearLeft);
      if (distance < nearest) {
        nearest = distance;
        anchor = index;
      }
    });

    const target = list[anchor + (direction === 'right' ? 1 : -1)];
    if (!target) return;

    // 端を越えないよう収める。行き過ぎると跳ね返って見える。
    const max = Math.max(0, contentWidth.current - viewportWidth.current);
    const x = Math.min(max, Math.max(0, target.x - SPACE.sm));
    scrollRef.current.scrollTo({ x, animated: true });
  }, []);

  return (
    <View style={styles.row}>
      <View style={styles.slot}>
        {canScrollLeft && <EdgeArrow side="left" c={c} onPress={() => step('left')} />}
      </View>

      <ScrollView
        ref={scrollRef}
        // 矢印の枠を除いた残りをすべて使う
        style={styles.scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        /*
          停止時にも位置を取り直す。
          onScroll は間引かれるため、指を離した直後や慣性で滑り終えた
          最後の1回が届かないことがある。その場合、端まで送っても
          矢印が消えないままになる。
        */
        onScrollEndDrag={onScroll}
        onMomentumScrollEnd={onScroll}
        // 既定は 1秒に1回程度で、矢印の消え方が遅れて見える
        scrollEventThrottle={16}
      >
        {items.map((item, index) => (
          <Chip
            key={item.key}
            item={item}
            c={c}
            onMeasure={(layout) => onChipLayout(index, layout)}
          />
        ))}
      </ScrollView>

      <View style={styles.slot}>
        {canScrollRight && <EdgeArrow side="right" c={c} onPress={() => step('right')} />}
      </View>
    </View>
  );
}

/** 続きがあることを示し、押すと1つ送る */
function EdgeArrow({
  side,
  c,
  onPress,
}: {
  side: 'left' | 'right';
  c: Palette;
  onPress: () => void;
}) {
  const t = useT();
  return (
    <Pressable
        onPress={onPress}
        // 走行前の車内で押されるため、見た目より広く当たるようにする
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={side === 'left' ? t.search.prevCategory : t.search.nextCategory}
        style={({ pressed }) => [
          styles.arrow,
          // 地は塗らない。円と矢印だけが見え、四角い面は描かない。
          //
          // 枠線に borderStrong ではなく textMuted を使っているのは、
          // 項目の枠と同じ濃さだと、押せる部品なのか区切り線なのか
          // 区別がつかず、薄くて見落とされたため。
          { borderColor: c.textMuted },
          pressed && { backgroundColor: c.surface2, borderColor: c.accent },
        ]}
      >
        <Ionicons
          name={side === 'left' ? 'chevron-back' : 'chevron-forward'}
          size={20}
          color={c.text}
        />
    </Pressable>
  );
}

function Chip({
  item,
  c,
  onMeasure,
}: {
  item: CategoryItem;
  c: Palette;
  onMeasure: (layout: ChipLayout) => void;
}) {
  return (
    <Pressable
      onPress={item.onPress}
      onLayout={(e) =>
        onMeasure({ x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width })
      }
      accessibilityRole="button"
      accessibilityState={{ selected: item.active }}
      style={[
        styles.chip,
        { borderColor: c.border, backgroundColor: c.surface2 },
        item.active && { borderColor: c.accent, backgroundColor: c.accentSoft },
      ]}
    >
      <Ionicons name={item.icon} size={16} color={item.active ? c.accent : c.textMuted} />
      <Text
        style={[
          styles.chipText,
          { color: c.textMuted },
          item.active && { color: c.accentInk, fontWeight: '700' },
        ]}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    paddingRight: SPACE.sm,
    paddingVertical: SPACE.md,
    gap: SPACE.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: HIT.min,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  chipText: { fontSize: TEXT.bodyStrong },

  row: { flexDirection: 'row', alignItems: 'center' },
  scroll: { flex: 1 },
  // 矢印の有無で並びがずれないよう、枠は常に確保する
  slot: {
    width: ARROW_SLOT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  arrow: {
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: ARROW_SIZE / 2,
    borderWidth: 1.5,
    // 明示しておく。既定でも塗られないが、
    // 「四角い面は描かない」という意図を残す。
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },

});
