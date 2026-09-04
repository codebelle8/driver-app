import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect, useRouter } from 'expo-router';
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
import { FacilitiesMap } from '@/components/facilities-map';
import { HeroArt } from '@/components/hero-art';
import { HEADER_HEIGHT } from '@/components/side-rail';
import { ScrollTopButton } from '@/components/scroll-top-button';
import {
  fetchCategories,
  fetchCoverage,
  fetchPins,
  PAGE_SIZE,
  searchFacilities,
  type Pin,
} from '@/lib/facilities';
import { fetchHistory, type HistoryEntry } from '@/lib/history';
import { countUnread, fetchNotices, getRead } from '@/lib/notices';
import { describePlace } from '@/lib/place';
import { describeSyncedAt, ensureSynced, resync, type SyncResult } from '@/lib/sync';
import { useLayout } from '@/lib/layout';
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

/**
 * 広い画面で一度に読む件数。
 *
 * 一覧の右に地図を並べるため、15件だけピンが立って送るたびに増えるのでは、
 * どこに何があるのかが掴めない。1画面に収まる行数も多い。
 */
const WIDE_PAGE_SIZE = 60;

/**
 * 広い画面での、左側（一覧・下見）の幅。
 *
 * 伸ばすと施設名と住所の間が開いて目が横に泳ぐ。地図は残り全部を使う。
 * 上部の現在地と検索欄もこの幅に揃える。
 */
const SPLIT_LIST_WIDTH = 420;

/**
 * 広い画面の左右の余白。
 *
 * ご提示の画面図の見え方（左メニューの右端から48px）に合わせている。
 */
const PAGE_PAD = 48;

/**
 * 本文の最大幅。
 *
 * 1536px の画面では余白を引いた全幅（1184px）がそのまま入り、
 * 画面図と同じ見え方になる。それより広い画面では、1行が長くなりすぎて
 * 目が行末から次の行頭へ戻れなくなるため、ここで止める。
 */
const PAGE_MAX = 1240;

/** 上部（呼びかけ・検索欄・絵）の高さ */
const HERO_HEIGHT = 280;

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
  const { isMedium, isWide } = useLayout();
  const router = useRouter();

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

  /*
    一度に読む件数。

    狭い画面は15件ずつ。走行前の限られた時間で見るため、
    まず数件だけ出して最初の表示を早くする。

    広い画面は地図と並べるので、15件だけピンが立ち、送るたびに
    増えるのでは位置関係が掴めない。1画面に収まる件数も多い。
  */
  const pageSize = isWide ? WIDE_PAGE_SIZE : PAGE_SIZE;

  const load = useCallback(async () => {
    setLoading(true);
    const page = await searchFacilities({ query, categoryId, offset: 0, pageSize });
    setFacilities(page.rows);
    setMatched(page.total);
    setHasMore(page.hasMore);
    setLoading(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [query, categoryId, pageSize]);

  useEffect(() => {
    if (!isFiltered) return;
    const id = setTimeout(load, 200);
    return () => clearTimeout(id);
  }, [isFiltered, load]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const page = await searchFacilities({
      query,
      categoryId,
      offset: facilities.length,
      pageSize,
    });
    setFacilities((prev) => [...prev, ...page.rows]);
    setMatched(page.total);
    setHasMore(page.hasMore);
    setLoadingMore(false);
  }

  /*
    地図に立てるピン。広い画面でのみ組み立てる。

    狭い画面では地図を出さないため、作っても捨てるだけになる。
  */
  const [pins, setPins] = useState<Pin[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!isWide) {
      setPins([]);
      return;
    }
    let alive = true;
    // 絞り込んでいないときは端末にある全件。事務所で開いた直後に
    // 「どのあたりを網羅しているか」が一目で分かる。
    fetchPins(isFiltered ? facilities : undefined).then((p) => {
      if (alive) setPins(p);
    });
    return () => {
      alive = false;
    };
  }, [isWide, isFiltered, facilities, sync.facilityCount]);

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
      {/*
        上部の帯。現在地と知らせ。

        広い画面では、左メニューのロゴ帯と同じ高さの帯にして横一直線に
        区切る。ご提示の画面図の作りに合わせている。
      */}
      <View style={[styles.topBar, isWide && styles.topBarWide]}>
        {/*
          広い画面では出さない。左メニューが常に見えており、
          畳んで開くための記号は要らない。
        */}
        {!isWide && (
          <Pressable hitSlop={HIT_SLOP} accessibilityLabel="メニュー" style={styles.topIcon}>
            <Ionicons name="menu" size={22} color={c.text} />
          </Pressable>
        )}

        {/*
          端末の位置が取れたらその地名を、取れなければ案内できる範囲を出す。
          位置が取れないことを咎める表示はしない。断るのも選択のうち。
        */}
        <View style={styles.place}>
          <Ionicons name="location" size={isWide ? 18 : 13} color={c.accent} />
          <View style={styles.placeText}>
            <Text style={isWide ? styles.placeLabelWide : styles.placeLabel}>
              {place ? '現在地' : '案内できる範囲'}
            </Text>
            <Text
              style={isWide ? styles.placeValueWide : styles.placeValue}
              numberOfLines={1}
            >
              {place ?? area}
            </Text>
          </View>
        </View>

        <Link href="/notices" asChild>
          <Pressable
            hitSlop={HIT_SLOP}
            accessibilityLabel={unseen > 0 ? `お知らせ ${unseen} 件` : 'お知らせ'}
            style={styles.topIcon}
          >
            <Ionicons name="notifications-outline" size={isWide ? 23 : 21} color={c.text} />
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

      {/* 狭い画面。ロゴ・呼びかけ・検索欄をまとめて上に置く。 */}
      {!isWide && (
        <View style={styles.head}>
          {/* 文字の見出しではなくロゴを置く。名乗りはロゴが担う。 */}
          <BrandLogo height={34} />
          <Text style={styles.lead}>行きたい場所を見つけよう</Text>
          <SearchField query={query} onChange={setQuery} styles={styles} c={c} />
        </View>
      )}

      {/*
        広い画面で、絞り込んでいないとき。

        ご提示の画面図に合わせ、上に呼びかけと検索欄を大きく置き、
        右へ写真を敷く。地図はここには出さない。事務所で開いた直後に
        見たいのは「何を探せるか」であって、193件の散らばりではない。
      */}
      {isWide && !isFiltered && (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <HeroArt />
            <View style={styles.heroInner}>
              <Text style={styles.heroTitle}>行きたい場所を見つけよう</Text>
              <View style={styles.heroSearch}>
                <SearchField
                  query={query}
                  onChange={setQuery}
                  styles={styles}
                  c={c}
                  large
                />
              </View>
            </View>
          </View>

          <View style={styles.page}>
            <SectionHead
              title="カテゴリから探す"
              more="すべて見る"
              onPress={() => setShowAll(true)}
              styles={styles}
              wide
            />
            <View style={styles.grid}>
              {chips.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  onPress={() => setCategoryId(cat.id)}
                  styles={styles}
                  c={c}
                  wide
                />
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
              wide
            />
            <View style={styles.recentList}>
              {recent.map((e) => (
                <RecentRow key={e.facility.id} entry={e} styles={styles} c={c} wide />
              ))}
              {recent.length === 0 && !loading && (
                <View style={styles.recentEmptyBox}>
                  <Text style={styles.recentEmpty}>まだ見た施設がありません</Text>
                </View>
              )}
            </View>

            <SyncState syncing={syncing} sync={sync} onRetry={retry} styles={styles} c={c} />
          </View>
        </ScrollView>
      )}

      {/*
        広い画面で絞り込んでいるとき。検索欄を細い帯にして、
        下に一覧と地図を左右で並べる。
      */}
      {isWide && isFiltered && (
        <>
          <View style={styles.searchBand}>
            <SearchField query={query} onChange={setQuery} styles={styles} c={c} />
          </View>

          <View style={styles.split}>
            <View style={styles.splitList}>
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
                activeId={activeId}
                onHover={setActiveId}
                styles={styles}
                c={c}
              />
            </View>

            {/*
              一覧の右に地図。行にマウスを乗せると対応するピンが応え、
              ピンを押すとその施設が開く。事務所で突き合わせるときに、
              1件ずつ開いて位置を確かめる手数を省く。
            */}
            <View style={styles.splitMap}>
              <FacilitiesMap
                pins={pins}
                activeId={activeId}
                onSelect={(id) => router.push(`/facility/${id}`)}
              />
            </View>
          </View>
        </>
      )}

      {/* 狭い画面の中身 */}
      {!isWide &&
        (isFiltered ? (
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
          <ScrollView
            contentContainerStyle={styles.browse}
            showsVerticalScrollIndicator={false}
          >
            <SectionHead
              title="カテゴリから探す"
              more="すべて見る"
              onPress={() => setShowAll(true)}
              styles={styles}
            />
            <View style={styles.grid}>
              {chips.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  onPress={() => setCategoryId(cat.id)}
                  styles={styles}
                  c={c}
                  wide={isMedium}
                />
              ))}
            </View>

            <SectionHead
              title="最近見たスポット"
              more={historyCount > RECENT_COUNT ? `すべて見る (${historyCount})` : 'すべて見る'}
              href="/history"
              styles={styles}
            />
            <View style={styles.recentBox}>
              {recent.map((e) => (
                <RecentRow key={e.facility.id} entry={e} styles={styles} c={c} />
              ))}
              {recent.length === 0 && !loading && (
                <Text style={styles.recentEmpty}>まだ見た施設がありません</Text>
              )}
            </View>

            <SyncState syncing={syncing} sync={sync} onRetry={retry} styles={styles} c={c} />
          </ScrollView>
        ))}

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
  wide,
}: {
  title: string;
  /** 右側の文字。件数を添えることがある。 */
  more: string;
  /** 別の画面へ移る場合 */
  href?: '/history';
  /** この画面の中で切り替える場合 */
  onPress?: () => void;
  styles: ReturnType<typeof makeStyles>;
  /** 広い画面。見出しと余白を大きくする。 */
  wide?: boolean;
}) {
  const label = (
    <Text style={wide ? styles.sectionMoreWide : styles.sectionMore} numberOfLines={1}>
      {more}
    </Text>
  );

  return (
    <View style={wide ? styles.sectionHeadWide : styles.sectionHead}>
      <Text style={wide ? styles.sectionTitleWide : styles.sectionTitle}>{title}</Text>
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

/**
 * 検索欄。
 *
 * 広い画面の上部では大きく（large）、絞り込み中の細い帯では小さく出す。
 * 中身は同じで、寸法だけを変える。別々に書くと、片方だけ直して
 * もう片方が古いままになる。
 */
function SearchField({
  query,
  onChange,
  styles,
  c,
  large,
}: {
  query: string;
  onChange: (v: string) => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  large?: boolean;
}) {
  return (
    <View style={large ? styles.searchBoxLarge : styles.searchBox}>
      <Ionicons name="search" size={large ? 22 : 18} color={c.textFaint} />
      <TextInput
        value={query}
        onChangeText={onChange}
        placeholder="施設名・よみがな・住所"
        placeholderTextColor={c.textFaint}
        style={large ? styles.inputLarge : styles.input}
        returnKeyType="search"
        autoCorrect={false}
      />
      {query.length > 0 ? (
        <Pressable onPress={() => onChange('')} hitSlop={HIT_SLOP} accessibilityLabel="消す">
          <Ionicons name="close-circle" size={large ? 22 : 18} color={c.textFaint} />
        </Pressable>
      ) : (
        <Ionicons name="options-outline" size={large ? 22 : 18} color={c.textFaint} />
      )}
    </View>
  );
}

/** カテゴリの札 */
function CategoryCard({
  category,
  onPress,
  styles,
  c,
  wide,
}: {
  category: Category;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  /** 3列に並べる幅か */
  wide?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ hovered, pressed }) => [
        styles.card,
        wide && styles.cardWide,
        hovered && styles.cardHover,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={wide ? styles.cardIconWide : styles.cardIcon}>
        <Ionicons name={CATEGORY_ICON[category.code]} size={wide ? 26 : 20} color={c.accent} />
      </View>
      <View style={styles.cardText}>
        <Text style={wide ? styles.cardTitleWide : styles.cardTitle}>{category.name}</Text>
        <Text style={wide ? styles.cardHintWide : styles.cardHint} numberOfLines={1}>
          {CATEGORY_HINT[category.code] ?? '施設を探す'}
        </Text>
      </View>
    </Pressable>
  );
}

/** 最近見た施設の1行 */
function RecentRow({
  entry,
  styles,
  c,
  wide,
}: {
  entry: HistoryEntry;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  wide?: boolean;
}) {
  const f = entry.facility;
  return (
    <Link href={`/facility/${f.id}`} asChild>
      {/*
        Link asChild の下では、見た目を配列や関数で渡すとブラウザ側で
        扱えない。組み合わせごとに1つの object にまとめて渡す。
      */}
      <Pressable style={wide ? styles.recentRowWide : styles.recentRow} accessibilityRole="link">
        <View style={wide ? styles.recentIconWide : styles.recentIcon}>
          <Ionicons name="time-outline" size={wide ? 18 : 16} color={c.textMuted} />
        </View>
        <View style={styles.recentBody}>
          <Text style={wide ? styles.recentNameWide : styles.recentName} numberOfLines={1}>
            {f.name}
          </Text>
          <Text
            style={wide ? styles.recentAddressWide : styles.recentAddress}
            numberOfLines={1}
          >
            {f.prefecture}
            {f.city ?? ''}
            {f.address_line}
          </Text>
        </View>
        {!wide && <Text style={styles.recentWhen}>{describeWhen(entry.at)}</Text>}
        <Ionicons name="chevron-forward" size={wide ? 20 : 16} color={c.textFaint} />
      </Pressable>
    </Link>
  );
}

/**
 * 取り込みの状態。
 *
 * 必ず出す。以前は失敗しても「まだ取り込めていません」としか出ず、
 * 理由も、やり直す手立ても示していなかった。
 * 利用者から見れば、ただの行き止まりにあたる。
 */
function SyncState({
  syncing,
  sync,
  onRetry,
  styles,
  c,
}: {
  syncing: boolean;
  sync: SyncResult;
  onRetry: () => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  if (syncing) {
    return (
      <View style={styles.syncRow}>
        <ActivityIndicator size="small" color={c.accent} />
        <Text style={styles.foot}>施設の情報を取り込んでいます…</Text>
      </View>
    );
  }

  if (!sync.ok) {
    return (
      <View style={styles.syncFail}>
        <Ionicons name="cloud-offline-outline" size={20} color={c.danger} />
        <Text style={styles.syncFailText}>
          {sync.message ?? '情報を取得できませんでした。'}
        </Text>
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={15} color={c.accent} />
          <Text style={styles.retryText}>取り込み直す</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Text style={styles.foot}>
      {sync.syncedAt
        ? `端末に ${sync.facilityCount} 件（${describeSyncedAt(sync.syncedAt)}に取得）`
        : 'まだ取り込めていません'}
    </Text>
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
  activeId,
  onHover,
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
  /** 一覧で指している施設。地図のピンと合わせる。 */
  activeId?: string | null;
  /** マウスが行に乗ったとき。狭い画面では渡さない。 */
  onHover?: (id: string | null) => void;
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
      renderItem={({ item }) => (
        <FacilityRow
          facility={item}
          active={item.id === activeId}
          onHover={onHover}
          styles={styles}
          c={c}
        />
      )}
    />
  );
}

function FacilityRow({
  facility,
  active,
  onHover,
  styles,
  c,
}: {
  facility: Facility;
  /** 地図のピンが指しているか */
  active?: boolean;
  onHover?: (id: string | null) => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  return (
    <Link href={`/facility/${facility.id}`} asChild>
      {/*
        体裁は1つの object にまとめて渡す。

        Link の asChild は中身を <a> に差し替えるため、Pressable 向けの
        書き方がそのままでは通らない。
          関数形式 … 落ちる。行の枠も余白も消えて縦積みになった。
          配列    … 「Failed to set an indexed property [0] on
                     CSSStyleDeclaration」で画面ごと落ちた。
        flatten して1つにすれば、どちらの事故も起きない。

        マウスを乗せた状態は activeId が持っている（onHover で親へ伝え、
        地図のピンと同時に応える）。ここで別に持つ必要はない。
      */}
      <Pressable
        accessibilityRole="link"
        onHoverIn={() => onHover?.(facility.id)}
        onHoverOut={() => onHover?.(null)}
        style={StyleSheet.flatten([styles.row, active && styles.rowActive])}
      >
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

    /*
      広い画面の上部の帯。

      左メニューのロゴ帯と同じ高さにして、画面を横一直線に区切る。
      ご提示の画面図の作りに合わせている。
    */
    topBarWide: {
      height: HEADER_HEIGHT,
      paddingTop: 0,
      paddingBottom: 0,
      paddingHorizontal: PAGE_PAD,
      gap: SPACE.md,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    placeLabelWide: { fontSize: 12, color: c.textFaint },
    placeValueWide: { fontSize: 16, color: c.text, fontWeight: '700' },
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
    /*
      広い画面では中身を中央に寄せ、幅の上限を設ける。

      1920px の画面で検索欄が1900px あっても打ちやすくはならない。
      本文の1行が長すぎると、目が行末から次の行頭へ戻れなくなる。
    */
    /*
      上部と検索欄は、左側（一覧）の幅に収める。

      画面いっぱいに伸ばすと地図の上へかぶさり、どこまでが
      検索の範囲なのかが読み取れなくなる。
    */
    headWide: { width: SPLIT_LIST_WIDTH, paddingTop: SPACE.sm },
    leadWide: { fontSize: 15, marginTop: 0, marginBottom: SPACE.xs },
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

    /*
      広い画面の上部。呼びかけと検索欄を大きく置き、右に絵を敷く。

      高さを決め打ちにしているのは、絵の見え方を安定させるため。
      中身に任せると、文字の折り返しで縦が伸び縮みして絵が切れる。
    */
    hero: { height: HERO_HEIGHT, justifyContent: 'center' },
    heroInner: {
      width: '100%',
      maxWidth: PAGE_MAX,
      alignSelf: 'center',
      paddingHorizontal: PAGE_PAD,
    },
    heroTitle: {
      fontSize: 30,
      lineHeight: 44,
      fontWeight: '700',
      color: c.text,
    },
    heroSearch: { marginTop: SPACE.xl, maxWidth: 640 },
    searchBoxLarge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.md,
      paddingHorizontal: SPACE.xl,
      height: 62,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    inputLarge: { flex: 1, fontSize: 16, color: c.text, paddingVertical: 0 },

    /* 絞り込み中の細い帯。上部の帯と一覧のあいだに挟む。 */
    searchBand: {
      paddingHorizontal: PAGE_PAD,
      paddingVertical: SPACE.md,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },

    /* 広い画面の本文。左右に余白を取り、広すぎる画面では中央へ寄せる。 */
    page: {
      width: '100%',
      maxWidth: PAGE_MAX,
      alignSelf: 'center',
      paddingHorizontal: PAGE_PAD,
      paddingBottom: SPACE.xl * 2,
    },

    // --- 下見の画面 ---
    browse: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xl },
    browseWide: { paddingTop: SPACE.xs },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACE.md,
      marginBottom: SPACE.sm,
    },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    sectionMore: { fontSize: 12, color: c.accent, fontWeight: '600' },
    sectionHeadWide: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACE.xl,
      marginBottom: SPACE.md,
    },
    sectionTitleWide: { fontSize: 19, fontWeight: '700', color: c.text },
    sectionMoreWide: { fontSize: 13, color: c.accent, fontWeight: '600' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
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
    /*
      3列。隙間ぶんを引いた幅にする。

      flexGrow を残しているのは、端数が出たときに行いっぱいまで
      伸ばして右端を揃えるため。
    */
    cardWide: {
      width: '31%',
      gap: SPACE.lg,
      paddingHorizontal: SPACE.xl,
      paddingVertical: SPACE.xl - 2,
      borderRadius: RADIUS.lg,
    },
    cardIconWide: {
      width: 56,
      height: 56,
      borderRadius: RADIUS.md,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitleWide: { fontSize: 16, fontWeight: '700', color: c.text },
    cardHintWide: { fontSize: 13, color: c.textMuted, marginTop: 3 },
    cardHover: { borderColor: c.borderStrong, backgroundColor: c.surface2 },
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

    /*
      広い画面では、1行ずつ独立した札にする。

      狭い画面は枠を1つにまとめて中で区切っているが、横に長い行を
      罫線だけで区切ると、どこまでが1件か掴みにくい。
    */
    recentList: { gap: SPACE.sm },
    recentRowWide: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.md,
      paddingHorizontal: SPACE.lg,
      height: 68,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    recentIconWide: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recentNameWide: { fontSize: 15, fontWeight: '700', color: c.text },
    recentAddressWide: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    recentEmptyBox: {
      height: 68,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },

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

    /*
      一覧と地図の左右分割。

      一覧の幅は決め打ちにする。伸ばすと施設名と住所の間が開き、
      目が横に泳ぐ。地図は残り全部を使う。広いほど位置関係が読める。
    */
    split: { flex: 1, flexDirection: 'row' },
    splitOff: { flex: 1 },
    /*
      幅は flexBasis まで指定する。

      ScrollView は自前で flex: 1 を持っており、それに含まれる
      flexBasis: 0% が width より優先される。width だけを指定しても
      左側が伸び続け、地図の上まで中身がはみ出していた。
    */
    splitList: {
      width: SPLIT_LIST_WIDTH,
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: SPLIT_LIST_WIDTH,
    },
    splitMap: {
      flex: 1,
      borderLeftWidth: 1,
      borderLeftColor: c.border,
    },
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
    // 地図のピンと同じ色で応える。どの行がどのピンかが分かる。
    rowActive: { borderColor: c.accent, backgroundColor: c.accentSoft },
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
