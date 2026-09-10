import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fetchCoverage } from '@/lib/facilities';
import { useT } from '@/lib/i18n/context';
import { fill } from '@/lib/i18n/dictionaries';
import { describePlace } from '@/lib/place';
import { ensureSynced } from '@/lib/sync';
import { TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * いまどのあたりを案内できるか。
 *
 * **端末の位置が取れたらその地名を、断られたら案内できる範囲を出す。**
 *   位置を断ったことを咎める表示はしない。
 *
 * **決め打ちの地名は出さない。**
 *   登録されている施設の所在地から求める。「東京都」と書いてしまうと、
 *   対応していない場所でも案内できるように見える。
 *
 * **置き場所が2つある**（ご指示 2026-09-10）
 *   狭い画面では探す画面の頭（ロゴと入れ替えた）、広い画面では上部の帯。
 *   同じものを2度書かないよう、ここへ出した。
 */
export function Coverage({ wide = false }: { wide?: boolean }) {
  const c = useTheme();
  const t = useT();
  const s = makeStyles(c);

  const [coverage, setCoverage] = useState<{
    prefectures: string[];
    cities: number;
    total: number;
  }>({ prefectures: [], cities: 0, total: 0 });
  const [place, setPlace] = useState<string | null>(null);

  /* 端末にあるものを先に出し、取り込みの後で読み直す。 */
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
      if (alive) setPlace(name);
    });
    return () => {
      alive = false;
    };
  }, []);

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
    <View style={s.place}>
      <Ionicons name="location" size={wide ? 18 : 13} color={c.accent} />
      <View style={s.placeText}>
        <Text style={wide ? s.labelWide : s.label}>{place ? t.search.here : t.search.area}</Text>
        <Text style={wide ? s.valueWide : s.value} numberOfLines={1}>
          {place ?? area}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    place: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
    placeText: { flex: 1 },
    label: { fontSize: TEXT.small, color: c.textFaint },
    value: { fontSize: TEXT.sub, color: c.text, fontWeight: '600' },
    labelWide: { fontSize: TEXT.sub, color: c.textFaint },
    valueWide: { fontSize: TEXT.title, color: c.text, fontWeight: '700' },
  });
