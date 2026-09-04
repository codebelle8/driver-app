import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchNotices,
  getRead,
  markAllRead,
  markRead,
  type Notice,
} from '@/lib/notices';
import { describeWhen } from '@/lib/when';
import { HIT_SLOP, RADIUS, SPACE, type Palette } from '@/theme';
import { IconButton } from '@/components/icon-button';
import { PageWidth } from '@/components/page-width';
import { useTheme } from '@/theme-context';

/**
 * お知らせの一覧。
 *
 * 並びは「いま効いている注意 → 新しく増えた施設」。
 * 現地でいま効いている条件のほうが、更新の知らせより切迫している。
 *
 * 既読は1件ずつ。押したものだけを読んだことにする。
 * 開いただけで全部を既読にすると、どれを見たのかが分からなくなる。
 */
export default function NoticesScreen() {
  const c = useTheme();
  const styles = makeStyles(c);
  const router = useRouter();

  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [read, setRead] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      const [list, already] = await Promise.all([fetchNotices(), getRead()]);
      if (!alive) return;
      setNotices(list);
      setRead(already);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /*
    開いただけでは既読にしない。

    まとめて消すと、どれを見てどれを見ていないのかが分からなくなる。
    押した1件だけを既読にし、未読の数はその分だけ減らす。
  */
  function onOpen(id: string) {
    setRead((prev) => new Set(prev).add(id));
    void markRead(id);
  }

  async function onReadAll() {
    const ids = (notices ?? []).map((n) => n.id);
    setRead(new Set(ids));
    await markAllRead(ids);
  }

  const unread = (notices ?? []).filter((n) => !read.has(n.id)).length;

  const cautions = (notices ?? []).filter((n) => n.kind === 'caution');
  const added = (notices ?? []).filter((n) => n.kind === 'added');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* 広い画面で間延びしないよう、中身の幅に上限を設ける */}
      <PageWidth>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <IconButton icon="arrow-back" size={22} label="戻る" onPress={() => router.back()} />
        <Text style={styles.topTitle}>
          お知らせ{unread > 0 ? ` (${unread})` : ''}
        </Text>
        {unread > 0 ? (
          <Pressable onPress={onReadAll} hitSlop={HIT_SLOP} accessibilityLabel="すべて既読にする">
            <Text style={styles.readAll}>すべて既読</Text>
          </Pressable>
        ) : (
          <View style={styles.topSpacer} />
        )}
      </View>

      {notices === null ? (
        <ActivityIndicator style={styles.spinner} color={c.accent} />
      ) : notices.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={28} color={c.textFaint} />
          <Text style={styles.emptyTitle}>お知らせはありません</Text>
          <Text style={styles.emptyBody}>
            新しく増えた施設や、いま効いている注意事項がここに出ます。
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
          {cautions.length > 0 && (
            <>
              <Text style={styles.section}>いま効いている注意</Text>
              {cautions.map((n) => (
                <NoticeRow
                  key={n.id}
                  notice={n}
                  styles={styles}
                  c={c}
                  urgent
                  unread={!read.has(n.id)}
                  onOpen={onOpen}
                />
              ))}
            </>
          )}

          {added.length > 0 && (
            <>
              <Text style={styles.section}>新しく増えた施設</Text>
              {added.map((n) => (
                <NoticeRow
                  key={n.id}
                  notice={n}
                  styles={styles}
                  c={c}
                  unread={!read.has(n.id)}
                  onOpen={onOpen}
                />
              ))}
            </>
          )}

          <Text style={styles.foot}>
            前回この端末で取り込んだあとに増えた施設を、過去14日ぶんまで出しています。
          </Text>
        </ScrollView>
      )}
      </PageWidth>
    </SafeAreaView>
  );
}

function NoticeRow({
  notice,
  styles,
  c,
  urgent = false,
  unread,
  onOpen,
}: {
  notice: Notice;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  urgent?: boolean;
  unread: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <Link href={`/facility/${notice.facilityId}`} asChild>
      <Pressable
        onPress={() => onOpen(notice.id)}
        style={urgent ? styles.rowUrgent : styles.row}
        accessibilityRole="link"
      >
        <View style={urgent ? styles.iconUrgent : styles.icon}>
          <Ionicons
            name={urgent ? 'alert-circle' : 'refresh-circle'}
            size={18}
            color={urgent ? c.danger : c.accent}
          />
        </View>
        <View style={styles.body}>
          <View style={styles.nameRow}>
            {/* 未読はここで見分ける。数字だけだとどれが新しいのか分からない。 */}
            {unread && <View style={styles.dot} />}
            <Text style={unread ? styles.nameUnread : styles.name} numberOfLines={1}>
              {notice.facilityName}
            </Text>
          </View>
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
    readAll: { fontSize: 12, color: c.accent, fontWeight: '600' },

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
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent },
    name: { flex: 1, fontSize: 13, fontWeight: '400', color: c.textMuted },
    nameUnread: { flex: 1, fontSize: 13, fontWeight: '700', color: c.text },
    text: { fontSize: 12, color: c.textMuted, marginTop: 2, lineHeight: 17 },
    when: { fontSize: 11, color: c.textFaint, marginTop: 3 },

    spinner: { marginTop: SPACE.xl },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: SPACE.xl },
    emptyTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    emptyBody: { fontSize: 12, color: c.textMuted, textAlign: 'center', lineHeight: 18 },
    foot: { marginTop: SPACE.md, fontSize: 11, color: c.textFaint, textAlign: 'center', lineHeight: 17 },
  });
}
