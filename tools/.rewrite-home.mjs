/** 探す画面の描画部分を、ご提示の画面図の版面へ差し替える。 */
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'app/src/app/(tabs)/index.tsx';
const lines = readFileSync(p, 'utf8').split('\n');

const start = lines.findIndex((l) => l === '  return (');
const end = lines.findIndex((l, i) => i > start && l === '}');
if (start < 0 || end < 0) throw new Error('境目が見つかりません');

const body = String.raw`  return (
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
}`;

const out = [...lines.slice(0, start), ...body.split('\n'), ...lines.slice(end + 1)];
writeFileSync(p, out.join('\n'));
console.log(`  描画部分を差し替えました（${end - start + 1} 行 → ${body.split('\n').length} 行）`);
