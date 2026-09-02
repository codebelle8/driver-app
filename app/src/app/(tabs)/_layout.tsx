import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme-context';

/**
 * 記号と文字が収まる高さ。
 *
 * 高さを指定せずに任せたところ、文字を描く余地が無くなって
 * 記号だけになった。端末の下端の余白は別に足す。
 */
const BAR_HEIGHT = 70;

/**
 * 画面下の切り替え。
 *
 * 以前はタブを置かず検索画面だけにしていた。ドライバーの用途は
 * 「次に向かう施設を1件調べる」に尽きる、という判断だったが、
 * ご提示の構成に合わせてタブを設ける。
 *
 * お気に入り・履歴・マイページは、初期版では置き場所のみ。
 * 中身は運用版で埋める。
 */
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '探す',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'お気に入り',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'star' : 'star-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: '履歴',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mypage"
        options={{
          title: 'マイページ',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
