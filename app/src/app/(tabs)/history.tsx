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

import {
  clearHistory,
  fetchHistory,
  HISTORY_LIMIT,
  removeVisit,
  type HistoryEntry,
} from '@/lib/history';
import { confirmDelete } from '@/lib/confirm';
import { useSelection, type Selection } from '@/lib/selection';
import { ensureSynced } from '@/lib/sync';
import { describeWhen } from '@/lib/when';
import { HIT_SLOP, RADIUS, SPACE, type Palette } from '@/theme';
import { IconButton } from '@/components/icon-button';
import { PageWidth } from '@/components/page-width';
import { useTheme } from '@/theme-context';

/**
 * 見た施設の履歴。
 *
 * 同じ施設へ何度も向かうため、前回調べた車寄せを名前を打ち直さずに
 * 呼び戻せるようにする。並びは新しい順。
 *
 * 消す手立てを付けてある。行き先の履歴は、端末を貸したり
 * 覗かれたりしたときに、その人の仕事の中身がそのまま出る。
 * 自分で消せない履歴は残すべきではない。
 */
export default function HistoryScreen() {
  const c = useTheme();
  const styles = makeStyles(c);

  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const ids = (entries ?? []).map((e) => e.facility.id);
  const pick = useSelection(ids);

  /*
    画面へ戻るたびに読み直す。
    施設を見てから履歴を開くのが普通の流れなので、
    最初の一度だけ読む作りでは、いま見た施設が出てこない。
  */
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        /*
          端末にあるものを先に出す。

          取り込みの最中は施設が一時的に消えるため、以前は完了を待っていた。
          しかし通信が遅い場所では、履歴があるのに待たされることになる。
          先に出しておき、取り込みが終わったら引き直す。
        */
        const first = await fetchHistory();
        if (!alive) return;
        setEntries(first);

        await ensureSynced();
        const again = await fetchHistory();
        if (alive) setEntries(again);
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  /** 画面から先に消す。控えの書き換えを待たせない。 */
  function dropFromView(gone: Set<string>) {
    setEntries((prev) => (prev ?? []).filter((e) => !gone.has(e.facility.id)));
  }

  /*
    1件消す。

    消す操作は元に戻せない。指が滑って触れただけで消えるのは、
    走行前の慌ただしい場面ではとくに起こりやすいため、一度受け止める。
  */
  function onRemove(id: string, name: string) {
    confirmDelete({
      title: '履歴から削除',
      message: `「${name}」を履歴から削除します。元には戻せません。`,
      onYes: async () => {
        dropFromView(new Set([id]));
        await removeVisit(id);
      },
    });
  }

  /** 選んだぶんをまとめて消す */
  function onRemovePicked() {
    const gone = [...pick.picked];
    if (gone.length === 0) return;
    confirmDelete({
      title: '選んだ履歴を削除',
      message: `${gone.length} 件を履歴から削除します。元には戻せません。`,
      onYes: async () => {
        dropFromView(new Set(gone));
        pick.exit();
        for (const id of gone) await removeVisit(id);
      },
    });
  }

  function onClear() {
    if (!entries || entries.length === 0) return;
    confirmDelete({
      title: '履歴をすべて削除',
      message: `${entries.length} 件の履歴をすべて削除します。元には戻せません。`,
      onYes: async () => {
        setEntries([]);
        pick.exit();
        await clearHistory();
      },
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 広い画面で間延びしないよう、中身の幅に上限を設ける */}
      <PageWidth>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.heading}>履歴</Text>
          {entries !== null && entries.length > 0 && (
            <Text style={styles.count}>{entries.length} 件</Text>
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
                    {pick.allPicked ? 'すべて外す' : 'すべて選ぶ'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onRemovePicked}
                  disabled={pick.picked.size === 0}
                  hitSlop={HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel={`選んだ ${pick.picked.size} 件を削除`}
                >
                  <Text style={pick.picked.size === 0 ? styles.headActionOff : styles.clearAll}>
                    削除 ({pick.picked.size})
                  </Text>
                </Pressable>
                <Pressable onPress={pick.exit} hitSlop={HIT_SLOP} accessibilityRole="button">
                  <Text style={styles.headAction}>やめる</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  onPress={pick.toggleMode}
                  hitSlop={HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel="複数を選んで削除する"
                >
                  <Text style={styles.headAction}>選択</Text>
                </Pressable>
                <Pressable
                  onPress={onClear}
                  hitSlop={HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel="履歴をすべて削除"
                >
                  <Text style={styles.clearAll}>すべて削除</Text>
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
            <Ionicons name="time-outline" size={28} color={c.accent} />
          </View>
          <Text style={styles.emptyTitle}>まだ履歴がありません</Text>
          <Text style={styles.emptyBody}>
            調べた施設が新しい順に並びます。
          </Text>
          <Text style={styles.emptyBody}>
            同じ施設へ何度も向かう際の呼び出しに使います。
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.facility.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <HistoryRow
              entry={item}
              onRemove={onRemove}
              select={pick}
              styles={styles}
              c={c}
            />
          )}
          ListFooterComponent={
            <Text style={styles.foot}>
              新しいものから {HISTORY_LIMIT} 件まで残ります。この端末の中だけに保存しています。
            </Text>
          }
        />
      )}
      </PageWidth>
    </SafeAreaView>
  );
}

function HistoryRow({
  entry,
  onRemove,
  select,
  styles,
  c,
}: {
  entry: HistoryEntry;
  onRemove: (id: string, name: string) => void;
  select: Selection;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  const f = entry.facility;
  const picked = select.picked.has(f.id);

  /*
    選ぶ状態のときは、行を押しても施設は開かない。

    開いてしまうと、選んだつもりが画面ごと移り、戻ると選択が
    消えている、という取り違えが起きる。
  */
  if (select.on) {
    return (
      <Pressable
        onPress={() => select.toggle(f.id)}
        style={picked ? styles.rowPicked : styles.row}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: picked }}
        accessibilityLabel={`${f.name}${picked ? '（選択中）' : ''}`}
      >
        <View style={styles.rowMain}>
          <View style={picked ? styles.checkOn : styles.check}>
            {picked && <Ionicons name="checkmark" size={16} color={c.accentText} />}
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
            <Text style={styles.rowWhen}>{describeWhen(entry.at)}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <Link href={`/facility/${f.id}`} asChild>
        <Pressable style={styles.rowMain} accessibilityRole="link">
          <View style={styles.rowIcon}>
            <Ionicons name="time-outline" size={16} color={c.accent} />
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
            <Text style={styles.rowWhen}>{describeWhen(entry.at)}</Text>
          </View>
        </Pressable>
      </Link>

      {/*
        1件ずつ消せるようにする。指で払う操作にすると、
        走行前の慌ただしい場面で気づかれない。
      */}
      <View style={styles.remove}>
        <IconButton
          icon="close"
          size={18}
          label={`${f.name} を履歴から削除`}
          onPress={() => onRemove(f.id, f.name)}
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
