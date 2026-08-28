import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand';
import { CategoryStrip, type CategoryItem } from '@/components/category-strip';
import { ScrollTopButton } from '@/components/scroll-top-button';
import { fetchCategories, PAGE_SIZE, searchFacilities } from '@/lib/facilities';
import { describeSyncedAt, ensureSynced, resync, type SyncResult } from '@/lib/sync';
import type { Category, Facility } from '@/lib/types';
import { HIT, RADIUS, SPACE, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 入力が止まってから検索するまでの待ち時間。
 * 端末内を引くだけなので短くてよいが、1文字ごとに引き直すと
 * 描画が追いつかず入力が引っかかる。
 */
const DEBOUNCE_MS = 150;

/**
 * カテゴリの絵記号。
 * 走行前の限られた時間で選ぶため、文字より形で見分けられるようにする。
 * データベース側の code と対応させている。
 */
const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  hotel: 'bed-outline',
  residence: 'home-outline',
  commercial: 'storefront-outline',
  office: 'business-outline',
  hospital: 'medkit-outline',
  station: 'train-outline',
};

export default function SearchScreen() {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sync, setSync] = useState<SyncResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showTop, setShowTop] = useState(false);

  // 遅れて届いた古い結果が新しい結果を上書きしないよう、世代を持たせる
  const generation = useRef(0);
  const listRef = useRef<FlatList<Facility>>(null);

  /** 先頭から読み直す。検索語やカテゴリが変わったとき。 */
  const load = useCallback(async (q: string, cat: string | null) => {
    const mine = ++generation.current;
    const page = await searchFacilities({ query: q, categoryId: cat, offset: 0 });
    if (mine !== generation.current) return;
    setFacilities(page.rows);
    setHasMore(page.hasMore);

    /*
      一覧の位置も先頭へ戻す。
      戻さないと、下端に居るまま中身だけが入れ替わり、
      その場で追加読み込みが走って絞り込んだ意味が消える。
      利用者から見ても、押した直後に別の施設が並ぶことになる。
    */
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  /**
   * 続きを読み込む。
   *
   * 読み込み中に再度呼ばれないよう見張っている。下端で指を止めると
   * onEndReached が続けて発火し、同じ範囲を二重に足してしまう。
   */
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const mine = generation.current;
    try {
      const page = await searchFacilities({
        query,
        categoryId,
        offset: facilities.length,
      });
      if (mine !== generation.current) return;
      setFacilities((current) => [...current, ...page.rows]);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, query, categoryId, facilities.length]);

  // 取り込みが終わるまで検索しない。終わる前に引くと、
  // 前回の内容を一瞬出してから差し替わり、ちらつく。
  useEffect(() => {
    ensureSynced().then(async (result) => {
      setSync(result);
      setCategories(await fetchCategories());
      await load('', null);
    });
  }, [load]);

  useEffect(() => {
    if (!sync) return;
    const timer = setTimeout(() => load(query, categoryId), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, categoryId, sync, load]);

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const result = await resync();
    setSync(result);
    setCategories(await fetchCategories());
    await load(query, categoryId);
    setRefreshing(false);
  }, [query, categoryId, load]);

  const categoryById = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat])),
    [categories],
  );

  const categoryItems = useMemo<CategoryItem[]>(() => {
    if (categories.length === 0) return [];
    return [
      {
        key: 'all',
        label: 'すべて',
        icon: 'apps-outline',
        active: categoryId === null,
        onPress: () => setCategoryId(null),
      },
      ...categories.map((cat) => ({
        key: cat.id,
        label: cat.name,
        icon: CATEGORY_ICON[cat.code] ?? ('location-outline' as const),
        active: categoryId === cat.id,
        onPress: () => setCategoryId(cat.id === categoryId ? null : cat.id),
      })),
    ];
  }, [categories, categoryId]);
  const loading = sync === null;
  const isFiltered = query.trim() !== '' || categoryId !== null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.top}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={c.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="施設名・よみがな・住所"
            placeholderTextColor={c.textFaint}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="施設を検索"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="入力を消す"
            >
              <Ionicons name="close-circle" size={20} color={c.textFaint} />
            </Pressable>
          )}
        </View>

        {categoryItems.length > 0 && <CategoryStrip items={categoryItems} />}
      </View>

      {/*
        取り込めなかったことは伝えるが、使える状態なら妨げない。
        圏外での起動は異常ではなく、想定された使い方にあたる。
      */}
      {sync && !sync.ok && (
        <View style={sync.facilityCount > 0 ? styles.noticeMild : styles.notice}>
          <Ionicons
            name={sync.facilityCount > 0 ? 'cloud-offline-outline' : 'alert-circle-outline'}
            size={18}
            color={sync.facilityCount > 0 ? c.warn : c.danger}
          />
          <Text style={sync.facilityCount > 0 ? styles.noticeMildText : styles.noticeText}>
            {sync.message}
          </Text>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={facilities}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onEndReached={loadMore}
        // 下端に着いてから読み始めると間に合わない。
        // 残り半画面ほどで先に取りにいく。
        onEndReachedThreshold={0.5}
        onScroll={(e) => setShowTop(e.nativeEvent.contentOffset.y > 400)}
        scrollEventThrottle={64}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.accent}
            colors={[c.accent]}
          />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.spinner} color={c.accent} />
          ) : (
            <View style={styles.empty}>
              <BrandMark size={64} opacity={0.22} />
              <Text style={styles.emptyTitle}>
                {query ? '見つかりませんでした' : 'まだ施設が登録されていません'}
              </Text>
              <Text style={styles.emptyBody}>
                {query
                  ? '別のよみかたや、通称でもお試しください。'
                  : '登録が済みしだい、こちらに表示されます。'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          <View style={styles.footerWrap}>
            {/* 続きを読み込んでいる間は、次が来ることを示す */}
            {loadingMore && (
              <View style={styles.loadingMore}>
                <ActivityIndicator color={c.accent} />
                <Text style={styles.footerText}>次の {PAGE_SIZE} 件を読み込んでいます</Text>
              </View>
            )}

            {sync && (
              <View style={styles.footer}>
                <Ionicons
                  name={sync.ok ? 'checkmark-circle-outline' : 'cloud-offline-outline'}
                  size={14}
                  color={c.textFaint}
                />
                {/*
                  絞り込んでいるときに「0 / 35 件」と出すと、35 が
                  絞り込み後の総数だと誤解される。35 は端末内の総数なので、
                  表示中の件数とは分けて書く。
                */}
                <Text style={styles.footerText}>
                  {isFiltered
                    ? `該当 ${facilities.length} 件${hasMore ? '（さらにあり）' : ''}`
                    : `${facilities.length} / ${sync.facilityCount} 件`}
                  ・端末に {sync.facilityCount} 件（{describeSyncedAt(sync.syncedAt)}に取得）
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <FacilityRow
            facility={item}
            category={categoryById.get(item.category_id)}
            styles={styles}
            c={c}
          />
        )}
      />

      <ScrollTopButton visible={showTop} onPress={scrollToTop} />
    </SafeAreaView>
  );
}

function FacilityRow({
  facility,
  category,
  styles,
  c,
}: {
  facility: Facility;
  category?: Category;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  return (
    <Link href={{ pathname: '/facility/[id]', params: { id: facility.id } }} asChild>
      <Pressable style={styles.row} accessibilityRole="link">
        <View style={styles.rowIcon}>
          <Ionicons
            name={(category && CATEGORY_ICON[category.code]) ?? 'location-outline'}
            size={22}
            color={c.accent}
          />
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
          {facility.aliases.length > 0 && (
            <Text style={styles.rowAlias} numberOfLines={1}>
              {facility.aliases.join('・')}
            </Text>
          )}
        </View>

        <Ionicons name="chevron-forward" size={20} color={c.textFaint} />
      </Pressable>
    </Link>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // 一覧側は一段暗く（明るい表示では一段濃く）して、操作部と分ける
    safe: { flex: 1, backgroundColor: c.bgSub },

    /*
      検索欄とカテゴリを1つの面としてまとめ、一覧と分ける。

      見出し（ロゴ）と同じ地の色にし、下辺に境界線を引くことで、
      「操作する場所」と「結果が並ぶ場所」が分かれて見える。
      境界線だけでは弱いため、一覧側の地の色も一段落とす。
    */
    top: {
      backgroundColor: c.surface,
      paddingTop: SPACE.md,
      borderBottomWidth: 1,
      borderBottomColor: c.borderStrong,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      marginHorizontal: SPACE.lg,
      height: HIT.primary,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface2,
      paddingHorizontal: SPACE.lg,
    },
    input: { flex: 1, fontSize: 17, color: c.text, padding: 0 },


    // 手元に何も無い場合。使えないので強く出す。
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACE.sm,
      margin: SPACE.lg,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      backgroundColor: c.dangerSoft,
    },
    noticeText: { flex: 1, color: c.danger, fontSize: 15, lineHeight: 21 },

    // 手元に前回の内容がある場合。使えるので控えめに出す。
    noticeMild: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACE.sm,
      marginHorizontal: SPACE.lg,
      marginTop: SPACE.md,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      backgroundColor: c.warnSoft,
    },
    noticeMildText: { flex: 1, color: c.warn, fontSize: 14, lineHeight: 20 },

    list: { padding: SPACE.lg, gap: SPACE.md },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.md,
      padding: SPACE.lg,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowIcon: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.sm,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: { flex: 1, gap: 2 },
    rowName: { fontSize: 17, fontWeight: '700', color: c.text },
    rowAddress: { fontSize: 14, color: c.textMuted },
    rowAlias: { fontSize: 13, color: c.textFaint },

    spinner: { marginTop: SPACE.xl },
    empty: { alignItems: 'center', paddingVertical: 40, gap: SPACE.md },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    emptyBody: { fontSize: 14, color: c.textMuted, textAlign: 'center' },

    footerWrap: { gap: SPACE.lg, marginTop: SPACE.lg },
    loadingMore: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACE.sm,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    footerText: { fontSize: 12, color: c.textFaint },
  });
}
