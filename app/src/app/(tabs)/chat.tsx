import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageWidth } from '@/components/page-width';
import { useT } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/dictionaries';
import { loadRanking, type Ranking } from '@/lib/ranking';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * チャット（2026-10-05）。チャンネルの一覧。
 *
 * **いまは「情報提供ランキング」の1つだけ。** 会員は読むだけ。
 * 会員どうしで書き込むチャンネルは次の段で足す。一覧の形にしておくのは、
 * そのときに並べるだけで済むようにするため。
 *
 * 無料期間が切れて締め出されている方も、ここは開ける（ご回答 2026-10-05）。
 * 情報を送って無料を目指す入口にもなるため。
 */
export default function ChatScreen() {
  const c = useTheme();
  const t = useT();
  const styles = makeStyles(c);
  const router = useRouter();
  const [ranking, setRanking] = useState<Ranking | null>(null);

  /* 開くたびに引き直す（審査されると件数が変わる） */
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadRanking().then((r) => {
        if (alive) setRanking(r);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const me = ranking?.me;
  const summary = !me
    ? t.chat.rankingDesc
    : me.rank
      ? fill(t.chat.meLine, { n: String(me.accepted), rank: String(me.rank) })
      : fill(t.chat.meNoRank, { n: String(me.accepted) });

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <PageWidth>
        <View style={styles.head}>
          <Text style={styles.heading}>{t.chat.title}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Pressable
            onPress={() => router.push('/ranking')}
            style={({ hovered, pressed }) => [styles.channel, hovered && styles.channelHover, pressed && styles.channelPressed]}
            accessibilityRole="button"
            accessibilityLabel={t.chat.rankingName}
          >
            <View style={styles.channelIcon}>
              <Ionicons name="trophy" size={22} color={c.accentText} />
            </View>
            <View style={styles.channelBody}>
              <View style={styles.channelTitleRow}>
                <Text style={styles.channelName}>{t.chat.rankingName}</Text>
                <Text style={styles.readOnly}>{t.chat.readOnly}</Text>
              </View>
              <Text style={styles.channelLine}>{summary}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
          </Pressable>
        </ScrollView>
      </PageWidth>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    head: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.sm },
    heading: { fontSize: TEXT.heading, fontWeight: '800', color: c.accentInk },
    body: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xl, gap: SPACE.sm },

    channel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.md,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    channelHover: { borderColor: c.accent },
    channelPressed: { opacity: 0.85 },
    channelIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    channelBody: { flex: 1, gap: 3 },
    channelTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.sm },
    channelName: { fontSize: TEXT.bodyStrong, fontWeight: '800', color: c.text },
    readOnly: {
      fontSize: TEXT.micro,
      color: c.textMuted,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    channelLine: { fontSize: TEXT.sub, color: c.textMuted },
  });
}
