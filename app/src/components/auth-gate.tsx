import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArtImage } from '@/components/art-image';
import { AuthForm } from '@/components/auth-form';
import { BrandLogo } from '@/components/brand';
import { Ramp } from '@/components/ramp';
import { signOut } from '@/lib/account';
import { useAccount } from '@/lib/account-context';
import { LOGIN_BANNER_URLS, RAIL_ART_URLS } from '@/lib/art';
import { useT } from '@/lib/i18n/context';
import { useLayout } from '@/lib/layout';
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
 * **写真を敷き、中身を上下の真ん中へ置く**（ご指示 2026-09-11）
 *   以前は上に寄せ、下半分が空いていた。
 *
 *     広い画面 … 左に写真、右に入力。空いていた横幅を写真に充てる
 *     狭い画面 … 上に写真の帯。写真と入力をひとまとまりにして中央へ
 *
 *   写真は左メニューと同じもの（app/public/art/rail.jpg）。
 *   **無くても成り立つ。** 下敷きに淡い緑を敷いてあり、読み込めなければ
 *   それがそのまま残る。端末側（Expo Go・APK）では public/ の仕組みが
 *   無いため、常に下敷きだけになる。
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);
  const { isWide, height } = useLayout();
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

  /*
    ほかの端末で入られて出された場合。

    一瞬で消える帯では、戻ってきた画面を見た方に理由が伝わらない。
    ここへ出したままにする。次に入れば消える。
  */
  const notice = takenOver ? (
    <View style={s.notice} accessibilityRole="alert">
      <Ionicons name="phone-portrait-outline" size={18} color={c.warn} />
      <View style={s.noticeBody}>
        <Text style={s.noticeTitle}>{t.account.takenOver}</Text>
        <Text style={s.noticeText}>{t.account.takenOverBody}</Text>
      </View>
    </View>
  ) : null;

  const welcome = (
    <View style={s.head}>
      <BrandLogo height={40} />
      <Text style={s.welcome}>{t.account.welcomeTitle}</Text>
      <Text style={s.lead}>{t.account.welcomeBody}</Text>
    </View>
  );

  // ---- 広い画面。左に写真、右に入力 ----------------------------------------
  if (isWide) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.split}>
          <View style={s.art}>
            {/* 下敷き。写真が無くてもここが残る。 */}
            <View style={s.artBase} />
            <ArtImage urls={RAIL_ART_URLS} style={s.fill} />

            {/*
              下端だけ暗く落とす。

              文字を写真へ直に置くと、明るい車体と白い文字で見分けが
              付かなくなる。落とすのは文字が乗る範囲だけにする。
            */}
            <View style={s.artVeil} pointerEvents="none">
              <Ramp color="#0b1512" direction="down" from={0} to={0.72} />
            </View>

            <View style={s.artText} pointerEvents="none">
              <Text style={s.tagline}>{t.brand.tagline1}</Text>
              <Text style={s.tagline}>{t.brand.tagline2}</Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={s.pane}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.body}>
              {welcome}
              {notice}
              <AuthForm />
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // ---- 狭い画面。上に写真の帯、全体を上下の真ん中へ --------------------------
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.pane} showsVerticalScrollIndicator={false}>
        <View style={s.body}>
          {/*
            背の低い端末では帯を薄くする。

            150px のままだと、入力が画面に収まりきらず送ることになる。
            写真は飾りで、入力は用事。用事のほうを優先する。
          */}
          <View style={[s.banner, height < 700 && s.bannerShort]}>
            <View style={s.artBase} />
            <ArtImage urls={LOGIN_BANNER_URLS} style={s.fill} contentPosition="center" />
          </View>

          {welcome}
          {notice}
          <AuthForm />
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
      maxWidth: 440,
      alignSelf: 'center',
      gap: SPACE.md,
    },

    head: { alignItems: 'center', gap: SPACE.xs, marginBottom: SPACE.sm },
    welcome: { fontSize: TEXT.heading, fontWeight: '800', color: c.text, marginTop: SPACE.sm },
    lead: { fontSize: TEXT.sub, color: c.textMuted, lineHeight: 20, textAlign: 'center' },

    /* ---- 広い画面の写真 ---- */
    split: { flex: 1, flexDirection: 'row' },
    art: {
      width: '42%',
      maxWidth: 560,
      overflow: 'hidden',
      backgroundColor: c.accentSoft,
      justifyContent: 'flex-end',
    },
    fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    artBase: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.accentSoft,
    },
    artVeil: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220 },
    artText: { padding: SPACE.xl, gap: 2 },
    tagline: {
      fontSize: TEXT.title,
      fontWeight: '800',
      color: '#ffffff',
      lineHeight: 30,
    },

    /* ---- 狭い画面の帯 ---- */
    banner: {
      height: 150,
      borderRadius: RADIUS.md,
      overflow: 'hidden',
      backgroundColor: c.accentSoft,
      marginBottom: SPACE.xs,
    },
    bannerShort: { height: 104 },

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
