import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { PageWidth } from '@/components/page-width';
import { useLocale, useT } from '@/lib/i18n/context';
import { fill, formatDate } from '@/lib/i18n/dictionaries';
import { loadMySubmissions, type MySubmission } from '@/lib/ranking';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 送った情報（2026-10-05）。
 *
 * 送ったあと、審査されたかどうかを確かめる場所が無かった（ご指摘
 * 2026-10-05「アプリの中で状況を見られない」）。新しい順に並べ、
 * 審査待ち・採用・不採用を出す。
 *
 * 職員の覚え書きと、審査した人は出さない（データベースでも読めない）。
 */
export default function MySubmissionsScreen() {
  const c = useTheme();
  const t = useT();
  const { locale } = useLocale();
  const styles = makeStyles(c);
  const router = useRouter();
  const [list, setList] = useState<MySubmission[] | null | 'failed'>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadMySubmissions().then((r) => {
        if (alive) setList(r ?? 'failed');
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const tone = (s: MySubmission['status']) =>
    s === 'accepted' ? styles.badgeOk : s === 'rejected' ? styles.badgeNo : styles.badgeWait;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <PageWidth>
        <View style={styles.head}>
          <IconButton icon="chevron-back" label={t.common.back} onPress={() => router.back()} />
          <Text style={styles.heading}>{t.mySubmissions.title}</Text>
        </View>

        {list === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={c.accent} />
          </View>
        ) : list === 'failed' ? (
          <View style={styles.center}>
            <Text style={styles.muted}>{t.mySubmissions.loadFailed}</Text>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.muted}>{t.mySubmissions.empty}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {list.map((s) => {
              const name =
                (locale === 'en' ? s.facilityNameEn || s.facilityName : s.facilityName) ??
                t.mySubmissions.facilityGone;
              return (
                <View key={s.id} style={styles.card} testID="my-submission">
                  <View style={styles.cardHead}>
                    <Text style={[styles.badge, tone(s.status)]}>{t.mySubmissions.status[s.status]}</Text>
                    <Text style={styles.kind}>{t.submit.kinds[s.kind]}</Text>
                  </View>
                  <Text style={styles.facility} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.text} numberOfLines={3}>
                    {s.body}
                  </Text>
                  <Text style={styles.when}>
                    {fill(t.mySubmissions.sentAt, { date: formatDate(t, new Date(s.createdAt)) })}
                    {s.reviewedAt
                      ? `　${fill(t.mySubmissions.reviewedAt, { date: formatDate(t, new Date(s.reviewedAt)) })}`
                      : ''}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        )}
      </PageWidth>
    </SafeAreaView>
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
    center: { padding: SPACE.xl, alignItems: 'center' },
    muted: { fontSize: TEXT.sub, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
    body: {
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
      paddingHorizontal: SPACE.lg,
      paddingBottom: SPACE.xl,
      gap: SPACE.sm,
    },
    card: {
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      gap: 4,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
    badge: {
      fontSize: TEXT.small,
      fontWeight: '700',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      overflow: 'hidden',
    },
    badgeWait: { backgroundColor: c.bgSub, color: c.textMuted },
    badgeOk: { backgroundColor: c.accent, color: c.accentText },
    badgeNo: { backgroundColor: c.border, color: c.text },
    kind: { fontSize: TEXT.small, color: c.textMuted },
    facility: { fontSize: TEXT.bodyStrong, fontWeight: '700', color: c.text },
    text: { fontSize: TEXT.body, color: c.text, lineHeight: 20 },
    when: { fontSize: TEXT.small, color: c.textMuted },
  });
}
