import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeSyncedAt, ensureSynced, resync, type SyncResult } from '@/lib/sync';
import { useEffect, useState } from 'react';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { Flag } from '@/components/flag';
import { PageWidth } from '@/components/page-width';
import { daysLeft, isExpired } from '@/lib/account';
import { useAccount } from '@/lib/account-context';
import { useLocale, useT } from '@/lib/i18n/context';
import { fill, LOCALE_NAME, LOCALES, type Locale } from '@/lib/i18n/dictionaries';
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
      <View style={styles.head}>
        <Text style={styles.heading}>{t.mypage.title}</Text>
      </View>

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
                  : account.status === 'active'
                    ? t.account.statusPaid
                    : isExpired(account)
                      ? t.mypage.accountEnded
                      : fill(t.mypage.accountTrial, { n: daysLeft(account.trialEndsAt) })}
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
                {account.status === 'active'
                  ? t.account.statusPaid
                  : isExpired(account)
                    ? t.mypage.accountEnded
                    : fill(t.mypage.accountTrial, { n: daysLeft(account.trialEndsAt) })}
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

      <Text style={styles.note}>{t.mypage.note}</Text>
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
      <Text style={[styles.choiceText, { color: on ? c.accent : c.textMuted }]}>
        {LOCALE_NAME[locale]}
      </Text>
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    head: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.md },
    heading: { fontSize: TEXT.heading, fontWeight: '800', color: c.accent },
    box: {
      marginHorizontal: SPACE.lg,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    boxAccount: { marginBottom: SPACE.md },
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
    note: {
      marginTop: SPACE.md,
      paddingHorizontal: SPACE.lg,
      fontSize: TEXT.small,
      color: c.textFaint,
      lineHeight: 18,
    },
  });
}
