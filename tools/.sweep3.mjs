/** 残りの記号ボタンを、押した反応のある部品へ揃える。 */
import { readFileSync, writeFileSync } from 'node:fs';

const must = (s, a, where) => {
  if (!s.includes(a)) throw new Error(`${where}: 見つからない ${JSON.stringify(a.slice(0, 60))}`);
};

/**
 * 目印の行から前後へ辿って、その Pressable の塊を差し替える。
 *
 * ファイルの先頭から探すと、別の Pressable を掴む。実際に
 * 「すべて削除」のほうを掴みかけた。
 */
function replaceAround(s, marker, next, where) {
  const lines = s.split('\n');
  const at = lines.findIndex((l) => l.includes(marker));
  if (at < 0) throw new Error(`${where}: 目印 ${marker} が見つかりません`);

  let from = at;
  while (from >= 0 && lines[from].trim() !== '<Pressable') from--;
  let to = at;
  while (to < lines.length && lines[to].trim() !== '</Pressable>') to++;
  if (from < 0 || to >= lines.length) throw new Error(`${where}: 塊の境目が見つかりません`);

  return [...lines.slice(0, from), ...next.split('\n'), ...lines.slice(to + 1)].join('\n');
}

for (const [p, what] of [
  ['app/src/app/(tabs)/history.tsx', '履歴から削除'],
  ['app/src/app/(tabs)/favorites.tsx', 'お気に入りから外す'],
]) {
  let s = readFileSync(p, 'utf8');
  const next = `      <View style={styles.remove}>
        <IconButton
          icon="close"
          size={18}
          label={\`\${f.name} を${what}\`}
          onPress={() => onRemove(f.id)}
        />
      </View>`;
  s = replaceAround(s, 'onPress={() => onRemove(f.id)}', next, p);

  must(s, `import { PageWidth } from '@/components/page-width';`, p);
  s = s.replace(
    `import { PageWidth } from '@/components/page-width';`,
    `import { IconButton } from '@/components/icon-button';\nimport { PageWidth } from '@/components/page-width';`,
  );
  writeFileSync(p, s);
  console.log(`  ${p.includes('history') ? '履歴' : 'お気に入り'}: 1件消す`);
}

// --- 写真の拡大表示の「閉じる」 -----------------------------------------------
{
  const p = 'app/src/components/photo-viewer.tsx';
  let s = readFileSync(p, 'utf8');
  const next = `            {/*
              閉じる。写真の上に置くため、白い地に濃い記号にしてある。
              色だけを変える作りにすると、明るい写真では消える。
            */}
            <IconButton icon="close" size={22} label="閉じる" onPress={close} onDark />`;
  s = replaceAround(s, 'onPress={close}', next, p);

  const anchor = s.match(/^import .*from 'react-native-reanimated';$/m);
  if (!anchor) throw new Error('photo-viewer: 取り込み位置が見つかりません');
  s = s.replace(anchor[0], `${anchor[0]}\n\nimport { IconButton } from '@/components/icon-button';`);
  writeFileSync(p, s);
  console.log('  写真の拡大: 閉じる');
}

// --- 検索欄の「消す」 --------------------------------------------------------
{
  const p = 'app/src/app/(tabs)/index.tsx';
  let s = readFileSync(p, 'utf8');
  const old = `        <Pressable onPress={() => onChange('')} hitSlop={HIT_SLOP} accessibilityLabel="消す">
          <Ionicons name="close-circle" size={big ? 19 : 18} color={c.textFaint} />
        </Pressable>`;
  must(s, old, p);
  s = s.replace(
    old,
    `        <IconButton
          icon="close-circle"
          size={big ? 19 : 18}
          label="打ったものを消す"
          onPress={() => onChange('')}
          compact
        />`,
  );
  must(s, `import { HeroArt } from '@/components/hero-art';`, p);
  s = s.replace(
    `import { HeroArt } from '@/components/hero-art';`,
    `import { HeroArt } from '@/components/hero-art';\nimport { IconButton } from '@/components/icon-button';`,
  );
  writeFileSync(p, s);
  console.log('  検索欄: 消す');
}
