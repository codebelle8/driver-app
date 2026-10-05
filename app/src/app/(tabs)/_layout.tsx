import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocked } from '@/components/plan-gate';
import { useT } from '@/lib/i18n/context';
import { useLayout } from '@/lib/layout';
import { useTheme } from '@/theme-context';
import { TEXT } from '@/theme';

/**
 * 画面の切り替え。
 *
 * 以前はタブを置かず検索画面だけにしていた。ドライバーの用途は
 * 「次に向かう施設を1件調べる」に尽きる、という判断だったが、
 * ご提示の構成に合わせてタブを設ける。
 *
 * お気に入り・マイページは、初期版では置き場所のみ。
 *
 * **広い画面では左へ寄せる**
 *   画面下の並びは、親指が届く範囲に操作を置くための形。
 *   マウスで使う 1920px の画面では、下端まで手を運ぶ理由が無く、
 *   横一杯に伸びた4つの見出しは、ただの余白にしか見えない。
 *   1024px 以上では左の縦メニューにする。
 */

/**
 * 記号と文字が収まる高さ。
 *
 * 高さを指定せずに任せたところ、文字を描く余地が無くなって
 * 記号だけになった。端末の下端の余白は別に足す。
 */
const BAR_HEIGHT = 70;

/** タブの並び。名前と記号を1か所にまとめる。 */
const TABS = [
  { name: 'index', key: 'search', on: 'search', off: 'search-outline' },
  { name: 'favorites', key: 'favorites', on: 'star', off: 'star-outline' },
  { name: 'history', key: 'history', on: 'time', off: 'time-outline' },
  /* チャット（2026-10-05）。締めているあいだも開ける（情報提供ランキング） */
  { name: 'chat', key: 'chat', on: 'chatbubbles', off: 'chatbubbles-outline' },
  { name: 'mypage', key: 'mypage', on: 'person', off: 'person-outline' },
] as const;

export default function TabsLayout() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide } = useLayout();
  const dict = useT();

  /*
    無料期間が終わったあとは、設定だけを残す。

    押せる項目を残したまま門で戻すと、押すたびに弾かれることになり、
    壊れているように見える。行けない先は、はじめから出さない。
  */
  const locked = useLocked();

  return (
    <Tabs
      /*
        広い画面では帯を出さない。

        左メニューは画面の並びの外側（app/_layout.tsx）が描く。
        施設の詳細やお知らせはタブの外側にあり、ここで描くと
        そちらへ移った時に消えてしまう。
      */
      tabBar={isWide ? () => null : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textFaint,

        /*
          中身の高さは決め打ちにし、端末の下端の余白はその上に足す。

          高さを任せると文字が消え、逆に決め打ちだけにすると
          下端のインジケータと重なる。両方を分けて指定する。
        */
        // 広い画面の見た目は SideRail が持つ。ここでは指定しない。
        tabBarStyle: isWide
          ? undefined
          : {
              backgroundColor: c.surface,
              borderTopColor: c.border,
              borderTopWidth: 1,
              height: BAR_HEIGHT + insets.bottom,
              paddingTop: 6,
              // 下に余白を厚めに取ることで、記号と文字がまとめて上へ寄る
              paddingBottom: 14 + insets.bottom,
            },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: dict.tabs[t.key],
            /* href: null で帯から外れる。設定（mypage）だけを残す。 */
            href: locked && t.name !== 'mypage' && t.name !== 'chat' ? null : undefined,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? t.on : t.off} size={22} color={color} />
            ),
            /*
              文字を自分で描く。

              tabBarLabelStyle を渡しても、文字の箱に height: 11px と
              overflow: hidden が入り、日本語の上下が切り落とされていた。
              行の高さを指定しても箱の高さは変わらなかったため、
              内部の作りに任せず、こちらで描く。

              左メニューでは記号の右に並ぶため、大きさと寄せ方を変える。
            */
            tabBarLabel: ({ color, focused }) => (
              <View style={isWide ? styles.railLabelBox : styles.labelBox}>
                <Text
                  /*
                    記号と文字は同じ色を受け取るが、**文字だけは分ける。**
                    暗い配色で主役の緑を文字に使うと 3.5:1 にしかならない。
                    記号は 3:1 で足りるため、そのまま緑で置く。
                  */
                  style={[
                    isWide ? styles.railLabel : styles.label,
                    { color: focused ? c.accentInk : color },
                  ]}
                  numberOfLines={1}
                >
                  {dict.tabs[t.key]}
                </Text>
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // 文字が収まる高さを確保する。切り落とさない。
  labelBox: { height: 18, justifyContent: 'center', alignItems: 'center' },
  label: {
    fontSize: TEXT.small,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  // 左メニューでは横に並ぶため、左寄せにして文字も大きくする
  railLabelBox: { height: 22, justifyContent: 'center' },
  railLabel: {
    fontSize: TEXT.body,
    lineHeight: 20,
    fontWeight: '600',
  },
});
