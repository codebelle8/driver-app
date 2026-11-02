import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { PageWidth } from '@/components/page-width';
import { useAccount } from '@/lib/account-context';
import {
  FEEDBACK_KINDS,
  fetchMyFeedback,
  MAX_BODY,
  sendFeedback,
  type FeedbackKind,
  type FeedbackRow,
} from '@/lib/feedback';
import { useT } from '@/lib/i18n/context';
import { fill, formatDate } from '@/lib/i18n/dictionaries';
import { useLayout } from '@/lib/layout';
import { notify } from '@/lib/notice';
import { HIT, RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * ご意見箱（2026-11-02）。
 *
 * 「探す」画面の右下の絵（ご意見箱を持った案内役）から開く。アプリに足して
 * ほしい機能や、使いにくいところを、文字だけで送る。管理画面の「ご意見」で
 * 運営が読み、状態（受け付けました・検討中・対応しました・見送り）を切り替える。
 *
 * **先に種類を選んでいただく**（情報を送る画面と同じ）。読む前に何の話か分かる。
 *
 * **送ったものと、その状態を同じ画面の下に出す。** ひとつひとつにお返事は
 * しないため、届いたかどうか・どうなったかが分かる場所を用意する。
 */
export default function FeedbackScreen() {
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const f = t.feedback;
  const styles = makeStyles(c);
  const { account } = useAccount();
  /* 冒頭の絵。スマホは幅の 21%（72〜92）、PC は 104 */
  const { width: winWidth, isWide } = useLayout();
  const artWidth = isWide ? 104 : Math.round(Math.min(92, Math.max(72, winWidth * 0.21)));

  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<FeedbackRow[]>([]);

  const userId = account?.userId ?? null;
  const reload = useCallback(() => {
    if (!userId) return;
    fetchMyFeedback(userId).then(setMine);
  }, [userId]);
  useFocusEffect(reload);

  const trimmed = body.trim();
  const ready = !!userId && !!kind && trimmed.length > 0 && !sending;

  async function onSend() {
    if (!userId || !kind || !trimmed) return;
    setSending(true);
    setError(null);
    const r = await sendFeedback(userId, kind, trimmed);
    setSending(false);
    if (r.ok) {
      notify(f.sent, f.sentBody);
      setKind(null);
      setBody('');
      reload();
    } else {
      setError(f.error[r.problem]);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <PageWidth>
        <View style={styles.head}>
          <IconButton icon="chevron-back" label={t.common.back} onPress={() => router.back()} />
          <Text style={styles.heading}>{f.title}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}>
            <Image
              source={require('@/assets/art/feedback-box.webp')}
              style={{ width: artWidth, height: Math.round((artWidth * 440) / 330) }}
              contentFit="contain"
              accessibilityIgnoresInvertColors
            />
            <View style={styles.introText}>
              <Text style={styles.lead}>{f.lead}</Text>
              <Text style={styles.note}>{f.replyNote}</Text>
            </View>
          </View>

          {/* 種類 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{f.kindTitle}</Text>
            <View style={styles.choices} accessibilityRole="radiogroup">
              {FEEDBACK_KINDS.map((k) => {
                const on = kind === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => {
                      setKind(k);
                      if (error) setError(null);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    accessibilityLabel={f.kinds[k]}
                    style={[styles.choice, on && styles.choiceOn]}
                  >
                    <Ionicons
                      name={on ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={on ? c.accent : c.textFaint}
                    />
                    <Text style={styles.choiceText}>{f.kinds[k]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 内容 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{f.bodyTitle}</Text>
            <TextInput
              value={body}
              onChangeText={(v) => {
                setBody(v.slice(0, MAX_BODY));
                if (error) setError(null);
              }}
              placeholder={f.bodyPlaceholder}
              placeholderTextColor={c.textFaint}
              multiline
              maxLength={MAX_BODY}
              style={styles.input}
              accessibilityLabel={f.bodyTitle}
            />
            <Text style={styles.count}>
              {fill(f.bodyCount, { n: String(body.length), max: String(MAX_BODY) })}
            </Text>
          </View>

          {!userId && <Text style={styles.note}>{f.needLogin}</Text>}
          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={onSend}
            disabled={!ready}
            style={({ pressed }) => [styles.send, pressed && styles.sendPressed, !ready && styles.sendOff]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
          >
            <Text style={styles.sendText}>{sending ? f.sending : f.send}</Text>
          </Pressable>

          {/* 送ったご意見と、その状態 */}
          {!!userId && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{f.mineTitle}</Text>
              {mine.length === 0 ? (
                <Text style={styles.note}>{f.mineEmpty}</Text>
              ) : (
                mine.map((m) => (
                  <View key={m.id} style={styles.card} testID="my-feedback">
                    <View style={styles.cardHead}>
                      <Text
                        style={[
                          styles.badge,
                          m.status === 'done'
                            ? styles.badgeOk
                            : m.status === 'considering'
                              ? styles.badgeMid
                              : m.status === 'declined'
                                ? styles.badgeNo
                                : styles.badgeWait,
                        ]}
                      >
                        {f.status[m.status]}
                      </Text>
                      <Text style={styles.kind}>{f.kinds[m.kind]}</Text>
                    </View>
                    <Text style={styles.text} numberOfLines={4}>
                      {m.body}
                    </Text>
                    <Text style={styles.when}>{fill(f.sentAt, { date: formatDate(t, new Date(m.created_at)) })}</Text>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
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
    body: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      paddingHorizontal: SPACE.lg,
      paddingBottom: SPACE.xl,
      gap: SPACE.lg,
    },
    intro: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
    introText: { flex: 1, gap: SPACE.xs },
    lead: { fontSize: TEXT.body, color: c.text, lineHeight: 21 },
    section: { gap: SPACE.sm },
    sectionTitle: { fontSize: TEXT.bodyStrong, fontWeight: '800', color: c.text },
    note: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 19 },
    choices: { gap: SPACE.xs },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      minHeight: HIT.min,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
      borderRadius: RADIUS.sm,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    choiceOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
    choiceText: { flex: 1, fontSize: TEXT.body, color: c.text },
    input: {
      minHeight: 140,
      padding: SPACE.md,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      color: c.text,
      fontSize: TEXT.bodyStrong,
      lineHeight: 22,
      textAlignVertical: 'top',
    },
    count: { alignSelf: 'flex-end', fontSize: TEXT.small, color: c.textMuted },
    error: { fontSize: TEXT.sub, color: c.danger, lineHeight: 20 },
    send: {
      minHeight: HIT.primary,
      borderRadius: RADIUS.md,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACE.lg,
    },
    sendPressed: { opacity: 0.85 },
    sendOff: { opacity: 0.5 },
    sendText: { fontSize: TEXT.bodyStrong, fontWeight: '700', color: c.accentText },
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
    badgeMid: { backgroundColor: c.accentSoft, color: c.accentInk },
    badgeOk: { backgroundColor: c.accent, color: c.accentText },
    badgeNo: { backgroundColor: c.border, color: c.text },
    kind: { fontSize: TEXT.small, color: c.textMuted },
    text: { fontSize: TEXT.body, color: c.text, lineHeight: 20 },
    when: { fontSize: TEXT.small, color: c.textMuted },
  });
}
