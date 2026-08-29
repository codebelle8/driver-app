import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RADIUS, SPACE, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * これから作る画面の置き場所。
 *
 * 空白のままにせず「何が入る予定か」を書いておく。
 * 押した方が「壊れている」と受け取らないようにするため。
 */
export function ComingSoon({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  const c = useTheme();
  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.heading}>{title}</Text>
      </View>
      <View style={styles.center}>
        <View style={styles.badge}>
          <Ionicons name={icon} size={28} color={c.accent} />
        </View>
        <Text style={styles.title}>準備中です</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    head: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.sm },
    heading: { fontSize: 22, fontWeight: '800', color: c.accent },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACE.sm,
      paddingHorizontal: SPACE.xl,
      paddingBottom: SPACE.xl,
    },
    badge: {
      width: 64,
      height: 64,
      borderRadius: RADIUS.md,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACE.sm,
    },
    title: { fontSize: 15, fontWeight: '700', color: c.text },
    body: { fontSize: 12, color: c.textMuted, textAlign: 'center', lineHeight: 18 },
  });
}
