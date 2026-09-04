/** 履歴画面に、確認と複数選択を入れる。 */
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'app/src/app/(tabs)/history.tsx';
let s = readFileSync(p, 'utf8');
const must = (a) => {
  if (!s.includes(a)) throw new Error('見つからない: ' + JSON.stringify(a.slice(0, 70)));
};

// --- 取り込み ---------------------------------------------------------------
must(`import { IconButton } from '@/components/icon-button';`);
s = s.replace(
  `import { IconButton } from '@/components/icon-button';`,
  `import { IconButton } from '@/components/icon-button';`,
);
must(`import { ensureSynced } from '@/lib/sync';`);
s = s.replace(
  `import { ensureSynced } from '@/lib/sync';`,
  `import { confirmDelete } from '@/lib/confirm';
import { useSelection } from '@/lib/selection';
import { ensureSynced } from '@/lib/sync';`,
);

// --- 状態 -------------------------------------------------------------------
must(`  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);`);
s = s.replace(
  `  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);`,
  `  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const ids = (entries ?? []).map((e) => e.facility.id);
  const pick = useSelection(ids);`,
);

// --- 消す処理 ---------------------------------------------------------------
must(`  async function onRemove(id: string) {
    // 先に画面から消す。控えの書き換えを待たせない。
    setEntries((prev) => (prev ?? []).filter((e) => e.facility.id !== id));
    await removeVisit(id);
  }

  function onClear() {
    if (!entries || entries.length === 0) return;
    confirmClear(entries.length, async () => {
      setEntries([]);
      await clearHistory();
    });
  }`);
s = s.replace(
  `  async function onRemove(id: string) {
    // 先に画面から消す。控えの書き換えを待たせない。
    setEntries((prev) => (prev ?? []).filter((e) => e.facility.id !== id));
    await removeVisit(id);
  }

  function onClear() {
    if (!entries || entries.length === 0) return;
    confirmClear(entries.length, async () => {
      setEntries([]);
      await clearHistory();
    });
  }`,
  `  /** 画面から先に消す。控えの書き換えを待たせない。 */
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
      message: \`「\${name}」を履歴から削除します。元には戻せません。\`,
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
      message: \`\${gone.length} 件を履歴から削除します。元には戻せません。\`,
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
      message: \`\${entries.length} 件の履歴をすべて削除します。元には戻せません。\`,
      onYes: async () => {
        setEntries([]);
        pick.exit();
        await clearHistory();
      },
    });
  }`,
);

// --- 見出しの並び -----------------------------------------------------------
must(`          {entries !== null && entries.length > 0 && (
            <Pressable
              onPress={onClear}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="履歴をすべて削除"
            >
              <Text style={styles.clearAll}>すべて削除</Text>
            </Pressable>
          )}`);
s = s.replace(
  `          {entries !== null && entries.length > 0 && (
            <Pressable
              onPress={onClear}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="履歴をすべて削除"
            >
              <Text style={styles.clearAll}>すべて削除</Text>
            </Pressable>
          )}`,
  `          {/*
            選ぶ状態のときは、選択に関わる操作だけを出す。
            普段の操作と混ぜると、どれが今できることか読み取れない。
          */}
          {entries !== null && entries.length > 0 && (
            <View style={styles.headActions}>
              {pick.on ? (
                <>
                  <Pressable
                    onPress={pick.toggleAll}
                    hitSlop={HIT_SLOP}
                    accessibilityRole="button"
                  >
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
                    <Text
                      style={
                        pick.picked.size === 0 ? styles.headActionOff : styles.clearAll
                      }
                    >
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

// --- 行 ---------------------------------------------------------------------
must(`            <HistoryRow entry={item} onRemove={onRemove} styles={styles} c={c} />`);
s = s.replace(
  `            <HistoryRow entry={item} onRemove={onRemove} styles={styles} c={c} />`,
  `            <HistoryRow
              entry={item}
              onRemove={onRemove}
              select={pick}
              styles={styles}
              c={c}
            />`,
);

writeFileSync(p, s);
console.log('  履歴: 確認と複数選択の骨格を入れました');
