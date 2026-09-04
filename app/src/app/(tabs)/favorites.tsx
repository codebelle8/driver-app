import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  const styles = makeStyles(c);

  const [entries, setEntries] = useState<FavoriteEntry[] | null>(null);

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

  async function onRemove(id: string) {
    // 先に画面から消す。控えの書き換えを待たせない。
    setEntries((prev) => (prev ?? []).filter((e) => e.facility.id !== id));
    await removeFavorite(id);
  }

  function onClear() {
    if (!entries || entries.length === 0) return;
    confirmClear(entries.length, async () => {
      setEntries([]);
      await clearFavorites();
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 広い画面で間延びしないよう、中身の幅に上限を設ける */}
      <PageWidth>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.heading}>お気に入り</Text>
            {entries !== null && entries.length > 0 && (
              <Text style={styles.count}>{entries.length} 件</Text>
            )}
          </View>
          {entries !== null && entries.length > 0 && (
            <Pressable
              onPress={onClear}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="お気に入りをすべて解除"
            >
              <Text style={styles.clearAll}>すべて解除</Text>
            </Pressable>
          )}
        </View>

        {entries === null ? (
          <ActivityIndicator style={styles.spinner} color={c.accent} />
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyBadge}>
              <Ionicons name="star-outline" size={28} color={c.accent} />
            </View>
            <Text style={styles.emptyTitle}>まだ登録がありません</Text>
            <Text style={styles.emptyBody}>
              施設の画面で「保存」または心印を押すと、ここに残ります。
            </Text>
            <Text style={styles.emptyBody}>
              よく向かう施設を留めておく場所です。
            </Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(e) => e.facility.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <FavoriteRow entry={item} onRemove={onRemove} styles={styles} c={c} />
            )}
            ListFooterComponent={
              <Text style={styles.foot}>
                {FAVORITE_LIMIT} 件まで残ります。この端末の中だけに保存しています。
              </Text>
            }
          />
        )}
      </PageWidth>
    </SafeAreaView>
  );
}

/**
 * 「すべて解除」の確かめ。
 *
 * 取り消せない操作なので、一度受け止める。
 * web には Alert が無いため、そちらは confirm を使う。
 */
function confirmClear(count: number, run: () => void) {
  const message = `${count} 件のお気に入りをすべて解除します。元には戻せません。`;

  if (Platform.OS === 'web') {
    if (window.confirm(message)) run();
    return;
  }

  Alert.alert('お気に入りをすべて解除', message, [
    { text: 'やめる', style: 'cancel' },
    { text: '解除する', style: 'destructive', onPress: run },
  ]);
}

function FavoriteRow({
  entry,
  onRemove,
  styles,
  c,
}: {
  entry: FavoriteEntry;
  onRemove: (id: string) => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  const f = entry.facility;

  return (
    <View style={styles.row}>
      <Link href={`/facility/${f.id}`} asChild>
        <Pressable style={styles.rowMain} accessibilityRole="link">
          <View style={styles.rowIcon}>
            <Ionicons name="star" size={16} color={c.accent} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowName} numberOfLines={1}>
              {f.name}
            </Text>
            <Text style={styles.rowAddress} numberOfLines={1}>
              {f.prefecture}
              {f.city ?? ''}
              {f.address_line}
            </Text>
            <Text style={styles.rowWhen}>{describeWhen(entry.at)}に登録</Text>
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
          label={`${f.name} をお気に入りから外す`}
          onPress={() => onRemove(f.id)}
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
