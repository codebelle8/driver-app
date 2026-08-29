import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeWhen, fetchNotices, markSeen, type Notice } from '@/lib/notices';
import { HIT_SLOP, RADIUS, SPACE, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * お知らせの一覧。
 *
 * 並びは「いま効いている注意 → 最近変わった施設」。
 * 現地でいま効いている条件のほうが、更新の知らせより切迫している。
 *
 * 開いた時点で「見た」ことにする。次に開いたとき、それ以降に
 * 変わったものだけが新着として数えられる。
 */
export default function NoticesScreen() {
  const c = useTheme();
  const styles = makeStyles(c);
  const router = useRouter();

  const [notices, setNotices] = useState<Notice[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await fetchNotices();
      if (!alive) return;
      setNotices(list);
      // 一覧を出せたことを確かめてから印を付ける。
      // 先に付けると、読み込みに失敗したときに新着が消える。
      await markSeen();
    })();
    return () => {
      alive = false;
    };
  }, []);

  const cautions = (notices ?? []).filter((n) => n.kind === 'caution');
  const updated = (notices ?? []).filter((n) => n.kind === 'updated');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={HIT_SLOP} accessibilityLabel="戻る">
          <Ionicons name="arrow-back" size={22} color={c.text} />
        </Pressable>
        <Text style={styles.topTitle}>お知らせ</Text>
        <View style={styles.topSpacer} />
      </View>

      {notices === null ? (
        <ActivityIndicator style={styles.spinner} color={c.accent} />
      ) : notices.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={28} color={c.textFaint} />
          <Text style={styles.emptyTitle}>お知らせはありません</Text>
          <Text style={styles.emptyBody}>
            進入方法の変更や、いま効いている注意事項がここに出ます。
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
          {cautions.length > 0 && (
            <>
              <Text style={styles.section}>いま効いている注意</Text>
              {cautions.map((n) => (
                <NoticeRow key={n.id} notice={n} styles={styles} c={c} urgent />
              ))}
            </>
          )}

          {updated.length > 0 && (
            <>
              <Text style={styles.section}>最近変わった施設</Text>
              {updated.map((n) => (
                <NoticeRow key={n.id} notice={n} styles={styles} c={c} />
              ))}
            </>
          )}

          <Text style={styles.foot}>
            過去14日ぶんを出しています。詳しい内容は各施設の画面でご確認ください。
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function NoticeRow({
  notice,
  styles,
  c,
  urgent = false,
}: {
  notice: Notice;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  urgent?: boolean;
}) {
  return (
    <Link href={`/facility/${notice.facilityId}`} asChild>
      <Pressable style={urgent ? styles.rowUrgent : styles.row} accessibilityRole="link">
        <View style={urgent ? styles.iconUrgent : styles.icon}>
          <Ionicons
            name={urgent ? 'alert-circle' : 'refresh-circle'}
            size={18}
            color={urgent ? c.danger : c.accent}
          />
        </View>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {notice.facilityName}
          </Text>
          <Text style={styles.text} numberOfLines={2}>
            {notice.body}
          </Text>
          {!urgent && <Text style={styles.when}>{describeWhen(notice.at)}</Text>}
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
      </Pressable>
    </Link>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.sm,
    },
    topTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: c.text },
    topSpacer: { width: 22 },

    page: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xl },
    section: {
      fontSize: 13,
      fontWeight: '700',
      color: c.text,
      marginTop: SPACE.md,
      marginBottom: SPACE.sm,
    },

    /*
      Link asChild の下では、見た目を配列で渡すとブラウザ側で扱えず
      画面が出なくなる。組み合わせごとに1つにまとめて持つ。
    */
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      padding: SPACE.md,
      marginBottom: SPACE.sm,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowUrgent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      padding: SPACE.md,
      marginBottom: SPACE.sm,
      borderRadius: RADIUS.md,
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.danger,
    },
    icon: {
      width: 34,
      height: 34,
      borderRadius: RADIUS.sm,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconUrgent: {
      width: 34,
      height: 34,
      borderRadius: RADIUS.sm,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { flex: 1 },
    name: { fontSize: 13, fontWeight: '700', color: c.text },
    text: { fontSize: 12, color: c.textMuted, marginTop: 2, lineHeight: 17 },
    when: { fontSize: 11, color: c.textFaint, marginTop: 3 },

    spinner: { marginTop: SPACE.xl },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: SPACE.xl },
    emptyTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    emptyBody: { fontSize: 12, color: c.textMuted, textAlign: 'center', lineHeight: 18 },
    foot: { marginTop: SPACE.md, fontSize: 11, color: c.textFaint, textAlign: 'center', lineHeight: 17 },
  });
}
