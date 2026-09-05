import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { PageWidth } from '@/components/page-width';
import {
  clearFavorites,
  FAVORITE_LIMIT,
  fetchFavorites,
  removeFavorite,
  type FavoriteEntry,
} from '@/lib/favorites';
import { confirmDelete } from '@/lib/confirm';
import { useLocale, useT } from '@/lib/i18n/context';
import { snapshotName } from '@/lib/gone';
import { notify } from '@/lib/notice';
import { facilityAddress, facilityName } from '@/lib/localized';
import { fill, type Dictionary } from '@/lib/i18n/dictionaries';
import { useSelection, type Selection } from '@/lib/selection';
import { ensureSynced } from '@/lib/sync';
import { describeWhen } from '@/lib/when';
import { HIT_SLOP, RADIUS, SPACE, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * お気に入りの施設。
 *
 * 履歴は見た順に流れていくため、よく行く施設ほど下へ埋もれる。
 * 手で留めたものだけを、留めた順に並べる。
 *
 * 消す手立てを付けてある。行き先の一覧は、端末を貸したり覗かれたり
 * したときに、その人の仕事の中身がそのまま出る（履歴と同じ扱い）。
 */
export default function FavoritesScreen() {
  const c = useTheme();
  const t = useT();
  const styles = makeStyles(c);

  const [entries, setEntries] = useState<FavoriteEntry[] | null>(null);
  const ids = (entries ?? []).map((e) => e.id);
  const pick = useSelection(ids);

  /*
    画面へ戻るたびに読み直す。
    施設の画面で留めてからここへ来るのが普通の流れなので、
    最初の一度だけ読む作りでは、いま留めたものが出てこない。
  */
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        /*
          端末にあるものを先に出す。

          取り込みの最中は施設が一時的に消える。完了を待つと、
          通信の遅い場所で、留めてあるのに待たされることになる。
        */
        const first = await fetchFavorites();
        if (!alive) return;
        setEntries(first);

        await ensureSynced();
        const again = await fetchFavorites();
        if (alive) setEntries(again);
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  /** 画面から先に消す。控えの書き換えを待たせない。 */
  function dropFromView(gone: Set<string>) {
    setEntries((prev) => (prev ?? []).filter((e) => !gone.has(e.id)));
  }

  /*
    1件外す。

    留めたものを外す操作は元に戻せない。指が滑って触れただけで
    外れるのは、走行前の慌ただしい場面ではとくに起こりやすい。
  */
  async function drop(id: string) {
    dropFromView(new Set([id]));
    await removeFavorite(id);
  }

  /**
   * @param silent 確かめを飛ばす。管理者に消された施設は、
   *   押した時点で理由を伝えており、そのうえで「外しますか」と
   *   もう一度聞くのは手間でしかない。
   */
  function onRemove(id: string, name: string, silent = false) {
    if (silent) {
      void drop(id);
      return;
    }
    confirmDelete({
      title: t.favorites.removeOne,
      message: fill(t.favorites.removeOneBody, { name }),
      yes: t.favorites.yesRemove,
      onYes: () => void drop(id),
    });
  }

  /** 選んだぶんをまとめて外す */
  function onRemovePicked() {
    const gone = [...pick.picked];
    if (gone.length === 0) return;
    confirmDelete({
      title: t.favorites.removePicked,
      message: fill(t.favorites.removePickedBody, { n: gone.length }),
      yes: t.favorites.yesRemove,
      onYes: async () => {
        dropFromView(new Set(gone));
        pick.exit();
        for (const id of gone) await removeFavorite(id);
      },
    });
  }

  function onClear() {
    if (!entries || entries.length === 0) return;
    confirmDelete({
      title: t.favorites.clearTitle,
      message: fill(t.favorites.clearBody, { n: entries.length }),
      yes: t.favorites.yesClear,
      onYes: async () => {
        setEntries([]);
        pick.exit();
        await clearFavorites();
      },
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 広い画面で間延びしないよう、中身の幅に上限を設ける */}
      <PageWidth>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.heading}>{t.favorites.title}</Text>
            {entries !== null && entries.length > 0 && (
              <Text style={styles.count}>{fill(t.common.count, { n: entries.length })}</Text>
            )}
          </View>
          {/*
            選ぶ状態のときは、選択に関わる操作だけを出す。
            普段の操作と混ぜると、どれが今できることか読み取れない。
          */}
          {entries !== null && entries.length > 0 && (
            <View style={styles.headActions}>
              {pick.on ? (
                <>
                  <Pressable onPress={pick.toggleAll} hitSlop={HIT_SLOP} accessibilityRole="button">
                    <Text style={styles.headAction}>
                      {pick.allPicked ? t.common.unselectAll : t.common.selectAll}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={onRemovePicked}
                    disabled={pick.picked.size === 0}
                    hitSlop={HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel={fill(t.favorites.removePickedLabel, { n: pick.picked.size })}
                  >
                    <Text style={pick.picked.size === 0 ? styles.headActionOff : styles.clearAll}>
                      {fill(t.favorites.removeCount, { n: pick.picked.size })}
                    </Text>
                  </Pressable>
                  <Pressable onPress={pick.exit} hitSlop={HIT_SLOP} accessibilityRole="button">
                    <Text style={styles.headAction}>{t.common.stop}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={pick.toggleMode}
                    hitSlop={HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel={t.favorites.selectLabel}
                  >
                    <Text style={styles.headAction}>{t.common.select}</Text>
                  </Pressable>
                  <Pressable
                    onPress={onClear}
                    hitSlop={HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel={t.favorites.clearAllLabel}
                  >
                    <Text style={styles.clearAll}>{t.favorites.clearAll}</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>

        {entries === null ? (
          <ActivityIndicator style={styles.spinner} color={c.accent} />
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyBadge}>
              <Ionicons name="star-outline" size={28} color={c.accent} />
            </View>
            <Text style={styles.emptyTitle}>{t.favorites.emptyTitle}</Text>
            <Text style={styles.emptyBody}>
              {t.favorites.emptyBody}
            </Text>
            <Text style={styles.emptyBody}>
              {t.favorites.emptyHint}
            </Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(e) => e.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <FavoriteRow
                entry={item}
                onRemove={onRemove}
                select={pick}
                styles={styles}
                c={c}
              />
            )}
            ListFooterComponent={
              <Text style={styles.foot}>
                {fill(t.favorites.limit, { n: FAVORITE_LIMIT })}
              </Text>
            }
          />
        )}
      </PageWidth>
    </SafeAreaView>
  );
}

function FavoriteRow({
  entry,
  onRemove,
  select,
  styles,
  c,
}: {
  entry: FavoriteEntry;
  onRemove: (id: string, name: string, silent?: boolean) => void;
  select: Selection;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  const t = useT();
  const { locale } = useLocale();
  const f = entry.facility;
  const picked = select.picked.has(entry.id);

  /*
    管理者に消された施設。

    黙って一覧から落とすと、留めておいたはずのものが理由もなく
    無くなった形になる。押されたときに理由を伝えて外す。
  */
  const goneName = snapshotName(entry.snapshot, locale) ?? t.common.deletedFacility;

  if (!f && !select.on) {
    return (
      <Pressable
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={`${goneName} — ${t.common.deletedBadge}`}
        onPress={() => {
          notify(t.notice.facilityGone, t.notice.facilityGoneBody, 'error');
          onRemove(entry.id, goneName, true);
        }}
      >
        <View style={styles.rowMain}>
          <View style={styles.rowIcon}>
            <Ionicons name="alert-circle-outline" size={16} color={c.textFaint} />
          </View>
          <View style={styles.rowBody}>
            <Text style={[styles.rowName, styles.rowGone]} numberOfLines={1}>
              {goneName}
            </Text>
            <Text style={styles.rowAddress}>{t.common.deletedBadge}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  /*
    選ぶ状態のときは、行を押しても施設は開かない。

    開いてしまうと、選んだつもりが画面ごと移り、戻ると選択が
    消えている、という取り違えが起きる。
  */
  if (select.on) {
    return (
      <Pressable
        onPress={() => select.toggle(entry.id)}
        style={picked ? styles.rowPicked : styles.row}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: picked }}
        accessibilityLabel={`${f ? facilityName(f, locale) : goneName}${picked ? t.common.selected : ''}`}
      >
        <View style={styles.rowMain}>
          <View style={picked ? styles.checkOn : styles.check}>
            {picked && <Ionicons name="checkmark" size={16} color={c.accentText} />}
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowName} numberOfLines={1}>
              {f ? facilityName(f, locale) : goneName}
            </Text>
            <Text style={styles.rowAddress} numberOfLines={1}>
              {f ? facilityAddress(f, locale) : t.common.deletedBadge}
            </Text>
            <Text style={styles.rowWhen}>
              {fill(t.favorites.addedAt, { when: describeWhen(entry.at, t) })}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <Link href={`/facility/${entry.id}`} asChild>
        <Pressable style={styles.rowMain} accessibilityRole="link">
          <View style={styles.rowIcon}>
            <Ionicons name="star" size={16} color={c.accent} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowName} numberOfLines={1}>
              {f ? facilityName(f, locale) : goneName}
            </Text>
            <Text style={styles.rowAddress} numberOfLines={1}>
              {f ? facilityAddress(f, locale) : t.common.deletedBadge}
            </Text>
            <Text style={styles.rowWhen}>
              {fill(t.favorites.addedAt, { when: describeWhen(entry.at, t) })}
            </Text>
          </View>
        </Pressable>
      </Link>

      {/*
        1件ずつ外せるようにする。指で払う操作にすると、
        走行前の慌ただしい場面で気づかれない。
      */}
      <View style={styles.remove}>
        <IconButton
          icon="close"
          size={18}
          label={fill(t.favorites.rowRemove, { name: facilityName(f!, locale) })}
          onPress={() => onRemove(entry.id, facilityName(f!, locale))}
        />
      </View>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },

    head: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: SPACE.lg,
      paddingTop: SPACE.md,
      paddingBottom: SPACE.sm,
    },
    headText: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm },
    heading: { fontSize: 22, fontWeight: '800', color: c.accent },
    count: { fontSize: 12, color: c.textMuted },
    clearAll: { fontSize: 12, color: c.danger, fontWeight: '600' },
    headActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
    headAction: { fontSize: 12, color: c.accent, fontWeight: '600' },
    headActionOff: { fontSize: 12, color: c.textFaint, fontWeight: '600' },

    /* 選ばれている行。縁と地の両方で示す。色だけだと見分けにくい方に伝わらない。 */
    rowPicked: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACE.sm,
      borderRadius: RADIUS.md,
      backgroundColor: c.accentSoft,
      borderWidth: 1,
      borderColor: c.accent,
    },
    check: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 2,
      borderColor: c.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },

    list: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xl },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACE.sm,
      borderRadius: RADIUS.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      padding: SPACE.md,
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
    /* 消えた施設は、押せることだけ残して淡くする */
    rowGone: { color: c.textFaint, textDecorationLine: 'line-through' },
    rowWhen: { fontSize: 10, color: c.textFaint, marginTop: 3 },
    remove: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 4,
    },

    spinner: { marginTop: SPACE.xl },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: SPACE.xl,
      paddingBottom: SPACE.xl,
    },
    emptyBadge: {
      width: 64,
      height: 64,
      borderRadius: RADIUS.md,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACE.sm,
    },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    emptyBody: { fontSize: 12, color: c.textMuted, textAlign: 'center', lineHeight: 18 },

    foot: {
      marginTop: SPACE.md,
      fontSize: 11,
      color: c.textFaint,
      textAlign: 'center',
      lineHeight: 17,
    },
  });
}
