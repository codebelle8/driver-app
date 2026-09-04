import Ionicons from '@expo/vector-icons/Ionicons';
// Tabs と同じ場所から型を取る。bottom-tabs を直に指すと、
// expo-router の内部構成（build/ の下）に依存してしまう。
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '@/components/brand';
import { RailArt } from '@/components/rail-art';
import type { Palette } from '@/theme';
import { RADIUS, SPACE } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 広い画面での左メニュー。
 *
 * **並び**（ご提示の画面図に合わせる）
 *   上からロゴ、区切り線、4つの行先。選んでいる行先は淡い緑を敷き、
 *   左端に濃い緑の線を立てる。下半分は絵と一言を置く。
 *
 * **なぜ下に絵を置くか**
 *   行先は4つしかなく、1024px の画面でも下に500px 以上の空白が残る。
 *   何も無い面は「作りかけ」に見える。ご提示の画面図でも、ここに
 *   街並みと車の写真が入っている。
 *
 * **自前で描いている理由**
 *   既定の左メニューは選択中の項目に明るい青を敷く。このアプリの色は
 *   緑で、青の上に濃い文字が乗って読めなかった。下地の形も、マウスを
 *   乗せたときの反応も指定では届かない。
 *
 * **幅はここで決める**
 *   自前で描くと tabBarStyle は届かない。指定していたのに左メニューが
 *   画面の半分を占めていた。
 */

/**
 * 左メニューの幅。
 *
 * 「お気に入り」「マイページ」が折り返さずに収まり、
 * ご提示の画面図の見え方（全体の 1/6 ほど）に合う幅。
 */
export const RAIL_WIDTH = 256;

/** ロゴを置く帯の高さ。右側の上部の帯と揃える。 */
export const HEADER_HEIGHT = 72;

export function SideRail({ state, descriptors, navigation }: BottomTabBarProps) {
  const c = useTheme();
  const s = makeStyles(c);

  return (
    <View style={s.rail}>
      <View style={s.brandBand}>
        <BrandLogo height={36} />
      </View>

      <View style={s.nav}>
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
                  {/* 選んでいる行先の左端に立てる線 */}
                  <View style={focused ? s.bar : s.barOff} />
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

      {/* 下半分の絵と一言 */}
      <View style={s.art}>
        <RailArt />
        <View style={s.tagline}>
          <Text style={s.taglineText}>スムーズな到着を、</Text>
          <Text style={s.taglineText}>もっと快適に。</Text>
        </View>
      </View>
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
    },
    brandBand: {
      height: HEADER_HEIGHT,
      justifyContent: 'center',
      paddingHorizontal: SPACE.xl,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    nav: { paddingTop: SPACE.lg, paddingRight: SPACE.md, gap: 2 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.md,
      height: 52,
      paddingRight: SPACE.md,
      borderTopRightRadius: RADIUS.md,
      borderBottomRightRadius: RADIUS.md,
      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
    },
    itemHover: { backgroundColor: c.surface2 },
    itemOn: { backgroundColor: c.accentSoft },
    /*
      左端の線は、選んでいないときも同じ幅だけ場所を取る。

      色だけを変えると、選ぶたびに文字が3px 横へ動いてしまう。
    */
    bar: {
      width: 3,
      alignSelf: 'stretch',
      backgroundColor: c.accent,
      marginRight: SPACE.lg - 3,
    },
    barOff: { width: 3, marginRight: SPACE.lg - 3 },
    label: { fontSize: 15, fontWeight: '600' },

    art: { flex: 1, justifyContent: 'flex-end' },
    tagline: { padding: SPACE.xl },
    taglineText: {
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '600',
      color: c.textMuted,
    },
  });
