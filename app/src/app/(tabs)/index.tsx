import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Coverage } from '@/components/coverage';
import { onHomePressed } from '@/lib/home-signal';
import { FacilitiesMap } from '@/components/facilities-map';
import { HeroArt } from '@/components/hero-art';
import { IconButton } from '@/components/icon-button';
import { RAIL_WIDTH } from '@/components/side-rail';
import { FEEDBACK_BUTTON_SPACE, FeedbackButton } from '@/components/feedback-button';
import { ScrollTopButton, SCROLL_TOP_CLEARANCE } from '@/components/scroll-top-button';
import {
  fetchCategories,
  fetchCoverage,
  fetchPins,
  PAGE_SIZE,
  searchFacilities,
  type Pin,
} from '@/lib/facilities';
import { fetchHistory, type HistoryEntry } from '@/lib/history';
import { AccountMenu } from '@/components/account-menu';
import { PlanPrompt } from '@/components/plan-prompt';
import { describeSyncedAt, ensureSynced, resync, type SyncResult } from '@/lib/sync';
import { useLocale, useT } from '@/lib/i18n/context';
import { categoryName, facilityAddress, facilityName } from '@/lib/localized';
import { fill } from '@/lib/i18n/dictionaries';
import { PAGE_MAX, PAGE_PAD, useLayout } from '@/lib/layout';
import { describeWhen } from '@/lib/when';
import type { Category, Facility } from '@/lib/types';
import { HIT_SLOP, RADIUS, SPACE, TEXT, type Palette } from '@/theme';
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
 * 上部の帯の高さ。
 *
 * 絵は切らずにまるごと収める（contain）。枠と絵の比が違えば、
 * 余った側にはぼかした同じ絵が敷かれる。
 *
 * **比の決め方**
 *   絵は横縦およそ 2.1。枠を 2.4 にすると、左右にわずかな余りが出る
 *   程度で収まり、絵が主役のまま帯として据わる。
 *   2.1 に揃えると余りは消えるが、1536px の画面で高さが 610px になり、
 *   その下の一覧が画面から押し出される。
 *
 * **縦の短い画面では抑える**
 *   1536×700 のような窓で 512px の帯を出すと、下に何も見えなくなる。
 *   画面の高さの半分を上限とする。
 */
const HERO_BAND_ASPECT = 2.4;
const HERO_MIN = 300;
const HERO_MAX_SCREEN = 0.5;

/**
 * 上部の検索欄の高さ。
 *
 * 62px から詰めた。絵の上に重ねるものが背高だと、絵の下ほぼ全体を
 * 覆ってしまう。文字（19px）と上下の余白で 40px に収まる。
 */
const SEARCH_HEIGHT = 40;

/**
 * 検索欄を絵の下端からどれだけ上へ置くか。
 *
 * 欄が低くなったぶん、絵の縁との間合いを広げる。下端に貼りつくと
 * 絵の切れ目に乗って見え、どちらの持ち物か分からなくなる。
 */
const HERO_OVERLAY_BOTTOM = 28;

/**
 * 節と節のあいだ。
 *
 * 24px では帯と「カテゴリから探す」が近く、帯の続きに見えていた。
 * 45px 空けると、飾りと中身の切れ目がはっきりする。
 */
const SECTION_GAP = 45;

/**
 * 見出しの書体。
 *
 * 実体は app/public/index.html の @font-face で登録している。
 * 端末側にはこの名前の書体が無く、そのときは既定の書体で出る。
 */
const HEADING_FONT = Platform.select({
  web: "'Kurumayose Heading', sans-serif",
  default: undefined,
});

/**
 * 上部の検索欄の幅。置ける幅に対する割合。
 *
 * 置いたまま … 右の写真に届かない幅。写真は右から 52% を占めるため、
 *              そこへ食い込まない範囲に収める。
 * 押したとき … 写真の縁へ少し重なる幅。長い施設名も収まる。
 */
const SEARCH_REST = 0.4;
const SEARCH_OPEN = 0.62;

/**
 * 検索欄の下限（px）。
 *
 * 割合だけで決めていたところ、1024px の画面で枠が269pxになり、
 * 「施設名・よみがな・住所」の末尾が絞り込みの記号の下に潜っていた。
 * 何を打てばよいか読めない欄は、狭くする意味がない。
 *
 * 置いたままの下限は、この案内文が収まる幅。写真の縁に少し重なるが、
 * その範囲は背景色へ溶かしてあるため、食い込んで見えない。
 */
const SEARCH_REST_MIN = 372;
const SEARCH_OPEN_MIN = 480;

/** カテゴリの区分ごとの記号。データ側に持たせるほどのものではない。 */
const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  hotel: 'bed',
  residence: 'home',
  commercial: 'storefront',
  office: 'business',
  hospital: 'medkit',
  station: 'train',
};

/**
 * 印の無いカテゴリに使う印。
 *
 * **印が無いからといって、出さないのは誤り。**
 *   以前はここに載っているカテゴリだけを出していた。管理画面で
 *   新しいカテゴリを足しても、**アプリには一切出なかった**
 *   （ご報告 2026-09-14）。発注元は追加したつもりでいるのに、
 *   利用者からは存在しない。
 *
 *   カテゴリは管理画面から増やせる。増えるたびにこちらへ印を
 *   足さなければ出ない作りは、**増やせる仕組みと噛み合っていない。**
 *   決まった印が無いものは、この印で出す。
 */
const CATEGORY_ICON_FALLBACK: keyof typeof Ionicons.glyphMap = 'location';

/** カテゴリの印。載っていなければ既定のものを返す。 */
const iconOf = (code: string): keyof typeof Ionicons.glyphMap =>
  CATEGORY_ICON[code] ?? CATEGORY_ICON_FALLBACK;

export default function SearchScreen() {
  const c = useTheme();
  const t = useT();
  const { locale } = useLocale();
  const styles = makeStyles(c);
  const { width: winWidth, height: winHeight, isWide, isSplit, isThreeUp } = useLayout();

  /*
    上部の帯の高さ。幅に対する比で決める（HERO_BAND_ASPECT の説明を参照）。

    帯は左メニューの右端から画面の右端まで。列の幅ではない。
  */
  const heroHeight = (() => {
    const band = winWidth - RAIL_WIDTH;
    const byWidth = band / HERO_BAND_ASPECT;
    const byScreen = winHeight * HERO_MAX_SCREEN;
    return Math.max(HERO_MIN, Math.round(Math.min(byWidth, byScreen)));
  })();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  /** 直近に見た施設。履歴の先頭ぶん。 */
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
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

  const listRef = useRef<FlatList<Facility>>(null);

  /*
    ロゴを押したときの戻り先。

    既に探す画面に居るときは、渡す先が同じで何も起きない。
    絞り込みを解いて頭へ戻し、検索欄が見える形にする。
  */
  const toSearchTop = useCallback(() => {
    setQuery('');
    setCategoryId(null);
    setShowAll(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  // ロゴはどちらの置き場所からも同じ知らせを送る（lib/home-signal.ts）
  useEffect(() => onHomePressed(toSearchTop), [toSearchTop]);
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
      setSync((prev) => ({ ...prev, facilityCount: area.total }));
      setLoading(false);
    })();

    (async () => {
      // 2. 取り込みは後ろで走らせ、終わったら描き直す
      const result = await ensureSynced();
      if (!alive) return;
      setSync(result);
      setSyncing(false);

      const { cats } = await readLocal();
      if (!alive) return;
      setCategories(cats);
    })();

    return () => {
      alive = false;
    };
  }, [readLocal, locale]);

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
        const history = await fetchHistory();
        if (!alive) return;
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

    const { cats } = await readLocal();
    setCategories(cats);
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
    // 地図は左右に並べるときだけ出す。ピンもそのときだけ集める。
    if (!isSplit) {
      setPins([]);
      return;
    }
    let alive = true;
    // 絞り込んでいないときは端末にある全件。事務所で開いた直後に
    // 「どのあたりを網羅しているか」が一目で分かる。
    fetchPins(isFiltered ? facilities : undefined, locale).then((p) => {
      if (alive) setPins(p);
    });
    return () => {
      alive = false;
    };
  }, [isSplit, isFiltered, facilities, sync.facilityCount, locale]);

  /** 見出しに出す、いま効いている絞り込み */
  const filterLabel = useMemo(() => {
    const cat = categories.find((x) => x.id === categoryId);
    if (query.trim() && cat)
      return fill(t.search.filtered, {
        category: categoryName(cat, locale),
        query: query.trim(),
      });
    if (cat) return categoryName(cat, locale);
    if (query.trim()) return `「${query.trim()}」`;
    return t.search.allFacilities;
  }, [categories, categoryId, query, t, locale]);

  const chips = useMemo(
    /*
      **すべて出す。** 以前は印のあるものだけに絞っており、管理画面で
      増やしたカテゴリがアプリに出なかった。
    */
    () => categories,
    [categories],
  );

  return (
    <SafeAreaView style={styles.safe} edges={[]}>

      {/*
        無料期間が終わった方へのご案内。

        終わっていなければ何も描かない。包む View をここに置かないのは、
        出すものが無いときに余白だけが残るため。
      */}
      <PlanPrompt variant="banner" style={styles.planBanner} />

      {/* 狭い画面。ロゴ・呼びかけ・検索欄をまとめて上に置く。 */}
      {!isWide && (
        <View style={styles.head}>
          {/*
            案内できる範囲。ご指示（2026-09-10）で、上部の帯にあった
            ものをここへ移した。ロゴは入れ替わりに帯へ上がっている。

            検索欄のすぐ上にあるほうが、何を探せるのかと結びつく。
          */}
          <Coverage />
          <Text style={styles.lead}>{t.search.lead}</Text>
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
        <ScrollView
          showsVerticalScrollIndicator={false}
          /* 右下のご意見箱に、いちばん下の行が隠れないように */
          contentContainerStyle={{ paddingBottom: FEEDBACK_BUTTON_SPACE }}
        >
          {/*
            上部の帯。絵を横一杯に敷き、検索欄をその上へ重ねる。

            見出しは置かない。絵の中に「行きたい場所を見つけよう」が
            入っており、画面側でも描くと同じ文言が二度出る。
          */}
          <View style={[styles.hero, { height: heroHeight }]}>
            <HeroArt />

            {/* 検索欄は絵の下端へ寄せ、左端は本文の列に揃える。 */}
            <View style={styles.heroOverlay}>
              <View style={styles.heroOverlayInner}>
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
              title={t.search.categoryTitle}
              more={t.common.seeAll}
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
                  /*
                    大きい札は 1024px から。

                    768px では左メニュー 256px を引くと本文が512pxで、
                    2列にすると1枚が236px。大きい札だと
                    「オフィスビル」が折り返し、説明も切れていた。
                  */
                  wide={isSplit}
                  half={!isThreeUp}
                />
              ))}
            </View>

            {/*
              本当に見た施設を出す。以前は一覧の先頭3件を出しており、
              誰が何を見ても同じ並びだった。
            */}
            <SectionHead
              title={t.search.recentTitle}
                                more={
                    historyCount > RECENT_COUNT
                      ? fill(t.common.seeAllCount, { n: historyCount })
                      : t.common.seeAll
                  }
              href="/history"
              styles={styles}
              wide
            />
            <View style={styles.recentList}>
              {recent.map((e) => (
                <RecentRow key={e.id} entry={e} styles={styles} c={c} wide />
              ))}
              {recent.length === 0 && !loading && (
                <View style={styles.recentEmptyBox}>
                  <Text style={styles.recentEmpty}>{t.search.recentEmpty}</Text>
                </View>
              )}
            </View>

            <SyncState syncing={syncing} sync={sync} onRetry={retry} styles={styles} c={c} />
          </View>
        </ScrollView>
      )}

      {/*
        広い画面で絞り込んでいるとき、検索欄を細い帯にして上へ置く。

        左右分割の枝の中に入れていたため、768〜1023px で絞り込むと
        検索欄が画面から消えていた。この幅は左メニューは出るが
        左右には並べないため、どちらの枝からも外れていた。
        打った言葉が見えず、直すことも消すこともできない状態だった。

        絞り込んでいるあいだ、検索欄はどの幅でも要る。
      */}
      {isWide && isFiltered && (
        <View style={styles.searchBand}>
          {/*
            大きさは上部のものと揃える。打ち始めた瞬間に文字が
            19px から 14px へ落ちると、同じ欄が入れ替わったように見える。
          */}
          <SearchField query={query} onChange={setQuery} styles={styles} c={c} band />
        </View>
      )}

      {/* 左右に並べるのは 1024px から。一覧の右に地図を置く。 */}
      {isSplit && isFiltered && (
        <>

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

      {/*
        左右に並べないときの一覧。

        スマホ（〜767）と、PC の骨格だが幅の足りない画面（768〜1023）の
        両方がここへ来る。地図は出さず、一覧だけを縦に出す。
      */}
      {!isSplit && isFiltered && (
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
      )}

      {/* スマホの入口。カテゴリの札と、最近見たスポット。 */}
      {!isWide && !isFiltered && (
        <ScrollView
          contentContainerStyle={styles.browse}
          showsVerticalScrollIndicator={false}
        >
            <SectionHead
              title={t.search.categoryTitle}
              more={t.common.seeAll}
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
                />
              ))}
            </View>

            <SectionHead
              title={t.search.recentTitle}
                                more={
                    historyCount > RECENT_COUNT
                      ? fill(t.common.seeAllCount, { n: historyCount })
                      : t.common.seeAll
                  }
              href="/history"
              styles={styles}
            />
            <View style={styles.recentBox}>
              {recent.map((e) => (
                <RecentRow key={e.id} entry={e} styles={styles} c={c} />
              ))}
              {recent.length === 0 && !loading && (
                <Text style={styles.recentEmpty}>{t.search.recentEmpty}</Text>
              )}
            </View>

          <SyncState syncing={syncing} sync={sync} onRetry={retry} styles={styles} c={c} />
        </ScrollView>
      )}

      {/*
        ご意見箱（2026-11-02）。ご提示の場所（右下・下のタブのすぐ上）に浮かべる。
        絞り込んでいるあいだは出さない（同じ右下に「上へ戻る」が出るため）。
      */}
      {!isFiltered && <FeedbackButton wide={isWide} />}

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
 *
 * **押すと横に広がる**（large のときだけ）
 *   置いたままの幅を狭くしてある。上部の右側には写真が敷いてあり、
 *   最初から広いと、打ち始める前から写真へ食い込んで見える。
 *   打つあいだだけ広げれば、長い施設名も収まる。
 *
 *   幅は枠を実測して割り出す。画面の幅から引き算で求めると、
 *   左メニューや余白の見込みが要り、画面ごとに合わなくなる。
 *
 * **黒い枠を出さない**
 *   ブラウザは入力欄を押すと既定で黒い枠を描く。角丸の欄の上に
 *   直角の枠が重なり、壊れているように見えていた。枠は消し、
 *   代わりに欄の縁を緑にする。文字の入る位置は点滅する線で分かる。
 */
function SearchField({
  query,
  onChange,
  styles,
  c,
  large,
  band,
}: {
  query: string;
  onChange: (v: string) => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  /** 上部に重ねるもの。押すと横に広がる。 */
  large?: boolean;
  /** 絞り込み中の細い帯。大きさは large と同じで、幅は動かさない。 */
  band?: boolean;
}) {
  const t = useT();
  // 見た目は同じ。広がる動きだけが large にある。
  const big = large || band;
  const [focused, setFocused] = useState(false);
  const [room, setRoom] = useState(0);

  /*
    幅の移り変わり。

    値そのものを状態で持つと、変わるたびに画面を組み直すことになる。
    Animated は組み直さずに寸法だけを動かす。
  */
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!large) return;
    Animated.timing(grow, {
      toValue: focused ? 1 : 0,
      duration: 180,
      // 幅は端末側で先に計算できないため、こちらで動かす
      useNativeDriver: false,
    }).start();
  }, [focused, grow, large]);

  const field = (
    <View
      style={[
        big ? styles.searchBoxLarge : styles.searchBox,
        focused && styles.searchBoxOn,
      ]}
    >
      <Ionicons name="search" size={big ? 19 : 18} color={focused ? c.accent : c.textFaint} />
      <TextInput
        value={query}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={t.search.placeholder}
        placeholderTextColor={c.textFaint}
        selectionColor={c.accent}
        style={[big ? styles.inputLarge : styles.input, styles.inputNoOutline]}
        returnKeyType="search"
        autoCorrect={false}
      />
      {query.length > 0 ? (
        <IconButton
          icon="close-circle"
          size={big ? 19 : 18}
          label={t.search.clear}
          onPress={() => onChange('')}
          compact
        />
      ) : (
        <Ionicons name="options-outline" size={big ? 19 : 18} color={c.textFaint} />
      )}
    </View>
  );

  if (!large) return field;

  return (
    /*
      外側で置ける幅を測り、その中で内側の幅を動かす。

      置いたまま … 写真に届かない幅（左半分の中に収める）
      押したとき … 写真の縁へ少し重なる幅
    */
    <View onLayout={(e) => setRoom(Math.round(e.nativeEvent.layout.width))}>
      <Animated.View
        style={{
          width:
            room === 0
              ? undefined
              : grow.interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    // 案内文が収まる幅を下回らない。置ける幅は超えない。
                    Math.min(room, Math.max(SEARCH_REST_MIN, room * SEARCH_REST)),
                    Math.min(room, Math.max(SEARCH_OPEN_MIN, room * SEARCH_OPEN)),
                  ],
                }),
        }}
      >
        {field}
      </Animated.View>
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
  half,
}: {
  category: Category;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  /** 大きい札にするか */
  wide?: boolean;
  /** 3列に収まらない幅。2列にする。 */
  half?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  /*
    説明はカテゴリの記号で引く。未知の記号には当たり障りのない
    一言を当てる。カテゴリは管理画面から増やせるため、
    ここに無いものが来ても札が空にならないようにする。
  */
  const hint =
    (t.categoryHint as Record<string, string>)[category.code] ?? t.categoryHint.other;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ hovered, pressed }) => [
        styles.card,
        wide && styles.cardWide,
        wide && half && styles.cardHalf,
        hovered && styles.cardHover,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={wide ? styles.cardIconWide : styles.cardIcon}>
        <Ionicons name={iconOf(category.code)} size={wide ? 26 : 20} color={c.accent} />
      </View>
      <View style={styles.cardText}>
        <Text style={wide ? styles.cardTitleWide : styles.cardTitle}>
          {categoryName(category, locale)}
        </Text>
        {/*
          狭い札では2行まで許す。

          375px で2列にすると札は163pxで、記号と余白を引くと
          文字に使えるのは95px。「オフィスビルを探す」は12pxで
          108px あり、1行に縛ると末尾が切れていた。
        */}
        <Text
          style={wide ? styles.cardHintWide : styles.cardHint}
          numberOfLines={wide ? 1 : 2}
        >
          {hint}
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
  const t = useT();
  const { locale } = useLocale();
  const f = entry.facility;
  // 管理者に消された施設はここに出さない。理由は履歴の一覧で伝える。
  if (!f) return null;

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
            {facilityName(f, locale)}
          </Text>
          <Text
            style={wide ? styles.recentAddressWide : styles.recentAddress}
            numberOfLines={1}
          >
            {facilityAddress(f, locale)}
          </Text>
          {/*
            いつ見たかは、行の右ではなく住所の下へ置く。

            右に置くと、住所に使える幅が60pxほど削られる。320pxの
            画面では住所が入りきらず、末尾が切れていた。
            お気に入りと履歴の一覧も、時刻は同じ位置に出している。
          */}
          {!wide && <Text style={styles.recentWhen}>{describeWhen(entry.at, t)}</Text>}
        </View>
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
  const t = useT();
  if (syncing) {
    return (
      <View style={styles.syncRow}>
        <ActivityIndicator size="small" color={c.accent} />
        <Text style={styles.foot}>{t.search.loading}</Text>
      </View>
    );
  }

  if (!sync.ok) {
    return (
      <View style={styles.syncFail}>
        <Ionicons name="cloud-offline-outline" size={20} color={c.danger} />
        <Text style={styles.syncFailText}>
          {sync.problem === 'stale' ? t.sync.staleMessage : t.sync.failedMessage}
        </Text>
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={15} color={c.accent} />
          <Text style={styles.retryText}>{t.common.retry}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Text style={styles.foot}>
      {sync.syncedAt
        ? fill(t.search.onDevice, {
            n: sync.facilityCount,
            when: describeSyncedAt(sync.syncedAt, t),
          })
        : t.search.notYet}
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
  const t = useT();
  return (
    <View style={styles.resultPane}>
      {/*
        何で絞ったのかと、当てはまった件数、そして全体の件数を出す。
        「35 件」とだけ書くと、それが全部なのか一部なのかが分からない。

        **一覧の外に置き、送っても動かさない**（ご指示 2026-10-29）。
        一覧の頭に入れていたため、送ると一緒に流れて消えた。下の方で
        何の一覧を見ているのか分からず、絞り込みを外すにも上まで戻る
        ことになる。
      */}
      <View style={styles.resultHead}>
        <Text style={styles.resultCount} numberOfLines={1}>
          {label}
          <Text style={styles.resultCountNum}>
            {fill(t.search.matched, { matched, total })}
          </Text>
        </Text>
        <Pressable onPress={onClear} hitSlop={HIT_SLOP}>
          <Text style={styles.resultClear}>{t.search.clearFilter}</Text>
        </Pressable>
      </View>

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
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.spinner} color={c.accent} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={28} color={c.textFaint} />
              <Text style={styles.emptyTitle}>{t.search.emptyTitle}</Text>
              <Text style={styles.emptyBody}>
                {t.search.emptyBody}
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
    </View>
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
  const { locale } = useLocale();
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
            {facilityName(facility, locale)}
          </Text>
          <Text style={styles.rowAddress} numberOfLines={1}>
            {facilityAddress(facility, locale)}
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
    /* 料金のご案内。上部の帯のすぐ下に敷く。 */
    planBanner: {
      marginHorizontal: SPACE.lg,
      marginTop: SPACE.md,
    },

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
    leadWide: { fontSize: TEXT.bodyStrong, marginTop: 0, marginBottom: SPACE.xs },
    lead: { fontSize: TEXT.body, color: c.textMuted, marginTop: 6 },
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
    input: { flex: 1, fontSize: TEXT.body, color: c.text, paddingVertical: 0 },

    /*
      広い画面の上部。呼びかけと検索欄を大きく置き、右に絵を敷く。

      高さを決め打ちにしているのは、絵の見え方を安定させるため。
      中身に任せると、文字の折り返しで縦が伸び縮みして絵が切れる。
    */
    /*
      上部の帯。左メニューの右端から画面の右端まで、余白を置かずに敷く。

      以前は本文と同じ列に収めていたが、ご提示の画面図では絵が
      横一杯に伸びている。列に揃えるのは、上に重ねる検索欄のほう。
    */
    hero: { width: '100%' },

    /* 絵の上に重ねるもの。下端へ寄せる。 */
    heroOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: HERO_OVERLAY_BOTTOM,
    },
    /* 重ねる中身は本文と同じ列に収め、左端を揃える。 */
    heroOverlayInner: {
      width: '100%',
      maxWidth: PAGE_MAX,
      alignSelf: 'center',
      paddingHorizontal: PAGE_PAD,
    },
    searchBoxLarge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.md,
      paddingHorizontal: SPACE.lg,
      height: SEARCH_HEIGHT,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    // 文字は大きく。欄の高さは変えない。
    inputLarge: { flex: 1, fontSize: TEXT.lead, color: c.text, paddingVertical: 0 },

    /*
      ブラウザが入力欄へ描く黒い枠を消す。

      角丸の欄の上に直角の枠が重なり、壊れているように見えていた。
      押していることは、欄の縁が緑になることと、文字の入る位置に
      点滅する線が出ることで分かる。
    */
    inputNoOutline: Platform.select({
      web: { outlineStyle: 'none' },
      default: {},
    }) as object,

    /* 押しているあいだの縁。黒い枠の代わりに、こちらで示す。 */
    searchBoxOn: { borderColor: c.accent },

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
    /* 下の余白は、右下のご意見箱にいちばん下の行が隠れないだけ取る */
    browse: { paddingHorizontal: SPACE.lg, paddingBottom: FEEDBACK_BUTTON_SPACE },
    browseWide: { paddingTop: SPACE.xs },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACE.md,
      marginBottom: SPACE.sm,
    },
    sectionTitle: { fontSize: TEXT.body, fontWeight: '700', color: c.text },
    sectionMore: { fontSize: TEXT.sub, color: c.accentInk, fontWeight: '600' },
    sectionHeadWide: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SECTION_GAP,
      marginBottom: SPACE.md,
    },
    sectionTitleWide: { fontSize: TEXT.lead, fontWeight: '700', color: c.text },
    sectionMoreWide: { fontSize: TEXT.body, color: c.accentInk, fontWeight: '600' },

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
    /*
      3列に収まらない幅では2列にする。

      1024px では3列だと1枚が208pxになり、記号と余白を引いた残りは
      88px。「オフィスビル」が折り返し、説明も切れていた。
    */
    cardHalf: { width: '48%' },
    cardTitleWide: { fontSize: TEXT.title, fontWeight: '700', color: c.text },
    cardHintWide: { fontSize: TEXT.body, color: c.textMuted, marginTop: 3 },
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
    cardTitle: { fontSize: TEXT.body, fontWeight: '700', color: c.text },
    cardHint: { fontSize: TEXT.small, color: c.textMuted, marginTop: 1 },

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
    recentNameWide: { fontSize: TEXT.bodyStrong, fontWeight: '700', color: c.text },
    recentAddressWide: { fontSize: TEXT.body, color: c.textMuted, marginTop: 2 },
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
    recentName: { fontSize: TEXT.body, fontWeight: '700', color: c.text },
    recentAddress: { fontSize: TEXT.small, color: c.textMuted, marginTop: 1 },
    recentWhen: { fontSize: TEXT.small, color: c.textFaint },
    recentEmpty: { padding: SPACE.lg, fontSize: TEXT.sub, color: c.textFaint, textAlign: 'center' },

    foot: { marginTop: SPACE.lg, fontSize: TEXT.small, color: c.textFaint, textAlign: 'center' },
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
      fontSize: TEXT.sub,
      color: c.text,
      textAlign: 'center',
      lineHeight: 19,
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
    retryText: { fontSize: TEXT.body, fontWeight: '700', color: c.accentInk },

    // --- 絞り込みの結果 ---
    /*
      下は「上へ」の釦のぶんだけ空ける。
      24 のままでは、一覧の最後の行に釦がかぶっていた。
      お気に入り・履歴と同じ値を使う。
    */
    list: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, paddingBottom: SCROLL_TOP_CLEARANCE },

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
    resultPane: { flex: 1 },
    /*
      下に線を引く。一覧が線の下へ潜っていくことで、この行が
      止まっていて一覧だけが動いていると分かる。
    */
    resultHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.sm,
      backgroundColor: c.bg,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    resultCount: { flex: 1, fontSize: TEXT.sub, color: c.text, fontWeight: '700' },
    resultCountNum: { color: c.textMuted, fontWeight: '400' },
    resultClear: { fontSize: TEXT.sub, color: c.accentInk, fontWeight: '600' },

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
    rowName: { fontSize: TEXT.body, fontWeight: '700', color: c.text },
    rowAddress: { fontSize: TEXT.small, color: c.textMuted, marginTop: 1 },

    spinner: { marginTop: SPACE.xl },
    loadingMore: { paddingVertical: SPACE.lg },
    empty: { alignItems: 'center', gap: 6, paddingTop: SPACE.xl },
    emptyTitle: { fontSize: TEXT.body, fontWeight: '700', color: c.text },
    emptyBody: { fontSize: TEXT.sub, color: c.textMuted, textAlign: 'center' },
  });
}
