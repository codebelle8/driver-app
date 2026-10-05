import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { PageWidth } from '@/components/page-width';
import { useT } from '@/lib/i18n/context';
import { fill, type Dictionary } from '@/lib/i18n/dictionaries';
import { loadRanking, monthOf, type Ranking } from '@/lib/ranking';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 「情報提供ランキング」チャンネル（2026-10-05）。
 *
 * チャットの形で、運営（車寄せナビ）からの書き込みとして並べる。
 * 会員は読むだけ。上から:
 *
 *   1. 今月のあなた（採用・送った件数・順位）と「送った情報を見る」 … 上に留める
 *   2. 今月の順位（集計中）
 *   3. 先月・先々月の結果
 *
 * **送った件数は本人にだけ出す**（ご回答 2026-10-05）。順位は採用件数。
 * 名前は表示名。匿名を選んだ方は「匿名の会員」と出す。
 */

/** さかのぼって出す月の数（今月を含む） */
const MONTHS = 3;

export default function RankingScreen() {
  const c = useTheme();
  const t = useT();
  const styles = makeStyles(c);
  const router = useRouter();
  const [months, setMonths] = useState<(Ranking | null)[] | null>(null);

  /* 開くたびに引き直す（審査されると件数が変わる）。読めなければ押して引き直す */
  const load = useCallback(() => {
    let alive = true;
    setMonths(null);
    Promise.all(Array.from({ length: MONTHS }, (_, i) => loadRanking(monthOf(i)))).then((list) => {
      if (alive) setMonths(list);
    });
    return () => {
      alive = false;
    };
  }, []);
  useFocusEffect(load);

  const now = months?.[0] ?? null;
  const failed = months !== null && now === null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <PageWidth>
        <View style={styles.head}>
          <IconButton icon="chevron-back" label={t.common.back} onPress={() => router.back()} />
          <Text style={styles.heading}>{t.ranking.title}</Text>
        </View>

        {months === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={c.accent} />
            <Text style={styles.muted}>{t.ranking.loading}</Text>
          </View>
        ) : failed ? (
          <View style={styles.center}>
            <Text style={styles.muted}>{t.ranking.loadFailed}</Text>
            <Pressable onPress={() => load()} style={styles.retry} accessibilityRole="button">
              <Text style={styles.retryText}>{t.ranking.retry}</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {/* 1. 今月のあなた（上に留める） */}
            {now && (
              <View style={styles.pinned} testID="ranking-me">
                <Text style={styles.pinnedTitle}>{t.ranking.youTitle}</Text>
                <View style={styles.stats}>
                  <Stat label={t.ranking.accepted} value={fill(t.ranking.countValue, { n: String(now.me.accepted) })} styles={styles} />
                  <Stat label={t.ranking.sent} value={fill(t.ranking.countValue, { n: String(now.me.sent) })} styles={styles} />
                  <Stat
                    label={t.ranking.rank}
                    value={now.me.rank ? fill(t.ranking.rankValue, { rank: String(now.me.rank) }) : '—'}
                    note={now.me.rank ? fill(t.ranking.ofPeople, { n: String(now.participants) }) : undefined}
                    styles={styles}
                  />
                </View>
                {now.me.excluded ? (
                  <Text style={styles.pinnedNote}>{t.ranking.excluded[now.me.excluded]}</Text>
                ) : (
                  !now.me.rank && <Text style={styles.pinnedNote}>{t.ranking.noRank}</Text>
                )}
                <Pressable
                  onPress={() => router.push('/my-submissions')}
                  style={({ hovered }) => [styles.mine, hovered && styles.mineHover]}
                  accessibilityRole="button"
                >
                  <Ionicons name="document-text-outline" size={16} color={c.accent} />
                  <Text style={styles.mineText}>{t.ranking.mySubmissions}</Text>
                </Pressable>
              </View>
            )}

            {/* 2・3. 運営からの書き込み（今月 → 過去） */}
            {months.map((m, i) =>
              m ? <MonthPost key={m.month} ranking={m} current={i === 0} t={t} styles={styles} c={c} /> : null,
            )}

            <Post t={t} styles={styles} c={c}>
              <Text style={styles.postText}>{t.ranking.how}</Text>
              <Text style={styles.postText}>{t.ranking.future}</Text>
              <Text style={styles.postNote}>{t.ranking.nameSetting}</Text>
            </Post>
          </ScrollView>
        )}
      </PageWidth>
    </SafeAreaView>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function Stat({ label, value, note, styles }: { label: string; value: string; note?: string; styles: Styles }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {!!note && <Text style={styles.statNote}>{note}</Text>}
    </View>
  );
}

/** 運営（車寄せナビ）からの書き込み1つ */
function Post({
  children,
  t,
  styles,
  c,
}: {
  children: React.ReactNode;
  t: Dictionary;
  styles: Styles;
  c: Palette;
}) {
  return (
    <View style={styles.post}>
      <View style={styles.avatar}>
        <Ionicons name="trophy" size={16} color={c.accentText} />
      </View>
      <View style={styles.postBody}>
        <Text style={styles.sender}>{t.ranking.sender}</Text>
        <View style={styles.bubble}>{children}</View>
      </View>
    </View>
  );
}

function MonthPost({
  ranking,
  current,
  t,
  styles,
  c,
}: {
  ranking: Ranking;
  current: boolean;
  t: Dictionary;
  styles: Styles;
  c: Palette;
}) {
  const [y, m] = ranking.month.split('-');
  const title = fill(current ? t.ranking.monthNow : t.ranking.monthDone, { y, m: String(Number(m)) });
  /* 過去の月で、採用が1件も無かった月は出さない（空の書き込みが続くだけになる） */
  if (!current && ranking.top.length === 0) return null;

  return (
    <Post t={t} styles={styles} c={c}>
      <Text style={styles.postTitle}>{title}</Text>
      {ranking.top.length === 0 ? (
        <Text style={styles.postText}>{t.ranking.empty}</Text>
      ) : (
        <View style={styles.table} accessibilityRole="list">
          {ranking.top.map((r) => (
            <View key={r.rank} style={[styles.row, r.me && styles.rowMe]} accessibilityRole="text">
              <Text style={[styles.rank, r.rank <= 3 && styles.rankTop]}>{r.rank}</Text>
              <Text style={[styles.name, !r.name && styles.nameAnon]} numberOfLines={1}>
                {r.name ?? t.ranking.anonymous}
                {r.me ? `（${t.ranking.you}）` : ''}
              </Text>
              <Text style={styles.count}>{fill(t.ranking.countValue, { n: String(r.accepted) })}</Text>
            </View>
          ))}
        </View>
      )}
    </Post>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
    },
    heading: { fontSize: TEXT.titleLarge, fontWeight: '800', color: c.text },
    center: { padding: SPACE.xl, alignItems: 'center', gap: SPACE.md },
    muted: { fontSize: TEXT.sub, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
    retry: {
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.sm,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: c.accent,
    },
    retryText: { fontSize: TEXT.body, fontWeight: '700', color: c.accentInk },
    body: {
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
      paddingHorizontal: SPACE.lg,
      paddingBottom: SPACE.xl,
      gap: SPACE.lg,
    },

    /* 今月のあなた */
    pinned: {
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      backgroundColor: c.accentSoft,
      borderWidth: 1,
      borderColor: c.accent,
      gap: SPACE.sm,
    },
    pinnedTitle: { fontSize: TEXT.bodyStrong, fontWeight: '800', color: c.text },
    pinnedNote: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 19 },
    stats: { flexDirection: 'row', gap: SPACE.sm },
    stat: {
      flex: 1,
      padding: SPACE.sm,
      borderRadius: RADIUS.sm,
      backgroundColor: c.surface,
      alignItems: 'center',
      gap: 2,
    },
    statLabel: { fontSize: TEXT.small, color: c.textMuted },
    statValue: { fontSize: TEXT.titleLarge, fontWeight: '800', color: c.text, fontVariant: ['tabular-nums'] },
    statNote: { fontSize: TEXT.micro, color: c.textMuted },
    mine: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: SPACE.sm,
      marginLeft: -SPACE.sm,
      borderRadius: RADIUS.sm,
    },
    mineHover: { backgroundColor: c.surface },
    mineText: { fontSize: TEXT.sub, fontWeight: '700', color: c.accentInk },

    /* 運営からの書き込み */
    post: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    postBody: { flex: 1, gap: 4 },
    sender: { fontSize: TEXT.small, fontWeight: '700', color: c.textMuted },
    bubble: {
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      borderTopLeftRadius: 4,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      gap: SPACE.sm,
    },
    postTitle: { fontSize: TEXT.bodyStrong, fontWeight: '800', color: c.text },
    postText: { fontSize: TEXT.body, color: c.text, lineHeight: 21 },
    postNote: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 19 },

    table: { gap: 2 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      paddingVertical: 6,
      paddingHorizontal: SPACE.sm,
      borderRadius: RADIUS.sm,
    },
    rowMe: { backgroundColor: c.accentSoft },
    rank: { width: 28, fontSize: TEXT.body, fontWeight: '700', color: c.textMuted, textAlign: 'right', fontVariant: ['tabular-nums'] },
    rankTop: { color: c.accentInk, fontWeight: '800' },
    name: { flex: 1, fontSize: TEXT.body, color: c.text },
    nameAnon: { color: c.textMuted },
    count: { fontSize: TEXT.body, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  });
}
