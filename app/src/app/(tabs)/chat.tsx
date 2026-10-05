import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageWidth } from '@/components/page-width';
import { loadFeed, type ChatMessage } from '@/lib/chat';
import { unreadLabel, useChatUnread } from '@/lib/chat-unread';
import { useT } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/dictionaries';
import { loadRanking, type Ranking } from '@/lib/ranking';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * チャット（2026-10-05）。チャンネルの一覧。
 *
 *   情報提供ランキング … 読むだけ（運営からの書き込み）
 *   情報交換           … 会員どうしで書き込める（第2段）
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
  /* 情報交換の未読（2026-10-05） */
  const { unread } = useChatUnread();
  /* 情報交換の最新の書き込み（一覧に1行だけ出す） */
  const [last, setLast] = useState<ChatMessage | null | undefined>(undefined);

  /* 開くたびに引き直す（審査されると件数が変わる） */
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadRanking().then((r) => {
        if (alive) setRanking(r);
      });
      loadFeed('general', undefined, 1).then((f) => {
        if (alive) setLast(f ? (f.messages[0] ?? null) : undefined);
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

          <Pressable
            onPress={() => router.push('/chat-room')}
            style={({ hovered, pressed }) => [styles.channel, hovered && styles.channelHover, pressed && styles.channelPressed]}
            accessibilityRole="button"
            accessibilityLabel={t.chat.generalName}
          >
            <View style={styles.channelIcon}>
              <Ionicons name="chatbubbles" size={22} color={c.accentText} />
            </View>
            <View style={styles.channelBody}>
              <View style={styles.channelTitleRow}>
                <Text style={styles.channelName}>{t.chat.generalName}</Text>
                {unread > 0 && (
                  <Text style={styles.unread} testID="chat-unread-general">
                    {fill(t.chat.unread, { n: unreadLabel(unread) })}
                  </Text>
                )}
              </View>
              <Text style={[styles.channelLine, unread > 0 && styles.channelLineNew]} numberOfLines={1}>
                {last === undefined
                  ? t.chat.generalDesc
                  : last === null
                    ? t.chat.noMessages
                    : `${last.mine ? t.ranking.you : (last.name ?? t.chatRoom.noName)}：${last.body}`}
              </Text>
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
    /*
      記号の地は主役の緑（accent）。accentInk は「文字の色」で、暗い配色では
      白になる。地に使うと白い記号が白い丸に溶けて見えなくなる
      （ご指摘 2026-10-05）。チャンネルの見分けは記号（トロフィー・吹き出し）で付ける。
    */
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
    channelLineNew: { color: c.text, fontWeight: '700' },
    unread: {
      fontSize: TEXT.small,
      fontWeight: '700',
      color: c.accentText,
      backgroundColor: c.accent,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 1,
      overflow: 'hidden',
    },
  });
}
