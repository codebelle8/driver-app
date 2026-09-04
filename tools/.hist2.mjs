/** 履歴画面の見出しと行に、選択の操作を入れる。 */
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'app/src/app/(tabs)/history.tsx';
let s = readFileSync(p, 'utf8');
const must = (a) => {
  if (!s.includes(a)) throw new Error('見つからない: ' + JSON.stringify(a.slice(0, 70)));
};

const old = `        {entries !== null && entries.length > 0 && (
          <Pressable
            onPress={onClear}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="履歴をすべて削除"
          >
            <Text style={styles.clearAll}>すべて削除</Text>
          </Pressable>
        )}`;
must(old);
s = s.replace(
  old,
  `        {/*
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
                  accessibilityLabel={\`選んだ \${pick.picked.size} 件を削除\`}
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
        )}`,
);

// --- 行に選択の丸を足す -------------------------------------------------------
const rowOld = `function HistoryRow({
  entry,
  onRemove,
  styles,
  c,
}: {
  entry: HistoryEntry;
  onRemove: (id: string) => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  const f = entry.facility;

  return (
    <View style={styles.row}>
      <Link href={\`/facility/\${f.id}\`} asChild>
        <Pressable style={styles.rowMain} accessibilityRole="link">`;
must(rowOld);
s = s.replace(
  rowOld,
  `function HistoryRow({
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
        accessibilityLabel={\`\${f.name}\${picked ? '（選択中）' : ''}\`}
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
      <Link href={\`/facility/\${f.id}\`} asChild>
        <Pressable style={styles.rowMain} accessibilityRole="link">`,
);

// --- 消す記号に名前を渡す -----------------------------------------------------
must(`          onPress={() => onRemove(f.id)}`);
s = s.replace(`          onPress={() => onRemove(f.id)}`, `          onPress={() => onRemove(f.id, f.name)}`);

// --- 型の取り込み -------------------------------------------------------------
must(`import { useSelection } from '@/lib/selection';`);
s = s.replace(
  `import { useSelection } from '@/lib/selection';`,
  `import { useSelection, type Selection } from '@/lib/selection';`,
);

// --- 体裁 -------------------------------------------------------------------
must(`    clearAll: { fontSize: 12, color: c.danger, fontWeight: '600' },`);
s = s.replace(
  `    clearAll: { fontSize: 12, color: c.danger, fontWeight: '600' },`,
  `    clearAll: { fontSize: 12, color: c.danger, fontWeight: '600' },
    headActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
    headAction: { fontSize: 12, color: c.accent, fontWeight: '600' },
    headActionOff: { fontSize: 12, color: c.textFaint, fontWeight: '600' },

    /* 選ばれている行。縁と地で示す。色だけだと見分けにくい方に伝わらない。 */
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
    },`,
);

writeFileSync(p, s);
console.log('  履歴: 見出しと行を更新しました');
