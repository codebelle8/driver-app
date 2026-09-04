import Ionicons from '@expo/vector-icons/Ionicons';
// Tabs と同じ場所から型を取る。bottom-tabs を直に指すと、
// expo-router の内部構成（build/ の下）に依存してしまう。
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '@/components/brand';
import type { Palette } from '@/theme';
import { RADIUS, SPACE } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 広い画面での左メニュー。
 *
 * **自前で描いている理由**
 *   既定の左メニューは、選択中の項目に明るい青の下地を敷く。
 *   このアプリの色は緑で、青の上に濃い文字が乗って読めなくなっていた。
 *   色だけを差し替える指定はあるが、下地の形（角丸の大きさ・余白）や
 *   マウスを乗せたときの反応までは合わせられない。こちらで描く。
 *
 * **幅はここで決める**
 *   自前で描くと tabBarStyle の指定は届かない。指定していたのに
 *   左メニューが画面の半分を占めていた。幅はこの部品が持つ。
 *
 * **ロゴをここへ置く**
 *   画面下の並びだった頃、ロゴは本文の先頭にあった。左メニューにすると
 *   本文が右へ寄るため、ロゴだけが本文の中に取り残されて据わりが悪い。
 *   メニューの上端へ移す。
 */
/**
 * 左メニューの幅。
 *
 * 「お気に入り」「マイページ」が折り返さずに収まる幅にしている。
 * 記号だけにすると、どれが何かを覚えていないと押せない。
 */
export const RAIL_WIDTH = 208;

export function SideRail({ state, descriptors, navigation }: BottomTabBarProps) {
  const c = useTheme();
  const s = makeStyles(c);

  return (
    <View style={s.rail}>
      <View style={s.brand}>
        <BrandLogo height={30} />
      </View>

      {state.routes.map((route, i) => {
        const { options } = descriptors[route.key];
        const focused = state.index === i;
        const label = options.title ?? route.name;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
            style={({ hovered, pressed }) => [
              s.item,
              // マウスで使う画面なので、乗せたときに反応させる。
              // 触れる画面と違い、押す前に「押せる」と分かる手がかりが無い。
              (hovered || pressed) && !focused && s.itemHover,
              focused && s.itemOn,
            ]}
          >
            {({ hovered }) => (
              <>
                <Ionicons
                  name={iconOf(route.name, focused)}
                  size={20}
                  color={focused ? c.accent : hovered ? c.text : c.textMuted}
                />
                <Text
                  style={[
                    s.label,
                    { color: focused ? c.accent : hovered ? c.text : c.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * 経路名から記号を引く。
 *
 * タブの並びは (tabs)/_layout.tsx が決めており、そこと同じ対応を持つ。
 * 記号を options に載せて渡すこともできるが、載せると描く側と決める側が
 * 二重になる。名前から引くほうが、増やしたときに1か所で済む。
 */
function iconOf(name: string, focused: boolean) {
  const map: Record<string, [on: string, off: string]> = {
    index: ['search', 'search-outline'],
    favorites: ['star', 'star-outline'],
    history: ['time', 'time-outline'],
    mypage: ['person', 'person-outline'],
  };
  const pair = map[name] ?? ['ellipse', 'ellipse-outline'];
  return (focused ? pair[0] : pair[1]) as keyof typeof Ionicons.glyphMap;
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    rail: {
      width: RAIL_WIDTH,
      backgroundColor: c.surface,
      borderRightWidth: 1,
      borderRightColor: c.border,
      paddingHorizontal: SPACE.md,
      paddingTop: SPACE.lg,
      gap: SPACE.xs,
    },
    brand: {
      paddingHorizontal: SPACE.sm,
      paddingBottom: SPACE.xl,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.md,
      height: 44,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.md,
      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
    },
    itemHover: { backgroundColor: c.surface2 },
    itemOn: { backgroundColor: c.accentSoft },
    label: { fontSize: 14, fontWeight: '600' },
  });
