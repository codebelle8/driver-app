import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useEffect } from 'react';

import { ConfirmHost } from '@/components/confirm-dialog';
import { IntroVideo } from '@/components/intro-video';
import { NoticeHost } from '@/components/notice-toast';
import { AuthGate } from '@/components/auth-gate';
import { PlanGate } from '@/components/plan-gate';
import { SideRail } from '@/components/side-rail';
import { TopBar } from '@/components/top-bar';
import { AccountProvider } from '@/lib/account-context';
import { LocaleProvider } from '@/lib/i18n/context';
import { useLayout } from '@/lib/layout';
import { ensureSynced, refreshIfStale } from '@/lib/sync';
import { ThemeProvider, useTheme, useThemeControl } from '@/theme-context';

/**
 * 画面の並びは「検索 → 施設」の2段だけにしている。
 *
 * タブを置かない理由:
 *   ドライバーが使う場面は「次に向かう施設を1件調べる」に尽きる。
 *   入口が複数あると、走行前の限られた時間で迷う要因になる。
 *
 * 起動画面 (splash) を自分で制御していない理由:
 *   以前は preventAutoHideAsync() で保持し、描画後に hide() で消していた。
 *   しかし preventAutoHideAsync() は Promise を返す非同期処理で、
 *   hide() が先に走ったあとに「自動で隠すな」が有効になると、
 *   起動画面が二度と消えなくなる。実際にこれで起動しなくなった。
 *
 *   何も呼ばなければ、準備が整った時点で自動的に消える。
 *
 *   ※ Web では expo-splash-screen が実質何もしないため、
 *     この不具合はブラウザでの確認では現れない。実機で見つかった。
 */
/**
 * 配色の設定を保持する層を最上位に置く。
 * 画面より外側に無いと、切り替えても再描画されない。
 */
export default function RootLayout() {
  /*
    取り込みを、どの画面から入っても一度だけ走らせる。

    以前は探す画面でしか走らせておらず、共有された URL から
    施設の画面を直接開くと、端末のデータベースが空のまま
    「読み込めませんでした」で行き止まりになっていた。

    ここで走らせておけば、どの入口から来ても同じ結果になる。
    結果は ensureSynced が控えるため、二重には走らない。
  */
  useEffect(() => {
    void ensureSynced();
  }, []);

  /*
    **画面へ戻ってきたら、取り込み直す。**

    起動時の1回だけだと、開いたままの端末には新しい内容が届かない。
    管理画面で直したことが、アプリを開き直すまで出なかった
    （ご報告 2026-09-15）。

    しばらく経っているときだけ取りに行く（sync.ts の refreshIfStale）。
    画面を切り替えるたびに通信すると、走行前の電波で無駄が出る。

    **web と端末で合図が違う。**
      web  … 別のタブから戻る（visibilitychange）、窓へ焦点が戻る
      端末 … 裏から表へ戻る（AppState）
    両方を見る。片方だけだと、どちらかの環境で効かない。
  */
  useEffect(() => {
    const wake = () => void refreshIfStale();

    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const onVisible = () => {
        if (document.visibilityState === 'visible') wake();
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', wake);
      return () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', wake);
      };
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') wake();
    });
    return () => sub.remove();
  }, []);

  return (
    /*
      言語を保つ層を、配色より外側に置く。

      画面だけでなく、左メニューや帯（知らせ）も文言を引く。
      画面の並びの内側に置くと、外側にあるそれらへ届かない。
    */
    <LocaleProvider>
    {/*
      会員の状態を保つ層。

      マイページだけでなく、今後の課金の判定もここを見る。画面ごとに
      読み直すと、同じ問い合わせが画面の数だけ走る。

      ログインしていなくても待たせない。このアプリは登録せずに使えるため、
      調べ終える前に一覧を出してよい。
    */}
    <AccountProvider>
    <ThemeProvider>
      <Shell />
      {/*
        導入映像。画面より上に重ね、終わるか押されたら消える。

        ロゴだけを出す層も作ったが、システムの起動画面と合わせて
        3枚重なることになるため、映像に一本化した。
      */}
      <IntroVideo />
      {/*
        消してよいかを尋ねる札。

        画面の外に置くのは、呼ぶ場所が一覧の行・見出し・詳細画面と
        散らばるため。画面ごとに持たせると同じ組み立てが増える。
        導入映像より後ろで構わない。映像が出ている間は誰も消せない。
      */}
      <ConfirmHost />
      {/*
        短い知らせの帯。画面の下に重ねる。
        札より後ろで構わない。札が出ている間に知らせは起きない。
      */}
      <NoticeHost />
    </ThemeProvider>
    </AccountProvider>
    </LocaleProvider>
  );
}

function Shell() {
  const c = useTheme();
  const { theme } = useThemeControl();
  const { isWide } = useLayout();

  return (
    /*
      指の操作を扱う土台。Android ではこれが無いと、
      進入案内図の拡大（二本指・二回叩く）が反応しない。
    */
    <GestureHandlerRootView style={styles.root}>
    <SafeAreaProvider>
    {/*
      起動したときの入口。ログインしていなければ、まずここが出る。
      ご指示による。会員制の製品として、入口をひとつにする。
    */}
    <AuthGate>
      {/*
        時刻や電池の表示色。
        端末の設定 (useColorScheme) ではなく、利用者が選んだ表示に従う。
        端末が暗い設定のまま明るい表示へ切り替えると、白い文字が
        白い地に乗って時刻が見えなくなっていた。
      */}
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
      {/*
        画面全体の地色を敷く。
        ブラウザで開いた際、この指定が無いと画面の余った部分に
        既定の白が残り、暗い配色の中に白い帯が出る。
      */}
      {/*
        広い画面では左メニューを画面の並びの外へ置く。

        以前はタブの並びの一部として描いていた。施設の詳細やお知らせは
        タブの外側にある画面で、そこへ移ると左メニューごと消えていた。
        PC では常に見えているべきものなので、ここで横に並べる。
      */}
      <View style={[styles.root, styles.shell, { backgroundColor: c.bg }, isWide && styles.shellWide]}>
      {isWide && <SideRail />}
      {/*
        上部の帯（現在地・お知らせ・顔写真）。

        画面の並びの外に置く。ご指示により、どの機能を開いていても
        出したままにする。画面ごとに置くと、置き忘れた画面だけ帯が
        消え、そこだけ知らせに気づけない。

        切り欠き（ノッチ）の下へ逃がすのは帯の役目になった。
        各画面の SafeAreaView からは top を外してある。
      */}
      <View style={styles.column}>
      <TopBar />
      <PlanGate>
      <Stack
        screenOptions={{
          // 画面ごとに見出しを持つため、共通の見出しは出さない
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="facility/[id]" />
        <Stack.Screen name="notices" />
        <Stack.Screen name="account" />
        <Stack.Screen name="plan" />
      </Stack>
      </PlanGate>
      </View>
      </View>
    </AuthGate>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  shell: { flexDirection: 'column' },
  shellWide: { flexDirection: 'row' },
  /* 帯と画面を縦に積む列。広い画面では左メニューの右側にあたる。 */
  column: { flex: 1 },
});
