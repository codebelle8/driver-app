import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { PageWidth } from '@/components/page-width';
import { PlanPrompt } from '@/components/plan-prompt';
import { daysLeft, isExpired } from '@/lib/account';
import { useAccount } from '@/lib/account-context';
import { useT } from '@/lib/i18n/context';
import { fill, formatDate } from '@/lib/i18n/dictionaries';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * お支払い。
 *
 * **設定の1行から開く**
 *   ご指示による。以前は設定の中に料金の札をそのまま置いていたが、
 *   料金を見に来ていない方の目にも入っていた。押した方にだけ開く。
 *
 * **まず、いまどうなっているかを出す**
 *   「あと何日で、いつまでで、いくら払うことになるのか」。
 *   料金表だけを並べても、自分がいまどの状態なのかが分からない。
 *
 * **請求は起きないと、この画面にも書く**
 *   お支払いの受け口がまだ無い。「申し込む」とだけ置くと、支払った
 *   つもりの方が出る。控えるのはご希望であることを、二か所に書く。
 *
 * **止めない**
 *   無料期間が終わっても、いまのところ使えるままにしてある。
 *   受け口ができるまで使えなくするのは、ただ使えないだけになる。
 *   そのことも隠さずに書く。
 */
export default function PlanScreen() {
  const c = useTheme();
  const t = useT();
  const styles = makeStyles(c);
  const router = useRouter();
  const { account } = useAccount();

  const head = (
    <View style={styles.head}>
      <IconButton icon="chevron-back" label={t.common.back} onPress={() => router.back()} />
      <Text style={styles.heading}>{t.mypage.payment}</Text>
    </View>
  );

  if (!account) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <PageWidth>
          {head}
          <View style={styles.body}>
            <Text style={styles.lead}>{t.account.lead}</Text>
          </View>
        </PageWidth>
      </SafeAreaView>
    );
  }

  const end = new Date(account.trialEndsAt);
  const over = isExpired(account);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <PageWidth>
        {head}
        <ScrollView contentContainerStyle={styles.body}>
          {/* いまどうなっているか */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>{t.plan.statusTitle}</Text>
              <Text style={[styles.cardValue, over && styles.warn]}>
                {account.status === 'active'
                  ? t.account.statusPaid
                  : account.status === 'blocked'
                    ? t.account.statusBlocked
                    : over
                      ? t.plan.statusEndedShort
                      : t.plan.statusTrial}
              </Text>
              {account.status !== 'active' && (
                <Text style={styles.cardNote}>
                  {over
                    ? fill(t.account.trialEnded, { date: formatDate(t, end) })
                    : fill(t.account.trialLeft, {
                        n: daysLeft(account.trialEndsAt),
                        date: formatDate(t, end),
                      })}
                </Text>
              )}
            </View>

            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>{t.plan.chosenLabel}</Text>
              <Text style={styles.cardValue}>
                {account.plan
                  ? account.plan === 'monthly'
                    ? t.plan.monthly
                    : t.plan.yearly
                  : t.plan.notChosen}
              </Text>
              {!!account.planChosenAt && (
                <Text style={styles.cardNote}>
                  {fill(t.plan.chosenAt, { date: formatDate(t, new Date(account.planChosenAt)) })}
                </Text>
              )}
            </View>
          </View>

          {/* 期間が終わったあとどうなるか。伏せずに書く。 */}
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={c.accent} />
            <Text style={styles.noticeText}>{t.plan.afterTrial}</Text>
          </View>

          {/* 料金の選択。ここは部品に任せる（探す画面の帯と同じ中身）。 */}
          <PlanPrompt variant="page" style={styles.choice} />

          <Text style={styles.contact}>{t.plan.contact}</Text>
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
    /*
      読む列は広げない。料金は数が少なく、横に伸ばしても読みやすくならない。
    */
    body: {
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      paddingHorizontal: SPACE.lg,
      paddingBottom: SPACE.xl,
      gap: SPACE.md,
    },
    lead: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 20 },

    card: {
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    cardRow: {
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      gap: 2,
    },
    cardLabel: { fontSize: TEXT.small, color: c.textMuted },
    cardValue: { fontSize: TEXT.title, fontWeight: '800', color: c.text },
    cardNote: { fontSize: TEXT.sub, color: c.textMuted },
    warn: { color: c.warn },

    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.sm,
      backgroundColor: c.accentSoft,
    },
    noticeText: { flex: 1, fontSize: TEXT.sub, color: c.text, lineHeight: 20 },

    choice: { marginTop: SPACE.xs },
    contact: { fontSize: TEXT.small, color: c.textFaint, lineHeight: 18 },
  });
}
