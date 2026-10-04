import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeSyncedAt, ensureSynced, resync, type SyncResult } from '@/lib/sync';
import { useEffect, useState } from 'react';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { Flag } from '@/components/flag';
import { PageWidth } from '@/components/page-width';
import { endsAt, isExpired, remaining } from '@/lib/account';
import { useAccount } from '@/lib/account-context';
import { useLocale, useT } from '@/lib/i18n/context';
import { notify } from '@/lib/notice';
import { PlanLock } from '@/components/plan-lock';
import { askToInstall, installState, type InstallState } from '@/lib/install';
import { appVersion, hasAny, loadSite, type Site } from '@/lib/site';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';
import { fill, formatSpan, LOCALE_NAME, LOCALES, type Locale } from '@/lib/i18n/dictionaries';
import { useTheme, useThemeControl } from '@/theme-context';

/**
 * 設定と状態。
 *
 * 明暗の切り替えはここへ移した。以前は検索画面の右上にあったが、
 * ご提示の構成では同じ位置がお知らせの場所になっている。
 * 一度決めたら変えない設定なので、探す画面から外して差し支えない。
 *
 * 言語もここに置く。理由は同じで、一度決めたら変えない設定にあたる。
 * 走行前に押す場所（探す・お気に入り・履歴）から外しておく。
 */
export default function MyPageScreen() {
  const c = useTheme();
  const { theme, toggle } = useThemeControl();
  const t = useT();
  const { locale, setLocale } = useLocale();
  const { account, ready } = useAccount();
  const router = useRouter();
  const styles = makeStyles(c);
  const [sync, setSync] = useState<SyncResult>({ ok: true, facilityCount: 0, syncedAt: null });
  const [busy, setBusy] = useState(false);

  /* 通知。端末とブラウザによって、できることが違う。 */
  const [push, setPush] = useState<PushState>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);

  /*
    ホーム画面への追加。

    追加済みの方には出さない。出しても押す先が無い。
  */
  /*
    規約類の掲載先。まだ入っていない項目は出さない。
    押しても何も無いリンクは、壊れているのと同じ。
  */
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

  const [install, setInstall] = useState<InstallState>('none');
  useEffect(() => {
    /*
      ブラウザからの「入れますか」の申し出は、開いた直後に飛んでくる。
      すぐ読むと取り逃すため、少し待ってから見る。
    */
    const t = setTimeout(() => setInstall(installState()), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let alive = true;
    pushState().then((v) => {
      if (alive) setPush(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function togglePush() {
    if (pushBusy) return;
    setPushBusy(true);
    const next = push === 'on' ? await disablePush() : await enablePush();
    setPushBusy(false);
    setPush(next);
    if (next === 'on') notify(t.mypage.pushEnabled);
    else if (push === 'on' && next === 'off') notify(t.mypage.pushDisabled);
  }

  useEffect(() => {
    ensureSynced().then(setSync);
  }, []);

  async function reload() {
    setBusy(true);
    setSync(await resync());
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      {/* 広い画面で間延びしないよう、中身の幅に上限を設ける */}
      <PageWidth>
      {/*
        スクロールする箱。**これが無かった。**

        中身が画面より高くなると、そのまま切り落とされ、指で動かしても
        何も起きない。実機（スマートフォン）で「このアプリについて」から
        下へ届かなくなっていた（ご報告 2026-09-13）。

        手元の検査は 1280×900 で見ており、そこでは収まってしまうため
        一度も引っかからなかった。他の画面（account・plan）は初めから
        この形になっている。ここだけ抜けていた。
      */}
      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
      <View style={styles.head}>
        <Text style={styles.heading}>{t.mypage.title}</Text>
      </View>

      {/*
        無料期間が終わっているときの説明。いちばん上に置く。

        突然「探す」が消えると、壊れたのだと受け取られる。壊れたと
        思った方は直るのを待ち、そのあいだお支払いは起きない。
        締めた理由と、次の一手を最初に出す。
      */}
      <PlanLock />

      {/*
        アカウント。設定とは別の箱にしている。

        明るさ・言語・取り込みは「この端末の設定」で、一度決めたら
        変えない。アカウントはその人の持ち物にあたり、性質が違う。
        同じ箱へ並べると、設定の一項目に見える。
      */}
      <View style={[styles.box, styles.boxAccount]}>
        <Pressable
          onPress={() => router.push('/account')}
          style={styles.rowLast}
          accessibilityRole="button"
        >
          <View style={styles.icon}>
            <Ionicons name="person-circle-outline" size={17} color={c.accent} />
          </View>
          <View style={styles.body}>
            {/*
              1行に収めない。長いメールアドレスが「…」で切れると、
              どのアカウントで入っているのかが読めなくなる。
            */}
            <Text style={styles.name} numberOfLines={2}>
              {account?.email ?? t.mypage.account}
            </Text>
            {/* 1行に収めない。320px の画面で「…」に切れる。 */}
            <Text style={styles.hint}>
              {!ready
                ? t.mypage.accountChecking
                : !account
                  ? t.mypage.accountOut
                  : /*
                      **期限を先に見る。** お支払い済みでも期間が過ぎたら
                      終わった旨を出す（ご指示 2026-09-15）。状態を先に
                      見ると、切れていても「ご利用中」と出てしまう。
                    */
                    account.freeReason
                    ? t.mypage.accountFree
                    : isExpired(account)
                    ? account.status === 'active'
                      ? t.mypage.accountEndedPaid
                      : t.mypage.accountEnded
                    : account.status === 'active'
                      ? endsAt(account)
                        ? fill(t.mypage.accountPaid, { left: formatSpan(t, remaining(account)) })
                        : t.account.statusPaid
                      : fill(t.mypage.accountTrial, { left: formatSpan(t, remaining(account)) })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={c.textFaint} />
        </Pressable>
      </View>

      {/*
        お支払い。アカウントとは別の項目にしている。

        アカウントは「その人が誰か」、こちらは「いくら払うか」で、
        見に行く理由が違う。同じ画面へ混ぜると、名前や写真を直しに来た
        方の目にも料金が入る。
      */}
      {!!account && (
        <View style={[styles.box, styles.boxAccount]}>
          <Pressable
            onPress={() => router.push('/plan')}
            style={styles.rowLast}
            accessibilityRole="button"
          >
            <View style={styles.icon}>
              <Ionicons name="card-outline" size={17} color={c.accent} />
            </View>
            <View style={styles.body}>
              <Text style={styles.name}>{t.mypage.payment}</Text>
              <Text style={styles.hint}>
                {account.freeReason
                  ? t.mypage.accountFree
                  : isExpired(account)
                  ? account.status === 'active'
                    ? t.mypage.accountEndedPaid
                    : t.mypage.accountEnded
                  : account.status === 'active'
                    ? endsAt(account)
                      ? fill(t.mypage.accountPaid, { left: formatSpan(t, remaining(account)) })
                      : t.account.statusPaid
                    : fill(t.mypage.accountTrial, { left: formatSpan(t, remaining(account)) })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={c.textFaint} />
          </Pressable>
        </View>
      )}

      <View style={styles.box}>
        <Pressable onPress={toggle} style={styles.row} accessibilityRole="button">
          <View style={styles.icon}>
            <Ionicons name={theme === 'dark' ? 'moon' : 'sunny'} size={17} color={c.accent} />
          </View>
          <View style={styles.body}>
            <Text style={styles.name}>{t.mypage.brightness}</Text>
            <Text style={styles.hint}>{theme === 'dark' ? t.mypage.dark : t.mypage.light}</Text>
          </View>
          <Ionicons name="swap-horizontal" size={17} color={c.textFaint} />
        </Pressable>

        {/*
          言語は、押すたびに切り替わる形ではなく選び取る形にした。

          明暗は2つで、押せば戻せる。言語は間違えて英語にすると、
          戻すための「日本語」の在り処が読めなくなる。旗と、その
          言語自身の表記を並べておけば、読めなくても戻れる。
        */}
        <View style={styles.row}>
          <View style={styles.icon}>
            <Ionicons name="language" size={17} color={c.accent} />
          </View>
          <View style={styles.body}>
            <Text style={styles.name}>{t.mypage.language}</Text>
            <Text style={styles.hint}>{t.mypage.languageHint}</Text>
          </View>
          <View style={styles.choices}>
            {LOCALES.map((l) => (
              <LocaleChoice
                key={l}
                locale={l}
                on={l === locale}
                onPress={() => setLocale(l)}
                styles={styles}
                c={c}
              />
            ))}
          </View>
        </View>

        {/*
          通知。押せるのは「受け取れる状態」のときだけ。

          押せないときも行は出す。消してしまうと、なぜ受け取れないのかを
          伝える場所が無くなる（iPhone はホーム画面へ追加すれば受け取れる）。
        */}
        <Pressable
          onPress={togglePush}
          disabled={pushBusy || (push !== 'on' && push !== 'off')}
          style={styles.row}
          accessibilityRole="switch"
          accessibilityState={{ checked: push === 'on' }}
          aria-checked={push === 'on'}
          accessibilityLabel={t.mypage.push}
        >
          <View style={styles.icon}>
            <Ionicons
              name={push === 'on' ? 'notifications' : 'notifications-outline'}
              size={17}
              color={c.accent}
            />
          </View>
          <View style={styles.body}>
            <Text style={styles.name}>{t.mypage.push}</Text>
            <Text style={styles.hint}>
              {push === 'on'
                ? t.mypage.pushOn
                : push === 'off'
                  ? t.mypage.pushOff
                  : push === 'needsHomeScreen'
                    ? t.mypage.pushHomeScreen
                    : push === 'denied'
                      ? t.mypage.pushDenied
                      : push === 'notReady'
                        ? t.mypage.pushNotReady
                        : t.mypage.pushUnsupported}
            </Text>
          </View>
          {(push === 'on' || push === 'off') && (
            <Ionicons
              name={push === 'on' ? 'toggle' : 'toggle-outline'}
              size={22}
              color={push === 'on' ? c.accent : c.textFaint}
            />
          )}
        </Pressable>

        <Pressable onPress={reload} disabled={busy} style={styles.row} accessibilityRole="button">
          <View style={styles.icon}>
            <Ionicons name="cloud-download-outline" size={17} color={c.accent} />
          </View>
          <View style={styles.body}>
            <Text style={styles.name}>{t.mypage.sync}</Text>
            <Text style={styles.hint}>
              {busy
                ? t.mypage.syncing
                : fill(t.mypage.syncState, {
                    n: sync.facilityCount,
                    when: describeSyncedAt(sync.syncedAt, t),
                  })}
            </Text>
          </View>
          <Ionicons name="refresh" size={17} color={c.textFaint} />
        </Pressable>
      </View>

      {/*
        ホーム画面への追加。

        iPhone は、追加しないとプッシュ通知を受け取れない。通知を
        作っても届かないので、その場で理由と手順を出す。
      */}
      {(install === 'ios' || install === 'prompt' || install === 'manual') && (
        <View style={styles.installBox}>
          <View style={styles.installHead}>
            <Ionicons name="phone-portrait-outline" size={18} color={c.accent} />
            <Text style={styles.installTitle}>{t.mypage.install}</Text>
          </View>
          <Text style={styles.installBody}>
            {t.mypage.installWhy}
            {install === 'ios' ? ` ${t.mypage.installWhyPush}` : ''}
          </Text>

          {install === 'prompt' ? (
            <Pressable
              onPress={async () => {
                await askToInstall();
                setInstall(installState());
              }}
              accessibilityRole="button"
              style={styles.installButton}
            >
              <Text style={styles.installButtonText}>{t.mypage.installNow}</Text>
            </Pressable>
          ) : (
            <Text style={styles.installSteps}>
              {install === 'ios' ? t.mypage.installIosSteps : t.mypage.installManual}
            </Text>
          )}
        </View>
      )}

      {/*
        このアプリについて。

        画面仕様（docs/03-screen-spec.md S-05）にある規約類と
        問い合わせ先、版。掲載先は管理画面から入れる。
      */}
      <Text style={styles.sectionLabel}>{t.mypage.about}</Text>
      <View style={styles.box}>
        {hasAny(site) && (
          <>
            {!!site.termsUrl && (
              <AboutRow label={t.mypage.terms} url={site.termsUrl} styles={styles} c={c} />
            )}
            {!!site.privacyUrl && (
              <AboutRow label={t.mypage.privacy} url={site.privacyUrl} styles={styles} c={c} />
            )}
            {!!site.lawUrl && (
              <AboutRow label={t.mypage.law} url={site.lawUrl} styles={styles} c={c} />
            )}
            {!!site.contactEmail && (
              <AboutRow
                label={t.mypage.contact}
                url={`mailto:${site.contactEmail}`}
                hint={site.contactEmail}
                styles={styles}
                c={c}
              />
            )}
          </>
        )}

        {/* 版だけは、いつでも出す。不具合のご連絡で必ず要る。 */}
        <View style={styles.rowLast}>
          <View style={styles.icon}>
            <Ionicons name="information-circle-outline" size={17} color={c.accent} />
          </View>
          <View style={styles.body}>
            <Text style={styles.name}>{t.mypage.version}</Text>
            <Text style={styles.hint}>{appVersion()}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.note}>{t.mypage.note}</Text>
      </ScrollView>
      </PageWidth>
    </SafeAreaView>
  );
}

/**
 * 言語ひとつぶんの選び札。
 *
 * 選ばれている側は下地と縁の色を変える。旗だけでは、どちらが
 * 効いているのか分からない。
 */
function LocaleChoice({
  locale,
  on,
  onPress,
  styles,
  c,
}: {
  locale: Locale;
  on: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, selected: on }}
      /*
        ブラウザへは aria-checked を直に渡す。

        accessibilityState だけでは、react-native-web の Pressable が
        radio の状態を属性に落とさない（DOM を見て気づいた）。
        画面では下地の色で分かるが、耳で聞く方には何も伝わらない。
      */
      aria-checked={on}
      accessibilityLabel={LOCALE_NAME[locale]}
      style={[styles.choice, on && styles.choiceOn]}
    >
      <Flag locale={locale} width={18} />
      <Text style={[styles.choiceText, { color: on ? c.accentInk : c.textMuted }]}>
        {LOCALE_NAME[locale]}
      </Text>
    </Pressable>
  );
}

/**
 * 外へ出る1行。
 *
 * 新しい窓で開く。アプリの中で開くと、戻る道が無い画面へ迷い込む
 * （規約の頁には、こちらの「戻る」が無い）。
 */
function AboutRow({
  label,
  url,
  hint,
  styles,
  c,
}: {
  label: string;
  url: string;
  hint?: string;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  /*
    web では本物の <a> にする。

    見た目だけ整えた押せる箱では、長押しの「新しいタブで開く」も、
    宛先を確かめる術も無くなる。react-native-web は href を渡すと
    <a> を出す。ネイティブでは無視されるので、そちらは openURL。
  */
  const asAnchor =
    Platform.OS === 'web'
      ? ({ href: url, hrefAttrs: { target: '_blank', rel: 'noreferrer' } } as object)
      : null;

  return (
    <Pressable
      {...asAnchor}
      onPress={Platform.OS === 'web' ? undefined : () => void Linking.openURL(url)}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={styles.row}
    >
      <View style={styles.icon}>
        <Ionicons name="document-text-outline" size={17} color={c.accent} />
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{label}</Text>
        {!!hint && (
          <Text style={styles.hint} numberOfLines={1}>
            {hint}
          </Text>
        )}
      </View>
      <Ionicons name="open-outline" size={16} color={c.textFaint} />
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    /* 下端に余白を置き、最後の一行が画面の縁に貼り付かないようにする */
    scrollBody: { paddingBottom: SPACE.xl },
    head: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.md },
    heading: { fontSize: TEXT.heading, fontWeight: '800', color: c.accentInk },
    box: {
      marginHorizontal: SPACE.lg,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    boxAccount: { marginBottom: SPACE.md },
    /* 節の見出し。箱の上に小さく置く。 */
    sectionLabel: {
      marginTop: SPACE.lg,
      marginBottom: SPACE.xs,
      paddingHorizontal: SPACE.lg + SPACE.xs,
      fontSize: TEXT.small,
      fontWeight: '700',
      color: c.textMuted,
    },
    /* 箱に1行しか無いときは、下の区切り線を出さない */
    rowLast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    icon: {
      width: 34,
      height: 34,
      borderRadius: RADIUS.sm,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { flex: 1 },
    name: { fontSize: TEXT.body, fontWeight: '700', color: c.text },
    hint: { fontSize: TEXT.small, color: c.textMuted, marginTop: 1 },
    choices: { flexDirection: 'row', gap: SPACE.xs },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: SPACE.sm,
      // 走行前の車内でも押せる高さ
      height: 34,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface2,
    },
    choiceOn: {
      borderColor: c.accent,
      backgroundColor: c.accentSoft,
    },
    choiceText: { fontSize: TEXT.sub, fontWeight: '700' },
    /* ホーム画面への追加のご案内 */
    installBox: {
      marginHorizontal: SPACE.lg,
      marginTop: SPACE.md,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      backgroundColor: c.accentSoft,
      gap: SPACE.xs,
    },
    installHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
    installTitle: { fontSize: TEXT.body, fontWeight: '800', color: c.text },
    installBody: { fontSize: TEXT.sub, color: c.text, lineHeight: 19 },
    installSteps: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 19 },
    installButton: {
      marginTop: SPACE.xs,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.sm,
      backgroundColor: c.accent,
    },
    installButtonText: { fontSize: TEXT.body, fontWeight: '700', color: c.accentText },

    note: {
      marginTop: SPACE.md,
      paddingHorizontal: SPACE.lg,
      fontSize: TEXT.small,
      color: c.textFaint,
      lineHeight: 18,
    },
  });
}
