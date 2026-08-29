import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand';
import { ScrollTopButton } from '@/components/scroll-top-button';
import { fetchCategories, PAGE_SIZE, searchFacilities } from '@/lib/facilities';
import { describeSyncedAt, ensureSynced, type SyncResult } from '@/lib/sync';
import type { Category, Facility } from '@/lib/types';
import { HIT_SLOP, RADIUS, SPACE, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 施設を探す画面。
 *
 * 画面は2つの状態を持つ。
 *   何も入れていないとき … カテゴリと最近見た施設を並べる（下見の画面）
 *   絞り込んでいるとき   … 該当した施設だけを並べる（探している画面）
 *
 * 1つの画面で切り替えるのは、走行前に画面を行き来させないため。
 */

/** カテゴリの区分ごとの記号。データ側に持たせるほどのものではない。 */
const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  hotel: 'bed',
  residence: 'home',
  commercial: 'storefront',
  office: 'business',
  hospital: 'medkit',
  station: 'train',
};

/** カテゴリの説明。一覧では名前だけでは何を指すか伝わりにくい。 */
const CATEGORY_HINT: Record<string, string> = {
  hotel: '宿泊施設を探す',
  residence: 'レジデンスを探す',
  commercial: '商業施設を探す',
  office: 'オフィスビルを探す',
  hospital: '病院・クリニック',
  station: '駅・空港を探す',
};

export default function SearchScreen() {
  const c = useTheme();
  const styles = makeStyles(c);

  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [recent, setRecent] = useState<Facility[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sync, setSync] = useState<SyncResult>({
    ok: true,
    facilityCount: 0,
    syncedAt: null,
  });
  const [atTop, setAtTop] = useState(true);

  const listRef = useRef<FlatList<Facility>>(null);
  const isFiltered = Boolean(query.trim() || categoryId);

  // 起動時に一度だけ取り込む
  useEffect(() => {
    let alive = true;
    (async () => {
      const result = await ensureSynced();
      if (!alive) return;
      setSync(result);
      const [cats, first] = await Promise.all([
        fetchCategories(),
        searchFacilities({ offset: 0 }),
      ]);
      if (!alive) return;
      setCategories(cats);
      // 「最近」の代わりに、いまは先頭の数件を出す。
      // 閲覧履歴を残す仕組みは運用版で入れる。
      setRecent(first.rows.slice(0, 3));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const page = await searchFacilities({ query, categoryId, offset: 0 });
    setFacilities(page.rows);
    setHasMore(page.hasMore);
    setLoading(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [query, categoryId]);

  useEffect(() => {
    if (!isFiltered) return;
    const id = setTimeout(load, 200);
    return () => clearTimeout(id);
  }, [isFiltered, load]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const page = await searchFacilities({ query, categoryId, offset: facilities.length });
    setFacilities((prev) => [...prev, ...page.rows]);
    setHasMore(page.hasMore);
    setLoadingMore(false);
  }

  const chips = useMemo(
    () => categories.filter((cat) => CATEGORY_ICON[cat.code]),
    [categories],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 上部。現在地と知らせ。 */}
      <View style={styles.topBar}>
        <Pressable hitSlop={HIT_SLOP} accessibilityLabel="メニュー" style={styles.topIcon}>
          <Ionicons name="menu" size={22} color={c.text} />
        </Pressable>

        <View style={styles.place}>
          <Ionicons name="location" size={13} color={c.accent} />
          <View style={styles.placeText}>
            <Text style={styles.placeLabel}>現在地</Text>
            <Text style={styles.placeValue} numberOfLines={1}>
              {sync.facilityCount > 0 ? '東京都千代田区' : '取得していません'}
            </Text>
          </View>
        </View>

        <Pressable hitSlop={HIT_SLOP} accessibilityLabel="お知らせ" style={styles.topIcon}>
          <Ionicons name="notifications-outline" size={21} color={c.text} />
        </Pressable>
      </View>

      {/* 見出しと検索欄 */}
      <View style={styles.head}>
        {/* 文字の見出しではなくロゴを置く。名乗りはロゴが担う。 */}
        <BrandLogo height={34} />
        <Text style={styles.lead}>行きたい場所を見つけよう</Text>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={c.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="施設名・よみがな・住所"
            placeholderTextColor={c.textFaint}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={HIT_SLOP} accessibilityLabel="消す">
              <Ionicons name="close-circle" size={18} color={c.textFaint} />
            </Pressable>
          ) : (
            <Ionicons name="options-outline" size={18} color={c.textFaint} />
          )}
        </View>
      </View>

      {isFiltered ? (
        <ResultList
          listRef={listRef}
          facilities={facilities}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onEndReached={loadMore}
          onScrollChange={setAtTop}
          onClear={() => {
            setQuery('');
            setCategoryId(null);
          }}
          styles={styles}
          c={c}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.browse} showsVerticalScrollIndicator={false}>
          <SectionHead title="カテゴリから探す" styles={styles} />
          <View style={styles.grid}>
            {chips.map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() => setCategoryId(cat.id)}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                accessibilityRole="button"
              >
                <View style={styles.cardIcon}>
                  <Ionicons name={CATEGORY_ICON[cat.code]} size={20} color={c.accent} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{cat.name}</Text>
                  <Text style={styles.cardHint} numberOfLines={1}>
                    {CATEGORY_HINT[cat.code] ?? '施設を探す'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>

          <SectionHead title="最近見たスポット" styles={styles} />
          <View style={styles.recentBox}>
            {recent.map((f) => (
              <Link key={f.id} href={`/facility/${f.id}`} asChild>
                <Pressable style={styles.recentRow} accessibilityRole="link">
                  <View style={styles.recentIcon}>
                    <Ionicons name="time-outline" size={16} color={c.textMuted} />
                  </View>
                  <View style={styles.recentBody}>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {f.name}
                    </Text>
                    <Text style={styles.recentAddress} numberOfLines={1}>
                      {f.prefecture}
                      {f.city ?? ''}
                      {f.address_line}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
                </Pressable>
              </Link>
            ))}
            {recent.length === 0 && !loading && (
              <Text style={styles.recentEmpty}>まだ見た施設がありません</Text>
            )}
          </View>

          <Text style={styles.foot}>
            端末に {sync.facilityCount} 件（{describeSyncedAt(sync.syncedAt)}に取得）
          </Text>
        </ScrollView>
      )}

      <ScrollTopButton
        visible={isFiltered && !atTop}
        onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
      />
    </SafeAreaView>
  );
}

/** 「カテゴリから探す ─ すべて見る」の並び */
function SectionHead({
  title,
  styles,
}: {
  title: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionMore}>すべて見る</Text>
    </View>
  );
}

/** 絞り込んだときに出る一覧 */
function ResultList({
  listRef,
  facilities,
  loading,
  loadingMore,
  hasMore,
  onEndReached,
  onScrollChange,
  onClear,
  styles,
  c,
}: {
  listRef: React.RefObject<FlatList<Facility> | null>;
  facilities: Facility[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onEndReached: () => void;
  onScrollChange: (atTop: boolean) => void;
  onClear: () => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  return (
    <FlatList
      ref={listRef}
      data={facilities}
      keyExtractor={(f) => f.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      onScroll={(e) => onScrollChange(e.nativeEvent.contentOffset.y < 240)}
      scrollEventThrottle={64}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={styles.resultHead}>
          <Text style={styles.resultCount}>
            該当 {facilities.length} 件{hasMore ? '（さらにあり）' : ''}
          </Text>
          <Pressable onPress={onClear} hitSlop={HIT_SLOP}>
            <Text style={styles.resultClear}>絞り込みを外す</Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator style={styles.spinner} color={c.accent} />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={28} color={c.textFaint} />
            <Text style={styles.emptyTitle}>見つかりませんでした</Text>
            <Text style={styles.emptyBody}>
              施設名・よみがな・住所のいずれかでお試しください。
            </Text>
          </View>
        )
      }
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.loadingMore}>
            <ActivityIndicator color={c.accent} />
          </View>
        ) : null
      }
      renderItem={({ item }) => <FacilityRow facility={item} styles={styles} c={c} />}
    />
  );
}

function FacilityRow({
  facility,
  styles,
  c,
}: {
  facility: Facility;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  return (
    <Link href={`/facility/${facility.id}`} asChild>
      <Pressable style={styles.row} accessibilityRole="link">
        <View style={styles.rowIcon}>
          <Ionicons name="location" size={16} color={c.accent} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={1}>
            {facility.name}
          </Text>
          <Text style={styles.rowAddress} numberOfLines={1}>
            {facility.prefecture}
            {facility.city ?? ''}
            {facility.address_line}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
      </Pressable>
    </Link>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },

    // --- 上部 ---
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      paddingHorizontal: SPACE.lg,
      paddingTop: SPACE.sm,
      paddingBottom: SPACE.md,
    },
    topIcon: { width: 28, alignItems: 'center' },
    place: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
    placeText: { flex: 1 },
    placeLabel: { fontSize: 10, color: c.textFaint },
    placeValue: { fontSize: 12, color: c.text, fontWeight: '600' },

    // --- 見出しと検索欄 ---
    head: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md },
    lead: { fontSize: 13, color: c.textMuted, marginTop: 6 },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      marginTop: SPACE.md,
      paddingHorizontal: SPACE.md,
      height: 46,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    input: { flex: 1, fontSize: 14, color: c.text, paddingVertical: 0 },

    // --- 下見の画面 ---
    browse: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xl },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACE.md,
      marginBottom: SPACE.sm,
    },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    sectionMore: { fontSize: 12, color: c.accent, fontWeight: '600' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
    card: {
      // 2列。間の隙間ぶんを引く。
      width: '48%',
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardPressed: { borderColor: c.accent, backgroundColor: c.surface2 },
    cardIcon: {
      width: 38,
      height: 38,
      borderRadius: RADIUS.sm,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardText: { flex: 1 },
    cardTitle: { fontSize: 13, fontWeight: '700', color: c.text },
    cardHint: { fontSize: 10, color: c.textMuted, marginTop: 1 },

    recentBox: {
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    recentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    recentIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recentBody: { flex: 1 },
    recentName: { fontSize: 13, fontWeight: '700', color: c.text },
    recentAddress: { fontSize: 11, color: c.textMuted, marginTop: 1 },
    recentEmpty: { padding: SPACE.lg, fontSize: 12, color: c.textFaint, textAlign: 'center' },

    foot: { marginTop: SPACE.lg, fontSize: 11, color: c.textFaint, textAlign: 'center' },

    // --- 絞り込みの結果 ---
    list: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xl },
    resultHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: SPACE.sm,
    },
    resultCount: { fontSize: 12, color: c.textMuted },
    resultClear: { fontSize: 12, color: c.accent, fontWeight: '600' },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      padding: SPACE.md,
      marginBottom: SPACE.sm,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowIcon: {
      width: 34,
      height: 34,
      borderRadius: RADIUS.sm,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: { flex: 1 },
    rowName: { fontSize: 14, fontWeight: '700', color: c.text },
    rowAddress: { fontSize: 11, color: c.textMuted, marginTop: 1 },

    spinner: { marginTop: SPACE.xl },
    loadingMore: { paddingVertical: SPACE.lg },
    empty: { alignItems: 'center', gap: 6, paddingTop: SPACE.xl },
    emptyTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    emptyBody: { fontSize: 12, color: c.textMuted, textAlign: 'center' },
  });
}
