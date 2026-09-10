import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, usePathname } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountMenu } from '@/components/account-menu';
import { useAccount } from '@/lib/account-context';
import { HEADER_HEIGHT } from '@/components/side-rail';
import { fetchCoverage } from '@/lib/facilities';
import { useT } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/dictionaries';
import { PAGE_MAX, PAGE_PAD, useLayout } from '@/lib/layout';
import { countUnread, fetchNotices, getRead } from '@/lib/notices';
import { describePlace } from '@/lib/place';
import { ensureSynced } from '@/lib/sync';
import { useLocale } from '@/lib/i18n/context';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * どの画面にも出す上部の帯。
 *
 * **画面の並びの外に置く**
 *   ご指示により、どの機能を開いていても出したままにする。画面ごとに
 *   置くと、置き忘れた画面だけ帯が消え、そこだけ知らせに気づけない。
 *   画面の並び（Stack）の外へ1つだけ置く（app/_layout.tsx）。
 *
 * **上の余白はここが持つ**
 *   帯が最上段になったので、切り欠き（ノッチ）の下へ逃がすのはここの
 *   役目になる。各画面の SafeAreaView からは top を外してある。
 *   両方で取ると、その分だけ二重に空く。
 *
 * **読み直す合図は道筋の変化**
 *   画面の並びの外にあるため、画面ごとの「戻ってきた」を受け取れない
 *   （useFocusEffect が効かない）。いまの道筋が変わったことを合図に
 *   未読を数え直す。お知らせを読んで戻れば、その時点で数が減る。
 *
 * **場所は現在地を優先する**
 *   端末の位置が取れたらその地名を、断られたら案内できる範囲を出す。
 *   位置を断ったことを咎める表示はしない。
 */
export function TopBar() {
  const c = useTheme();
  const t = useT();
  const { locale } = useLocale();
  const { account } = useAccount();
  const { isWide } = useLayout();
  const styles = makeStyles(c);
  const pathname = usePathname();

  const [coverage, setCoverage] = useState<{
    prefectures: string[];
    cities: number;
    total: number;
  }>({ prefectures: [], cities: 0, total: 0 });
  const [place, setPlace] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(0);

  /* 案内できる範囲。端末にあるものを先に出し、取り込みの後で読み直す。 */
  useEffect(() => {
    let alive = true;
    (async () => {
      const first = await fetchCoverage();
      if (!alive) return;
      setCoverage(first);

      await ensureSynced();
      const after = await fetchCoverage();
      if (alive) setCoverage(after);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* 現在地。断られたら、案内できる範囲のままにする。 */
  useEffect(() => {
    let alive = true;
    describePlace().then((name) => {
      if (alive && name) setPlace(name);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* 未読の数。画面を移るたびに数え直す。 */
  useEffect(() => {
    let alive = true;
    (async () => {
      const [notices, read] = await Promise.all([fetchNotices(locale, account), getRead()]);
      if (alive) setUnseen(countUnread(notices, read));
    })();
    return () => {
      alive = false;
    };
    // 会員の状態が変わったら数え直す。払った時点で期限の知らせは消える。
  }, [pathname, locale, account]);

  /**
   * 案内できる範囲。登録されている施設の所在地から求める。
   *
   * 都道府県が1つなら県名、複数なら件数で示す。
   * 決め打ちの地名を出すと、対応していない場所でも案内できるように見える。
   */
  const area = useMemo(() => {
    if (coverage.total === 0) return t.search.waiting;
    const { prefectures, cities } = coverage;
    if (prefectures.length === 1) {
      const name = prefectures[0];
      return cities > 1 ? fill(t.search.areaOne, { name, n: coverage.total }) : name;
    }
    if (prefectures.length > 1) {
      return fill(t.search.areaMore, { name: prefectures[0], n: coverage.total });
    }
    return fill(t.search.registered, { n: coverage.total });
  }, [coverage, t]);

  return (
    <SafeAreaView edges={['top']} style={[styles.bar, isWide && styles.barWide]}>
      <View style={isWide ? styles.inner : styles.row}>
        <View style={styles.place}>
          <Ionicons name="location" size={isWide ? 18 : 13} color={c.accent} />
          <View style={styles.placeText}>
            <Text style={isWide ? styles.placeLabelWide : styles.placeLabel}>
              {place ? t.search.here : t.search.area}
            </Text>
            <Text style={isWide ? styles.placeValueWide : styles.placeValue} numberOfLines={1}>
              {place ?? area}
            </Text>
          </View>
        </View>

        <BellButton unseen={unseen} wide={isWide} styles={styles} c={c} />
        {/* 顔写真は鐘の右端。登録していない方には出ない。 */}
        <AccountMenu compact={!isWide} />
      </View>
    </SafeAreaView>
  );
}

/**
 * お知らせの鐘。
 *
 * **押せることが分かるようにする**
 *   記号を置いただけでは、マウスを乗せても押しても見た目が変わらない。
 *   マウスで使う画面では、触れる画面と違って「押せる」手がかりが
 *   見た目にしかない。乗せたら下地を敷き、押したら濃くする。
 *
 * **未読があるときは塗りつぶす**
 *   数の札だけだと、札が小さく見落とされる。鐘そのものの形を変える。
 *
 * **見た目は内側の View に持たせる**
 *   Link の asChild は中身を <a> に差し替えるため、Pressable 向けの
 *   関数形式や配列の style は届かない（配列は画面ごと落ちる）。
 *   状態は Pressable で受け、描くのは内側に任せる。
 */
function BellButton({
  unseen,
  wide,
  styles,
  c,
}: {
  unseen: number;
  wide?: boolean;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const on = unseen > 0;

  return (
    <Link href="/notices" asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={on ? fill(t.search.noticesCount, { n: unseen }) : t.search.notices}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => {
          setHovered(false);
          setPressed(false);
        }}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={styles.bellHit}
      >
        <View
          style={StyleSheet.flatten([
            styles.bell,
            hovered && styles.bellHover,
            pressed && styles.bellPressed,
          ])}
        >
          <Ionicons
            name={on ? 'notifications' : 'notifications-outline'}
            size={wide ? 23 : 21}
            color={on || hovered || pressed ? c.accent : c.text}
          />
          {/*
            実際の件数を出す。9+ で丸めていたが、1件読んでも表示が
            変わらず、読んだことが伝わらなかった。
            三桁になると札に収まらないため、そこだけ 99+ とする。
          */}
          {on && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unseen > 99 ? '99+' : unseen}</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    bar: {
      backgroundColor: c.bg,
      paddingHorizontal: SPACE.lg,
      paddingTop: SPACE.sm,
      paddingBottom: SPACE.md,
    },
    /*
      広い画面。左メニューのロゴ帯と同じ高さにして、画面を横一直線に区切る。
    */
    barWide: {
      height: HEADER_HEIGHT,
      paddingTop: 0,
      paddingBottom: 0,
      paddingHorizontal: 0,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    /* 狭い画面。帯そのものの並び。 */
    row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
    /*
      広い画面。中身を本文と同じ列に収める。

      余白は列の内側で取る。外側で取ると、列を中央へ寄せる計算がその
      内側で行われ、中身の左端が本文より余白1つぶん外へ出る。
    */
    inner: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.md,
      width: '100%',
      maxWidth: PAGE_MAX,
      alignSelf: 'center',
      paddingHorizontal: PAGE_PAD,
    },

    place: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
    placeText: { flex: 1 },
    placeLabel: { fontSize: TEXT.small, color: c.textFaint },
    placeValue: { fontSize: TEXT.sub, color: c.text, fontWeight: '600' },
    placeLabelWide: { fontSize: TEXT.sub, color: c.textFaint },
    placeValueWide: { fontSize: TEXT.title, color: c.text, fontWeight: '700' },

    /*
      鐘。当たり判定は広く、下地は記号のまわりだけ。

      当たり判定まで丸く塗ると、上部の帯の中で大きすぎる丸になる。
    */
    bellHit: { padding: 4 },
    bell: {
      width: 38,
      height: 38,
      borderRadius: RADIUS.lg + 3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bellHover: { backgroundColor: c.surface2 },
    bellPressed: { backgroundColor: c.accentSoft },
    badge: {
      position: 'absolute',
      top: -4,
      right: -2,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 3,
      backgroundColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { fontSize: TEXT.small, fontWeight: '800', color: '#ffffff' },
  });
}
