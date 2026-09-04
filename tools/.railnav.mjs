/** 左メニューの移動を Link に変える。 */
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'app/src/components/side-rail.tsx';
let s = readFileSync(p, 'utf8');
const swap = (a, b) => {
  if (!s.includes(a)) throw new Error('見つからない: ' + JSON.stringify(a.slice(0, 70)));
  s = s.replace(a, b);
};

swap(
  `import { usePathname, useRouter } from 'expo-router';`,
  `import { Link, usePathname } from 'expo-router';`,
);

swap(
  `import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';`,
  `import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';`,
);

swap(
  `export function SideRail() {
  const c = useTheme();
  const s = makeStyles(c);
  const router = useRouter();
  const here = usePathname();`,
  `export function SideRail() {
  const c = useTheme();
  const s = makeStyles(c);
  const here = usePathname();`,
);

// 本体を Link で包む形へ
const from = s.indexOf('            return (\n              <Pressable');
const to = s.indexOf('      {/* 下半分の絵と一言 */}');
if (from < 0 || to < 0) throw new Error('行先の並びが見つかりません');

s =
  s.slice(0, from) +
  `          return (
            /*
              移動は Link に任せる。

              router.navigate を直に呼んでいたところ、URL は変わるのに
              画面が切り替わらなかった。左メニューは画面の並びの外側に
              あるため、どの並びを動かすかを自分で決められない。
              Link であれば経路の解決ごと任せられる。
            */
            <Link key={t.path} href={t.path} asChild>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                /*
                  読み上げ向けに、選ばれていることを文言でも添える。

                  accessibilityState の selected は、ブラウザ側の属性
                  （aria-selected）に落ちない。見た目では緑の下地で
                  分かるが、耳で聞く方には何も伝わらない。
                */
                accessibilityLabel={focused ? \`\${t.label}（表示中）\` : t.label}
                /*
                  見た目は1つの object にまとめて渡す。

                  Link の asChild は中身を <a> に差し替えるため、
                  配列や関数で渡すと落ちる（他の画面で実際に起きた）。
                */
                style={StyleSheet.flatten([s.item, focused && s.itemOn])}
              >
                {/* 選んでいる行先の左端に立てる線 */}
                <View style={focused ? s.bar : s.barOff} />
                <Ionicons
                  name={(focused ? t.on : t.off) as keyof typeof Ionicons.glyphMap}
                  size={20}
                  color={focused ? c.accent : c.textMuted}
                />
                <Text
                  style={[s.label, { color: focused ? c.accent : c.textMuted }]}
                  numberOfLines={1}
                >
                  {t.label}
                </Text>
              </Pressable>
            </Link>
          );
        })}
      </View>

` +
  s.slice(to);

writeFileSync(p, s);
console.log('  左メニューの移動を Link にしました');
