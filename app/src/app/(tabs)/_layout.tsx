import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme-context';

/**
 * 画面下の切り替え。
 *
 * 以前はタブを置かず検索画面だけにしていた。ドライバーの用途は
 * 「次に向かう施設を1件調べる」に尽きる、という判断だったが、
 * ご提示の構成に合わせてタブを設ける。
 *
 * お気に入り・マイページは、初期版では置き場所のみ。
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
  { name: 'index', label: '探す', on: 'search', off: 'search-outline' },
  { name: 'favorites', label: 'お気に入り', on: 'star', off: 'star-outline' },
  { name: 'history', label: '履歴', on: 'time', off: 'time-outline' },
  { name: 'mypage', label: 'マイページ', on: 'person', off: 'person-outline' },
] as const;

export default function TabsLayout() {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textFaint,
        /*
          中身の高さは決め打ちにし、端末の下端の余白はその上に足す。

          高さを任せると文字が消え、逆に決め打ちだけにすると
          下端のインジケータと重なる。両方を分けて指定する。
        */
        tabBarStyle: {
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
            title: t.label,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? t.on : t.off} size={22} color={color} />
            ),
            /*
              文字を自分で描く。

              tabBarLabelStyle を渡しても、文字の箱に height: 11px と
              overflow: hidden が入り、日本語の上下が切り落とされていた。
              行の高さを指定しても箱の高さは変わらなかったため、
              内部の作りに任せず、こちらで描く。
            */
            tabBarLabel: ({ color }) => (
              <View style={styles.labelBox}>
                <Text style={[styles.label, { color }]} numberOfLines={1}>
                  {t.label}
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
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
