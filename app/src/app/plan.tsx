import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { PageWidth } from '@/components/page-width';
import { PlanPrompt } from '@/components/plan-prompt';
import { daysLeft, isExpired } from '@/lib/account';
import { useAccount } from '@/lib/account-context';
import { useT } from '@/lib/i18n/context';
import { fill, formatDate } from '@/lib/i18n/dictionaries';
import { isReady, loadTransfer, memberCode, type Transfer } from '@/lib/payment';
import { planOf, yen } from '@/lib/plans';
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
 *
 * **お支払いは銀行振込**
 *   ご指示により、日本のどの銀行からでもお支払いいただけるようにした。
 *   そのために要るのは銀行の一覧ではなく、受け取る口座ひとつ。
 *   振り込む側がどの銀行を使うかは、こちらが知る必要のないこと。
 *
 *   受取口座が入るまでは「準備中」と出す。空欄のまま振込先らしき枠を
 *   出すと、宛先の無い振込を招く。
 */
export default function PlanScreen() {
  const c = useTheme();
  const t = useT();
  const styles = makeStyles(c);
  const router = useRouter();
  const { account } = useAccount();

  /* 受取口座。発注元から伺って入れるまでは空。 */
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  useEffect(() => {
    let alive = true;
    loadTransfer().then((t) => {
      if (alive) setTransfer(t);
    });
    return () => {
      alive = false;
    };
  }, []);

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

          {/*
            お振込先。ご希望の料金をお選びいただいてから出す。
            選ぶ前に出しても、いくら振り込めばよいのかが決まらない。
          */}
          {!!account.plan &&
            (isReady(transfer) ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t.plan.transferTitle}</Text>
                <Text style={styles.sectionLead}>{t.plan.transferLead}</Text>

                <View style={styles.card}>
                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{t.plan.transferAmount}</Text>
                    <Text style={styles.cardValue}>
                      {account.plan === 'monthly'
                        ? fill(t.plan.priceMonth, { yen: yen(planOf('monthly').yen) })
                        : fill(t.plan.priceYear, { yen: yen(planOf('yearly').yen) })}
                    </Text>
                  </View>

                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{t.plan.transferBank}</Text>
                    <Text style={styles.cardValue}>
                      {[transfer.bankName, transfer.branchName].filter(Boolean).join(' ')}
                    </Text>
                  </View>

                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{t.plan.transferAccount}</Text>
                    <Text style={styles.cardValue}>
                      {[
                        transfer.accountType === 'touza' ? t.plan.touza : t.plan.futsu,
                        transfer.accountNumber,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    </Text>
                  </View>

                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{t.plan.transferHolder}</Text>
                    <Text style={styles.cardValue}>
                      {transfer.accountHolderKana ?? transfer.accountHolder}
                    </Text>
                    {!!transfer.accountHolderKana && !!transfer.accountHolder && (
                      <Text style={styles.cardNote}>{transfer.accountHolder}</Text>
                    )}
                  </View>

                  {/*
                    振込は名義しか届かない。同姓同名や法人名での振込が
                    あると突き合わせられないため、番号を添えていただく。
                  */}
                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{t.plan.transferName}</Text>
                    <Text style={styles.code}>{memberCode(account.memberNo)}</Text>
                    <Text style={styles.cardNote}>{t.plan.transferNameHow}</Text>
                    <Text style={styles.cardNote}>
                      {fill(t.plan.transferNameExample, {
                        code: memberCode(account.memberNo),
                      })}
                    </Text>
                  </View>
                </View>

                <Text style={styles.sectionLead}>{t.plan.transferAfter}</Text>
                {!!transfer.note && <Text style={styles.sectionLead}>{transfer.note}</Text>}
              </View>
            ) : (
              <View style={styles.notice}>
                <Ionicons name="time-outline" size={18} color={c.accent} />
                <View style={styles.noticeBody}>
                  <Text style={styles.noticeTitle}>{t.plan.transferNotReady}</Text>
                  <Text style={styles.noticeText}>{t.plan.transferNotReadyBody}</Text>
                </View>
              </View>
            ))}

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
    noticeText: { fontSize: TEXT.sub, color: c.text, lineHeight: 20 },
    noticeBody: { flex: 1, gap: 2 },
    noticeTitle: { fontSize: TEXT.bodyStrong, fontWeight: '800', color: c.text },

    section: { gap: SPACE.sm },
    sectionTitle: { fontSize: TEXT.title, fontWeight: '800', color: c.text },
    sectionLead: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 20 },
    /*
      会員番号。振込の欄へ打ち写していただくものなので、大きく、
      等幅で出す。1 と l、0 と O を見分けられるようにする。
    */
    code: {
      fontSize: TEXT.heading,
      fontWeight: '800',
      color: c.accentInk,
      fontVariant: ['tabular-nums'],
      letterSpacing: 2,
    },

    choice: { marginTop: SPACE.xs },
    contact: { fontSize: TEXT.small, color: c.textFaint, lineHeight: 18 },
  });
}
