import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { PageWidth } from '@/components/page-width';
import { useAccount } from '@/lib/account-context';
import { connected, holdOf, isPayMethod, jstDate, planCheckout, type Checkout, type Hold } from '@/lib/checkout';
import { useT } from '@/lib/i18n/context';
import { fill, type Dictionary } from '@/lib/i18n/dictionaries';
import { usePaidOpen } from '@/lib/paid-open';
import { yen, type PlanId } from '@/lib/plans';
import { loadSite, type Site } from '@/lib/site';
import { HIT, RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 申込みの最後の画面（特定商取引法 第12条の6）。
 *
 * **お支払いの画面で料金と支払方法を選んでから開く。** 中身は
 * `/checkout?plan=monthly&method=card` の2つで決まる。
 *
 * **法律が求める項目を、この画面の中に並べる**
 *   分量（料金プランとご利用の期間・自動更新）、金額、支払の時期と方法、
 *   ご利用の開始、解約と返金。規約へのリンクだけで済ませない。
 *   日付の計算は lib/checkout.ts（データベースと同じ決め方）。
 *
 * **いまは申し込めない**
 *   試験提供の期間中は、見本として出し、釦は押せない（請求しない期間のため）。
 *   有料での提供を始めても、カード・PayPay は Stripe とつなぐまで、銀行振込は
 *   申込みを見分ける欄を足すまで、釦は押せない（lib/checkout.ts の connected）。
 *   つなぐのは、受け口（サーバー）の段。
 *
 * **カード・PayPay は、この画面の次（Stripe の画面）で申込みが完了する**
 *   釦の文言は「申し込む」ではなく「〜へ進む」とし、次の画面で完了することを
 *   釦の下に書く。Stripe の画面の側にも、要点を添える（受け口の段）。
 */
export default function CheckoutScreen() {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);
  const router = useRouter();
  const { account } = useAccount();
  const params = useLocalSearchParams<{ plan?: string; method?: string }>();
  /* 開くたびに読み直す。試験提供を外した直後でも、古い答えで見本にしない */
  const paidOpen = usePaidOpen(true);

  /*
    日付の基準になる「いま」は、開いた時点で決めて動かさない。
    描き直すたびに取り直すと、日付の変わり目に、読んでいるあいだに
    中身が入れ替わることがある。
  */
  const [now] = useState(() => new Date());

  /* 規約類の掲載先。「詳しくは」の欄に使う */
  const [site, setSite] = useState<Site | null>(null);
  useEffect(() => {
    let alive = true;
    loadSite().then((v) => {
      if (alive) setSite(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const head = (
    <View style={s.head}>
      <IconButton icon="chevron-back" label={t.common.back} onPress={() => router.back()} />
      <Text style={s.heading}>{t.checkout.title}</Text>
    </View>
  );

  const frame = (body: ReactNode) => (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <PageWidth>
        {head}
        <ScrollView contentContainerStyle={s.body}>{body}</ScrollView>
      </PageWidth>
    </SafeAreaView>
  );

  if (!account) {
    return frame(<Text style={s.lead}>{t.account.lead}</Text>);
  }

  const method = isPayMethod(params.method) ? params.method : null;
  const co = method ? planCheckout(account, (params.plan ?? '') as PlanId, method, now) : null;
  if (!co) {
    return frame(
      <>
        <Notice icon="alert-circle-outline" text={t.checkout.badPlan} tone="warn" s={s} c={c} />
        <Pressable onPress={() => router.replace('/plan')} accessibilityRole="button" style={s.change}>
          <Text style={s.changeText}>{t.checkout.change}</Text>
        </Pressable>
      </>,
    );
  }

  const hold = holdOf(account, paidOpen);
  const ready = !hold && connected(co.method);

  return frame(
    <>
      {hold ? (
        <Notice
          icon={hold === 'trialOpen' ? 'eye-outline' : 'information-circle-outline'}
          text={holdText(t, hold)}
          tone={hold === 'blocked' ? 'warn' : 'soft'}
          s={s}
          c={c}
        />
      ) : (
        <Text style={s.lead}>{t.checkout.lead}</Text>
      )}

      <Section title={t.checkout.orderTitle} s={s}>
        <Row label={t.checkout.planLabel} s={s}>
          <Text style={s.value}>{t.plan.names[co.plan.id]}</Text>
        </Row>
        <Row label={t.checkout.methodLabel} s={s}>
          <Text style={s.value}>{t.checkout.methods[co.method]}</Text>
          <Text style={s.note}>{t.checkout.methodNotes[co.method]}</Text>
        </Row>
        <Row label={t.checkout.periodLabel} s={s}>
          <Text style={s.text}>{periodText(t, co)}</Text>
        </Row>
        <Row label={t.checkout.renewLabel} s={s} last>
          <Text style={co.renews ? s.value : s.text}>
            {co.renews ? t.checkout.renewYes : t.checkout.renewNo}
          </Text>
        </Row>
      </Section>

      <Section title={t.checkout.payTitle} s={s}>
        <Row label={t.checkout.amountLabel} s={s}>
          <Text style={s.amount}>
            {fill(co.renews ? t.checkout.amountRenew : t.checkout.amountOnce, {
              yen: yen(co.plan.yen),
              every: everyText(t, co),
            })}
          </Text>
        </Row>
        <Row label={t.checkout.timingLabel} s={s}>
          {timingText(t, co).map((line) => (
            <Text key={line} style={s.text}>
              {line}
            </Text>
          ))}
        </Row>
        <Row label={t.checkout.feesLabel} s={s} last>
          <Text style={s.text}>
            {co.method === 'transfer' ? t.checkout.feesTransfer : t.checkout.feesOther}
          </Text>
        </Row>
      </Section>

      <Section title={t.checkout.startTitle} s={s}>
        <Row s={s} last>
          <Text style={s.text}>{startText(t, co)}</Text>
        </Row>
      </Section>

      <Section title={t.checkout.cancelTitle} s={s}>
        <Row s={s} last>
          <Text style={s.text}>{co.renews ? t.checkout.cancelRenew : t.checkout.cancelOnce}</Text>
          <Text style={s.text}>
            {co.refund === 'yearly' ? t.checkout.refundYearly : t.checkout.refundNone}
          </Text>
        </Row>
      </Section>

      <View style={s.more}>
        <Text style={s.moreTitle}>{t.checkout.moreTitle}</Text>
        <Text style={s.note}>{t.checkout.moreLead}</Text>
        <View style={s.links}>
          {!!site?.termsUrl && <LinkText label={t.mypage.terms} url={site.termsUrl} s={s} c={c} />}
          {!!site?.lawUrl && <LinkText label={t.mypage.law} url={site.lawUrl} s={s} c={c} />}
          {!!site?.privacyUrl && <LinkText label={t.mypage.privacy} url={site.privacyUrl} s={s} c={c} />}
        </View>
      </View>

      <View style={s.actions}>
        {/*
          押した先（Stripe の画面を開く・銀行振込の申込みを控える）は、受け口の段でつなぐ。
          それまでは ready にならないので、押せない。
        */}
        <Pressable
          disabled={!ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          style={({ pressed }) => [s.submit, pressed && ready && s.submitOn, !ready && s.submitOff]}
        >
          <Text style={s.submitText}>{submitText(t, co)}</Text>
        </Pressable>
        {!hold && !connected(co.method) && <Text style={s.notReady}>{t.checkout.notConnected}</Text>}
        <Text style={s.note}>{nextText(t, co)}</Text>

        <Pressable onPress={() => router.back()} accessibilityRole="button" style={s.change}>
          <Text style={s.changeText}>{t.checkout.change}</Text>
        </Pressable>
      </View>
    </>,
  );
}

// --- 文言を組み立てる ---------------------------------------------------------

/** 年まで書く日付（日本時間）。 */
function dateText(t: Dictionary, d: Date): string {
  const p = jstDate(d);
  return fill(t.when.dateYear, { y: p.y, m: p.m, d: p.d, mon: t.when.months[p.m - 1] });
}

function everyText(t: Dictionary, co: Checkout): string {
  return co.plan.months >= 12 ? t.checkout.every.yearly : t.checkout.every.monthly;
}

function holdText(t: Dictionary, hold: Hold): string {
  switch (hold) {
    case 'trialOpen':
      return t.checkout.sample;
    case 'blocked':
      return t.checkout.holdBlocked;
    case 'free':
      return t.checkout.holdFree;
    case 'unlimited':
      return t.checkout.holdUnlimited;
  }
}

function periodText(t: Dictionary, co: Checkout): string {
  const v = { start: dateText(t, co.start), end: dateText(t, co.firstEnd), every: everyText(t, co) };
  if (co.renews) return fill(t.checkout.periodRenew, v);
  if (co.method === 'transfer') {
    return fill(co.waitFor ? t.checkout.periodTransferLater : t.checkout.periodTransferNow, v);
  }
  return fill(t.checkout.periodFixed, v);
}

/** お支払いの時期。カードは「最初」と「以後」の2行。 */
function timingText(t: Dictionary, co: Checkout): string[] {
  if (co.method === 'paypay') return [t.checkout.timingPaypay];
  if (co.method === 'transfer') return [t.checkout.timingTransfer];

  const price = yen(co.plan.yen);
  const first =
    co.waitFor === 'free'
      ? fill(t.checkout.timingCardLaterFree, { date: dateText(t, co.start), yen: price })
      : co.waitFor === 'paid'
        ? fill(t.checkout.timingCardLaterPaid, { date: dateText(t, co.start), yen: price })
        : fill(t.checkout.timingCardNow, { yen: price });
  /* 更新の日は、有料の期間が始まる日（日本時間）に揃う */
  const p = jstDate(co.start);
  const when =
    co.plan.months >= 12
      ? fill(t.checkout.renewYearly, { m: p.m, d: p.d, mon: t.when.months[p.m - 1] })
      : fill(t.checkout.renewMonthly, { d: p.d });
  return [first, fill(t.checkout.timingCardThen, { when })];
}

function startText(t: Dictionary, co: Checkout): string {
  const date = dateText(t, co.start);
  if (co.waitFor === 'free') return fill(t.checkout.startLaterFree, { date });
  if (co.waitFor === 'paid') return fill(t.checkout.startLaterPaid, { date });
  return co.method === 'transfer' ? t.checkout.startNowTransfer : t.checkout.startNowOnline;
}

function submitText(t: Dictionary, co: Checkout): string {
  if (co.method === 'card') return t.checkout.submitCard;
  if (co.method === 'paypay') return t.checkout.submitPaypay;
  return t.checkout.submitTransfer;
}

function nextText(t: Dictionary, co: Checkout): string {
  if (co.method === 'card') return t.checkout.nextCard;
  if (co.method === 'paypay') return t.checkout.nextPaypay;
  return t.checkout.nextTransfer;
}

// --- 部品 ---------------------------------------------------------------------

type Styles = ReturnType<typeof makeStyles>;

function Section({ title, s, children }: { title: string; s: Styles; children: ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={s.card}>{children}</View>
    </View>
  );
}

function Row({ label, s, last, children }: { label?: string; s: Styles; last?: boolean; children: ReactNode }) {
  return (
    <View style={[s.row, last && s.rowLast]}>
      {!!label && <Text style={s.label}>{label}</Text>}
      {children}
    </View>
  );
}

function Notice({
  icon,
  text,
  tone,
  s,
  c,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  tone: 'soft' | 'warn';
  s: Styles;
  c: Palette;
}) {
  return (
    <View style={[s.notice, tone === 'warn' && s.noticeWarn]}>
      <Ionicons name={icon} size={18} color={tone === 'warn' ? c.warn : c.accent} />
      <Text style={s.noticeText}>{text}</Text>
    </View>
  );
}

/**
 * 規約類へのリンク。web では本物の <a> にする（マイページの AboutRow と同じ考え方）。
 * 長押しで新しいタブに開けて、宛先も確かめられる。
 */
function LinkText({ label, url, s, c }: { label: string; url: string; s: Styles; c: Palette }) {
  const asAnchor =
    Platform.OS === 'web' ? ({ href: url, hrefAttrs: { target: '_blank', rel: 'noreferrer' } } as object) : null;
  return (
    <Pressable
      {...asAnchor}
      onPress={Platform.OS === 'web' ? undefined : () => void Linking.openURL(url)}
      accessibilityRole="link"
      style={s.link}
    >
      <Text style={s.linkText}>{label}</Text>
      <Ionicons name="open-outline" size={14} color={c.accentInk} />
    </Pressable>
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
    /* 読む列は広げない（お支払いの画面と同じ幅） */
    body: {
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      paddingHorizontal: SPACE.lg,
      paddingBottom: SPACE.xl,
      gap: SPACE.lg,
    },
    lead: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 20 },

    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.sm,
      backgroundColor: c.accentSoft,
    },
    noticeWarn: { backgroundColor: c.warnSoft },
    noticeText: { flex: 1, fontSize: TEXT.sub, color: c.text, lineHeight: 20 },

    section: { gap: SPACE.sm },
    sectionTitle: { fontSize: TEXT.title, fontWeight: '800', color: c.text },
    card: {
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    row: {
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      gap: SPACE.xs,
    },
    rowLast: { borderBottomWidth: 0 },
    label: { fontSize: TEXT.small, color: c.textMuted },
    value: { fontSize: TEXT.title, fontWeight: '800', color: c.text },
    /* 金額。いちばん目に入るように */
    amount: { fontSize: TEXT.titleLarge, fontWeight: '800', color: c.text, fontVariant: ['tabular-nums'] },
    /* 文で書く項目（期間・時期・返金）。太字にすると長い文が読みにくい */
    text: { fontSize: TEXT.body, color: c.text, lineHeight: 22 },
    note: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 20 },

    more: { gap: SPACE.xs },
    moreTitle: { fontSize: TEXT.bodyStrong, fontWeight: '800', color: c.text },
    links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACE.lg, rowGap: SPACE.xs },
    link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: HIT.min },
    linkText: { fontSize: TEXT.sub, fontWeight: '700', color: c.accentInk, textDecorationLine: 'underline' },

    actions: { gap: SPACE.sm, marginTop: SPACE.sm },
    submit: {
      minHeight: HIT.primary,
      borderRadius: RADIUS.md,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACE.lg,
    },
    submitOn: { opacity: 0.85 },
    submitOff: { opacity: 0.45 },
    submitText: { fontSize: TEXT.title, fontWeight: '800', color: c.accentText, textAlign: 'center' },
    notReady: { fontSize: TEXT.sub, fontWeight: '700', color: c.warn, lineHeight: 20 },

    change: { alignItems: 'center', justifyContent: 'center', minHeight: HIT.min },
    changeText: { fontSize: TEXT.sub, fontWeight: '700', color: c.textMuted },
  });
}
