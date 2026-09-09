import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthForm } from '@/components/auth-form';
import { BrandLogo } from '@/components/brand';
import { signOut } from '@/lib/account';
import { useAccount } from '@/lib/account-context';
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
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);
  const { account, ready, recovering, takenOver } = useAccount();

  // 調べ終えるまでは、地の色だけ出しておく
  if (!ready && !recovering) return <View style={s.blank} />;

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
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.head}>
          <BrandLogo height={40} />
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

        <AuthForm />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    blank: { flex: 1, backgroundColor: c.bg },
    safe: { flex: 1, backgroundColor: c.bg },
    /*
      入力の列は広げない。1本の欄が 1000px あっても打ちやすくならない。
    */
    body: {
      width: '100%',
      maxWidth: 440,
      alignSelf: 'center',
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.xl,
      gap: SPACE.md,
    },
    head: { alignItems: 'center', gap: SPACE.xs, marginBottom: SPACE.sm },
    welcome: { fontSize: TEXT.heading, fontWeight: '800', color: c.text, marginTop: SPACE.sm },
    lead: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 20, textAlign: 'center' },

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
      maxWidth: 440,
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
    plainText: { fontSize: TEXT.body, fontWeight: '700', color: c.accent },
  });
