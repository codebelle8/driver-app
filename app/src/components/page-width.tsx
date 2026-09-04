import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { CONTENT_MAX, useLayout } from '@/lib/layout';

/**
 * 中身の幅に上限を設け、中央へ寄せる。
 *
 * **なぜ要るか**
 *   1920px の画面で、1行しかない設定の欄が1900px の幅を持っていた。
 *   記号と文字が左端にあり、右の1700px は何も無い。
 *   読む方の目は行頭と行末を往復できず、ただ間延びして見える。
 *
 * **狭い画面では何もしない**
 *   上限に達しないため、包んでも包まなくても同じ描画になる。
 *   条件を書き分けずに、どの画面でも同じように包める。
 */
export function PageWidth({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const { isWide } = useLayout();
  return <View style={[styles.box, isWide && styles.wide, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  box: { flex: 1 },
  wide: { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' },
});
