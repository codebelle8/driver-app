import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthForm } from '@/components/auth-form';
import { BrandLogo } from '@/components/brand';
import { signOut } from '@/lib/account';
import { useAccount } from '@/lib/account-context';
import { fill } from '@/lib/i18n/dictionaries';
import { useT } from '@/lib/i18n/context';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 起動したときの入口。
 *
 * **ログインしていなければ、まずここが出る**
 *   ご指示による。会員制の製品として、入口をひとつにする。
 *
 * **調べ終えるまでは何も出さない**
 *   端末に残っているログインを読むのは非同期で、待たずに描くと
 *   ログイン済みの方にも一瞬ログイン画面が出る。毎回それが出ると、
 *   ログインが切れたのかと思わせる。
 *
 * **再設定の途中は、ログイン済みでもここを出す**
 *   リンクから戻ると Supabase はログイン済みの状態にする。そのまま
 *   中へ通すと、新しいパスワードを決める場所へたどり着けない。
 *
 * **ご利用を停止した方は中へ通さない**
 *   停止という状態を持ちながら、それを見て止める場所が無かった。
 *   ここで止め、理由と問い合わせ先を出す。
 *
 * **圏外で使える日数を過ぎたら、ログインの画面を出さない**
 *   圏外ではログインできない。入力を出すと行き止まりになる。何をすれば
 *   よいか（電波の届く場所で開く）を出し、電波が戻れば自動で中へ通す。
 *
 * **管理画面の入口に合わせる**（ご指示 2026-09-11）
 *   同じ製品として、入口の形を揃える。
 *
 *     ロゴ → 名乗り → 枠で囲った入力
 *
 *   **下端の一行は置かない**（ご指示 2026-09-11）。管理画面には
 *   常に出ているが、アプリの入口では入力より下に線が一本入るだけで、
 *   打つ場所から目が逸れる。
 *
 *   中身は上下の真ん中へ。以前は上に寄り、下半分が空いていた。
 *   **写真は置かない。** 管理画面の入口にも写真は無く、帯を入れると
 *   入る文字の量は変わらないまま入力が下へ送られる（同日のご指示）。
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);
  const { account, ready, recovering, takenOver, offlineLimit, refresh } = useAccount();
  const [checking, setChecking] = useState(false);

  // 調べ終えるまでは、地の色だけ出しておく
  if (!ready && !recovering) return <View style={s.blank} />;

  if (!account && offlineLimit) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.center}>
          <View style={s.card} accessibilityRole="alert">
            <Ionicons name="cellular-outline" size={28} color={c.warn} />
            <Text style={s.blockedTitle}>{t.account.offlineLimitTitle}</Text>
            <Text style={s.lead}>{fill(t.account.offlineLimitBody, { n: offlineLimit.days })}</Text>
            <Pressable
              onPress={async () => {
                setChecking(true);
                await refresh();
                setChecking(false);
              }}
              disabled={checking}
              accessibilityRole="button"
              accessibilityLabel={t.account.offlineRetry}
              style={s.plain}
            >
              <Text style={s.plainText}>{checking ? t.account.offlineChecking : t.account.offlineRetry}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (account && account.status === 'blocked') {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.center}>
          <View style={s.card}>
            <Ionicons name="lock-closed-outline" size={28} color={c.danger} />
            <Text style={s.blockedTitle}>{t.account.blockedTitle}</Text>
            <Text style={s.lead}>{t.account.blockedBody}</Text>
            <Pressable
              onPress={() => void signOut()}
              accessibilityRole="button"
              accessibilityLabel={t.account.signOut}
              style={s.plain}
            >
              <Text style={s.plainText}>{t.account.signOut}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (account && !recovering) return <>{children}</>;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.pane} showsVerticalScrollIndicator={false}>
        <View style={s.body}>
          <View style={s.head}>
            <BrandLogo height={44} />
            <Text style={s.welcome}>{t.account.welcomeTitle}</Text>
            <Text style={s.lead}>{t.account.welcomeBody}</Text>
          </View>

          {/*
            ほかの端末で入られて出された場合。

            一瞬で消える帯では、戻ってきた画面を見た方に理由が伝わらない。
            ここへ出したままにする。次に入れば消える。
          */}
          {takenOver && (
            <View style={s.notice} accessibilityRole="alert">
              <Ionicons name="phone-portrait-outline" size={18} color={c.warn} />
              <View style={s.noticeBody}>
                <Text style={s.noticeTitle}>{t.account.takenOver}</Text>
                <Text style={s.noticeText}>{t.account.takenOverBody}</Text>
              </View>
            </View>
          )}

          {/*
            入力を枠で囲う。管理画面の入口と同じ形。

            囲うと、打つ場所がひとまとまりに見える。地の色の上へ直に
            並べていたころは、どこからどこまでが入力なのかを線ではなく
            余白だけで示していた。
          */}
          <View style={s.formCard}>
            <AuthForm />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    blank: { flex: 1, backgroundColor: c.bg },
    safe: { flex: 1, backgroundColor: c.bg },

    /*
      上下の真ん中へ置く。

      flexGrow で余白を受け取り、justifyContent で中央へ寄せる。
      入力が画面より高くなったとき（新規登録・小さな端末）は、
      そのまま上から並んで送れる形になる。切り取られない。
    */
    pane: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.xl,
    },

    /* 入力の列は広げない。1本の欄が 1000px あっても打ちやすくならない。 */
    body: {
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      gap: SPACE.md,
    },

    head: { alignItems: 'center', gap: SPACE.xs, marginBottom: SPACE.xs },
    welcome: { fontSize: TEXT.heading, fontWeight: '800', color: c.text, marginTop: SPACE.sm },
    lead: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 20, textAlign: 'center' },

    formCard: {
      padding: SPACE.lg,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },


    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.sm,
      backgroundColor: c.warnSoft,
      borderWidth: 1,
      borderColor: c.warn,
    },
    noticeBody: { flex: 1, gap: 2 },
    noticeTitle: { fontSize: TEXT.body, fontWeight: '800', color: c.text },
    noticeText: { fontSize: TEXT.sub, color: c.text, lineHeight: 19 },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.lg },
    card: {
      width: '100%',
      maxWidth: 420,
      alignItems: 'center',
      gap: SPACE.sm,
      padding: SPACE.xl,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    blockedTitle: { fontSize: TEXT.titleLarge, fontWeight: '800', color: c.text },
    plain: { marginTop: SPACE.md, paddingVertical: SPACE.sm, paddingHorizontal: SPACE.lg },
    plainText: { fontSize: TEXT.body, fontWeight: '700', color: c.accentInk },
  });
