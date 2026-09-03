import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect } from 'expo-router';
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
import {
  fetchCategories,
  fetchCoverage,
  PAGE_SIZE,
  searchFacilities,
} from '@/lib/facilities';
import { fetchHistory, type HistoryEntry } from '@/lib/history';
import { countUnread, fetchNotices, getRead } from '@/lib/notices';
import { describePlace } from '@/lib/place';
import { describeSyncedAt, ensureSynced, resync, type SyncResult } from '@/lib/sync';
import { describeWhen } from '@/lib/when';
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

/**
 * 探す画面に出す履歴の件数。
 *
 * ここは入口であって履歴の一覧ではない。全部を出すと、
 * その下のカテゴリや検索欄が画面から押し出される。
 */
const RECENT_COUNT = 3;

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
  /** 直近に見た施設。履歴の先頭ぶん。 */
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  /** 案内できる範囲（都道府県と、その中の市区町村の数） */
  const [coverage, setCoverage] = useState<{
    prefectures: string[];
    cities: number;
    total: number;
  }>({ prefectures: [], cities: 0, total: 0 });
  /** 履歴の総数。「すべて見る」に添える。 */
  const [historyCount, setHistoryCount] = useState(0);
  /** 絞り込まずに全件を並べているか */
  const [showAll, setShowAll] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  /** 取り込みを試している最中か。失敗の表示と押し分ける。 */
  const [syncing, setSyncing] = useState(true);
  /** 絞り込みに当てはまる総数。画面に出ている件数とは別。 */
  const [matched, setMatched] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sync, setSync] = useState<SyncResult>({
    ok: true,
    facilityCount: 0,
    syncedAt: null,
  });
  const [atTop, setAtTop] = useState(true);
  const [unseen, setUnseen] = useState(0);

  const listRef = useRef<FlatList<Facility>>(null);
  const isFiltered = Boolean(query.trim() || categoryId || showAll);

  /*
    起動時の流れ。

    **端末にあるものを先に出し、取り込みは後ろで走らせる。**

    以前は取り込みの完了を待ってから画面を組み立てていた。
    そのため電波の悪い場所では、端末に使えるデータがあるにもかかわらず
    「読み込み中」のまま止まって見えた。地下駐車場で使うアプリとして
    本末転倒だったので、順序を入れ替えた。

    取り込みが終わったら、その結果で静かに描き直す。
  */
  const readLocal = useCallback(async () => {
    const [cats, area] = await Promise.all([fetchCategories(), fetchCoverage()]);
    return { cats, area };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      // 1. 端末にあるものを、通信を待たずに出す
      const { cats, area } = await readLocal();
      if (!alive) return;
      setCategories(cats);
      setCoverage(area);
      setSync((prev) => ({ ...prev, facilityCount: area.total }));
      setLoading(false);

      const [notices, read] = await Promise.all([fetchNotices(), getRead()]);
      if (alive) setUnseen(countUnread(notices, read));
    })();

    (async () => {
      // 2. 取り込みは後ろで走らせ、終わったら描き直す
      const result = await ensureSynced();
      if (!alive) return;
      setSync(result);
      setSyncing(false);

      const { cats, area } = await readLocal();
      if (!alive) return;
      setCategories(cats);
      setCoverage(area);

      const [notices, read] = await Promise.all([fetchNotices(), getRead()]);
      if (alive) setUnseen(countUnread(notices, read));
    })();

    return () => {
      alive = false;
    };
  }, [readLocal]);

  /*
    この画面へ戻るたびに、お知らせの未読数と履歴を読み直す。

    施設を見てから戻ってくるのが普通の流れなので、最初の一度だけ
    読む作りだと、いま見た施設が「最近見たスポット」に出てこない。
  */
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        /*
          取り込みの完了を待ってから読む。

          取り込みは施設をいったん全部消してから入れ直す。その最中に
          履歴を引くと、まだ入っていない施設が「無いもの」として
          落とされ、履歴が虫食いになる。
          ensureSynced は結果を控えているので、2回目以降は待たない。

          ここは画面を出したあとの更新なので、待っても画面は止まらない。
        */
        await ensureSynced();
        const [notices, read, history] = await Promise.all([
          fetchNotices(),
          getRead(),
          fetchHistory(),
        ]);
        if (!alive) return;
        setUnseen(countUnread(notices, read));
        setRecent(history.slice(0, RECENT_COUNT));
        setHistoryCount(history.length);
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  /*
    取り込み直す。

    失敗したまま何もできないのは、利用者にとって行き止まりにあたる。
    電波の届く場所へ移動したあと、その場でやり直せるようにする。
  */
  const retry = useCallback(async () => {
    setSyncing(true);
    const result = await resync();
    setSync(result);
    setSyncing(false);

    const { cats, area } = await readLocal();
    setCategories(cats);
    setCoverage(area);
  }, [readLocal]);

  const load = useCallback(async () => {
    setLoading(true);
    const page = await searchFacilities({ query, categoryId, offset: 0 });
    setFacilities(page.rows);
    setMatched(page.total);
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
    setMatched(page.total);
    setHasMore(page.hasMore);
    setLoadingMore(false);
  }

  /** 見出しに出す、いま効いている絞り込み */
  const filterLabel = useMemo(() => {
    const cat = categories.find((x) => x.id === categoryId);
    if (query.trim() && cat) return `${cat.name}・「${query.trim()}」`;
    if (cat) return cat.name;
    if (query.trim()) return `「${query.trim()}」`;
    return 'すべての施設';
  }, [categories, categoryId, query]);

  const chips = useMemo(
    () => categories.filter((cat) => CATEGORY_ICON[cat.code]),
    [categories],
  );

  /**
   * 案内できる範囲。登録されている施設の所在地から求める。
   *
   * 都道府県が1つなら県名、複数なら件数で示す。
   * 決め打ちの地名を出すと、対応していない場所でも案内できるように見える。
   */
  const area = useMemo(() => {
    if (sync.facilityCount === 0) return '取り込み待ち';
    const { prefectures, cities } = coverage;
    if (prefectures.length === 1) {
      const name = prefectures[0];
      return cities > 1 ? `${name}（${sync.facilityCount}件）` : name;
    }
    if (prefectures.length > 1) {
      return `${prefectures[0]} ほか（${sync.facilityCount}件）`;
    }
    return `${sync.facilityCount} 件を登録`;
  }, [coverage, sync.facilityCount]);

  /*
    端末の現在地。

    許可されなければ、案内できる範囲の表示のままにする。
    位置を断ったからといって、施設を探せなくなる理由はない。
  */
  const [place, setPlace] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    describePlace().then((name) => {
      if (alive && name) setPlace(name);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 上部。現在地と知らせ。 */}
      <View style={styles.topBar}>
        <Pressable hitSlop={HIT_SLOP} accessibilityLabel="メニュー" style={styles.topIcon}>
          <Ionicons name="menu" size={22} color={c.text} />
        </Pressable>

        {/*
          端末の位置が取れたらその地名を、取れなければ案内できる範囲を出す。
          位置が取れないことを咎める表示はしない。断るのも選択のうち。
        */}
        <View style={styles.place}>
          <Ionicons name="location" size={13} color={c.accent} />
          <View style={styles.placeText}>
            <Text style={styles.placeLabel}>{place ? '現在地' : '案内できる範囲'}</Text>
            <Text style={styles.placeValue} numberOfLines={1}>
              {place ?? area}
            </Text>
          </View>
        </View>

        <Link href="/notices" asChild>
          <Pressable
            hitSlop={HIT_SLOP}
            accessibilityLabel={
              unseen > 0 ? `お知らせ ${unseen} 件` : 'お知らせ'
            }
            style={styles.topIcon}
          >
            <Ionicons name="notifications-outline" size={21} color={c.text} />
            {/*
              実際の件数を出す。9+ で丸めていたが、1件読んでも表示が
              変わらず、読んだことが伝わらなかった。
              三桁になると札に収まらないため、そこだけ 99+ とする。
            */}
            {unseen > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unseen > 99 ? '99+' : unseen}</Text>
              </View>
            )}
          </Pressable>
        </Link>
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
          onEndReached={loadMore}
          onScrollChange={setAtTop}
          label={filterLabel}
          matched={matched}
          total={sync.facilityCount}
          onClear={() => {
            setQuery('');
            setCategoryId(null);
            setShowAll(false);
          }}
          styles={styles}
          c={c}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.browse} showsVerticalScrollIndicator={false}>
          <SectionHead
            title="カテゴリから探す"
            more="すべて見る"
            onPress={() => setShowAll(true)}
            styles={styles}
          />
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

          {/*
            本当に見た施設を出す。以前は一覧の先頭3件を出しており、
            誰が何を見ても同じ並びだった。
          */}
          <SectionHead
            title="最近見たスポット"
            more={historyCount > RECENT_COUNT ? `すべて見る (${historyCount})` : 'すべて見る'}
            href="/history"
            styles={styles}
          />
          <View style={styles.recentBox}>
            {recent.map((e) => (
              <Link key={e.facility.id} href={`/facility/${e.facility.id}`} asChild>
                <Pressable style={styles.recentRow} accessibilityRole="link">
                  <View style={styles.recentIcon}>
                    <Ionicons name="time-outline" size={16} color={c.textMuted} />
                  </View>
                  <View style={styles.recentBody}>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {e.facility.name}
                    </Text>
                    <Text style={styles.recentAddress} numberOfLines={1}>
                      {e.facility.prefecture}
                      {e.facility.city ?? ''}
                      {e.facility.address_line}
                    </Text>
                  </View>
                  <Text style={styles.recentWhen}>{describeWhen(e.at)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
                </Pressable>
              </Link>
            ))}
            {recent.length === 0 && !loading && (
              <Text style={styles.recentEmpty}>まだ見た施設がありません</Text>
            )}
          </View>

          {/*
            取り込みの状態を必ず出す。

            以前は失敗しても「まだ取り込めていません」としか出ず、
            理由も、やり直す手立ても示していなかった。
            利用者から見れば、ただの行き止まりにあたる。
          */}
          {syncing ? (
            <View style={styles.syncRow}>
              <ActivityIndicator size="small" color={c.accent} />
              <Text style={styles.foot}>施設の情報を取り込んでいます…</Text>
            </View>
          ) : !sync.ok ? (
            <View style={styles.syncFail}>
              <Ionicons name="cloud-offline-outline" size={20} color={c.danger} />
              <Text style={styles.syncFailText}>
                {sync.message ?? '情報を取得できませんでした。'}
              </Text>
              <Pressable
                onPress={retry}
                style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
                accessibilityRole="button"
              >
                <Ionicons name="refresh" size={15} color={c.accent} />
                <Text style={styles.retryText}>取り込み直す</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.foot}>
              {sync.syncedAt
                ? `端末に ${sync.facilityCount} 件（${describeSyncedAt(sync.syncedAt)}に取得）`
                : 'まだ取り込めていません'}
            </Text>
          )}
        </ScrollView>
      )}

      <ScrollTopButton
        visible={isFiltered && !atTop}
        onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
      />
    </SafeAreaView>
  );
}

/**
 * 「カテゴリから探す ─ すべて見る」の並び。
 *
 * 「すべて見る」は以前は文字が置いてあるだけで、押しても何も起きなかった。
 * 行き先（href）か、その場での動き（onPress）のどちらかを必ず受け取る。
 */
function SectionHead({
  title,
  more,
  href,
  onPress,
  styles,
}: {
  title: string;
  /** 右側の文字。件数を添えることがある。 */
  more: string;
  /** 別の画面へ移る場合 */
  href?: '/history';
  /** この画面の中で切り替える場合 */
  onPress?: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const label = (
    <Text style={styles.sectionMore} numberOfLines={1}>
      {more}
    </Text>
  );

  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {href ? (
        <Link href={href} asChild>
          <Pressable hitSlop={HIT_SLOP} accessibilityRole="link">
            {label}
          </Pressable>
        </Link>
      ) : (
        <Pressable onPress={onPress} hitSlop={HIT_SLOP} accessibilityRole="button">
          {label}
        </Pressable>
      )}
    </View>
  );
}

/** 絞り込んだときに出る一覧 */
function ResultList({
  listRef,
  facilities,
  loading,
  loadingMore,
  onEndReached,
  onScrollChange,
  label,
  matched,
  total,
  onClear,
  styles,
  c,
}: {
  listRef: React.RefObject<FlatList<Facility> | null>;
  facilities: Facility[];
  loading: boolean;
  loadingMore: boolean;
  onEndReached: () => void;
  onScrollChange: (atTop: boolean) => void;
  /** 何で絞っているか（例: ホテル / 「帝国」） */
  label: string;
  /** 絞り込みに当てはまる総数 */
  matched: number;
  /** 端末に入っている総数 */
  total: number;
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
          {/*
            何で絞ったのかと、当てはまった件数、そして全体の件数を出す。
            「35 件」とだけ書くと、それが全部なのか一部なのかが分からない。
          */}
          <Text style={styles.resultCount} numberOfLines={1}>
            {label}
            <Text style={styles.resultCountNum}>
              {`  ${matched} 件 / 全 ${total} 件`}
            </Text>
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
    badgeText: { fontSize: 10, fontWeight: '800', color: '#ffffff' },
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
    recentWhen: { fontSize: 10, color: c.textFaint },
    recentEmpty: { padding: SPACE.lg, fontSize: 12, color: c.textFaint, textAlign: 'center' },

    foot: { marginTop: SPACE.lg, fontSize: 11, color: c.textFaint, textAlign: 'center' },
    syncRow: {
      marginTop: SPACE.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACE.sm,
    },
    syncFail: {
      marginTop: SPACE.lg,
      alignItems: 'center',
      gap: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.danger,
    },
    syncFailText: {
      fontSize: 12,
      color: c.text,
      textAlign: 'center',
      lineHeight: 18,
    },
    retry: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: SPACE.md,
      paddingVertical: 8,
      borderRadius: RADIUS.sm,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    retryPressed: { backgroundColor: c.surface2 },
    retryText: { fontSize: 13, fontWeight: '700', color: c.accent },

    // --- 絞り込みの結果 ---
    list: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xl },
    resultHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: SPACE.sm,
    },
    resultCount: { flex: 1, fontSize: 12, color: c.text, fontWeight: '700' },
    resultCountNum: { color: c.textMuted, fontWeight: '400' },
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
