import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
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
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}

function Shell() {
  const c = useTheme();
  const { theme } = useThemeControl();

  return (
    /*
      指の操作を扱う土台。Android ではこれが無いと、
      進入案内図の拡大（二本指・二回叩く）が反応しない。
    */
    <GestureHandlerRootView style={styles.root}>
    <SafeAreaProvider>
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
      <View style={[styles.root, { backgroundColor: c.bg }]}>
      <Stack
        screenOptions={{
          /*
            見出しと検索欄は同じ地の色にし、ひとつの「操作する面」として扱う。
            本文との境目は、その面の下辺に引いた境界線と、
            一覧側の地の色を一段変えることで示す。

            headerStyle は背景色しか受け付けないため、
            境界線はここではなく画面側 (index.tsx の top) に置いている。
          */
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: '700', fontSize: 17 },
          contentStyle: { backgroundColor: c.bg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            // 検索画面はアプリの入口なので、文字ではなくロゴを出す
            headerTitle: () => <BrandLogo />,
            headerTitleAlign: 'left',
            // 表示の切り替えは検索画面に置く。詳細画面にも出すと、
            // 走行前に押したい「ナビ開始」から視線が逸れる。
            headerRight: () => <ThemeToggle />,
          }}
        />
        <Stack.Screen
          name="facility/[id]"
          options={{ title: '', headerBackTitle: '検索' }}
        />
      </Stack>
      </View>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
