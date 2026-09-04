import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
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
 * **画面の並びの外側に置く**
 *   以前はタブの並びの一部として描いていた。施設の詳細やお知らせは
 *   タブの外側にある画面で、そこへ移ると左メニューごと消えていた。
 *   PC では常に見えているべきものなので、画面の外へ出し、
 *   いまどこにいるかは経路（pathname）から自分で決める。
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

/**
 * 行先の並び。
 *
 * (tabs)/_layout.tsx と同じ並び・同じ名前にすること。狭い画面では
 * あちらが下の帯を描き、広い画面ではこちらが左メニューを描く。
 */
const NAV = [
  { path: '/', label: '探す', on: 'search', off: 'search-outline' },
  { path: '/favorites', label: 'お気に入り', on: 'star', off: 'star-outline' },
  { path: '/history', label: '履歴', on: 'time', off: 'time-outline' },
  { path: '/mypage', label: 'マイページ', on: 'person', off: 'person-outline' },
] as const;

export function SideRail() {
  const c = useTheme();
  const s = makeStyles(c);
  const router = useRouter();
  const here = usePathname();

  return (
    <View style={s.rail}>
      <View style={s.brandBand}>
        <BrandLogo height={44} />
      </View>

      <View style={s.nav}>
        {NAV.map((t) => {
          /*
            いまどこにいるか。

            施設の詳細やお知らせはタブの外側にあり、どの行先にも
            当てはまらない。その場合はどれも選ばれていない形にする。
            「探す」を選んだままにすると、探す画面に居ると誤解させる。
          */
          const focused = here === t.path;

          return (
            <Pressable
              key={t.path}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              /*
                読み上げ向けに、選ばれていることを文言でも添える。

                accessibilityState の selected は、ブラウザ側の属性
                （aria-selected）に落ちない。見た目では緑の下地で
                分かるが、耳で聞く方には何も伝わらない。
              */
              accessibilityLabel={focused ? `${t.label}（表示中）` : t.label}
              onPress={() => {
                if (!focused) router.navigate(t.path);
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
                    name={(focused ? t.on : t.off) as keyof typeof Ionicons.glyphMap}
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
                    {t.label}
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
