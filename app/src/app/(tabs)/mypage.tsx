import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeSyncedAt, ensureSynced, resync, type SyncResult } from '@/lib/sync';
import { useEffect, useState } from 'react';
import { RADIUS, SPACE, type Palette } from '@/theme';
import { useTheme, useThemeControl } from '@/theme-context';

/**
 * 設定と状態。
 *
 * 明暗の切り替えはここへ移した。以前は検索画面の右上にあったが、
 * ご提示の構成では同じ位置がお知らせの場所になっている。
 * 一度決めたら変えない設定なので、探す画面から外して差し支えない。
 */
export default function MyPageScreen() {
  const c = useTheme();
  const { theme, toggle } = useThemeControl();
  const styles = makeStyles(c);
  const [sync, setSync] = useState<SyncResult>({ ok: true, facilityCount: 0, syncedAt: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ensureSynced().then(setSync);
  }, []);

  async function reload() {
    setBusy(true);
    setSync(await resync());
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.heading}>マイページ</Text>
      </View>

      <View style={styles.box}>
        <Pressable onPress={toggle} style={styles.row} accessibilityRole="button">
          <View style={styles.icon}>
            <Ionicons name={theme === 'dark' ? 'moon' : 'sunny'} size={17} color={c.accent} />
          </View>
          <View style={styles.body}>
            <Text style={styles.name}>画面の明るさ</Text>
            <Text style={styles.hint}>{theme === 'dark' ? '暗い表示' : '明るい表示'}</Text>
          </View>
          <Ionicons name="swap-horizontal" size={17} color={c.textFaint} />
        </Pressable>

        <Pressable onPress={reload} disabled={busy} style={styles.row} accessibilityRole="button">
          <View style={styles.icon}>
            <Ionicons name="cloud-download-outline" size={17} color={c.accent} />
          </View>
          <View style={styles.body}>
            <Text style={styles.name}>施設情報の取り込み</Text>
            <Text style={styles.hint}>
              {busy
                ? '取り込んでいます…'
                : `${sync.facilityCount} 件（${describeSyncedAt(sync.syncedAt)}に取得）`}
            </Text>
          </View>
          <Ionicons name="refresh" size={17} color={c.textFaint} />
        </Pressable>
      </View>

      <Text style={styles.note}>
        施設情報は端末の中に保存され、電波の届かない場所でも表示できます。
      </Text>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    head: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.md },
    heading: { fontSize: 22, fontWeight: '800', color: c.accent },
    box: {
      marginHorizontal: SPACE.lg,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    icon: {
      width: 34,
      height: 34,
      borderRadius: RADIUS.sm,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { flex: 1 },
    name: { fontSize: 13, fontWeight: '700', color: c.text },
    hint: { fontSize: 11, color: c.textMuted, marginTop: 1 },
    note: {
      marginTop: SPACE.md,
      paddingHorizontal: SPACE.lg,
      fontSize: 11,
      color: c.textFaint,
      lineHeight: 17,
    },
  });
}
