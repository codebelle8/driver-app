import { readFileSync, writeFileSync } from 'node:fs';
const must = (s, a, where) => {
  if (!s.includes(a)) throw new Error(`${where}: 見つからない ${JSON.stringify(a.slice(0, 60))}`);
};

// --- お知らせ画面の戻る ---
{
  const p = 'app/src/app/notices.tsx';
  let s = readFileSync(p, 'utf8');
  const old = `        <Pressable onPress={() => router.back()} hitSlop={HIT_SLOP} accessibilityLabel="戻る">
          <Ionicons name="arrow-back" size={22} color={c.text} />
        </Pressable>`;
  must(s, old, p);
  s = s.replace(old, `        <IconButton icon="arrow-back" size={22} label="戻る" onPress={() => router.back()} />`);
  must(s, `import { PageWidth } from '@/components/page-width';`, p);
  s = s.replace(`import { PageWidth } from '@/components/page-width';`,
                `import { IconButton } from '@/components/icon-button';\nimport { PageWidth } from '@/components/page-width';`);
  writeFileSync(p, s);
  console.log('  お知らせ: 戻る');
}

// --- 履歴・お気に入りの「1件消す」 ---
for (const [p, what] of [
  ['app/src/app/(tabs)/history.tsx', '履歴から削除'],
  ['app/src/app/(tabs)/favorites.tsx', 'お気に入りから外す'],
]) {
  let s = readFileSync(p, 'utf8');
  const re = new RegExp(
    ' {6}<Pressable\n {8}onPress=\{\(\) => onRemove\(f\.id\)\}[\s\S]*?\n {6}</Pressable>',
  );
  const m = s.match(re);
  if (!m) throw new Error(`${p}: 削除ボタンが見つかりません`);
  s = s.replace(m[0],
`      <View style={styles.remove}>
        <IconButton
          icon="close"
          size={18}
          label={\`\${f.name} を${what}\`}
          onPress={() => onRemove(f.id)}
        />
      </View>`);
  must(s, `import { PageWidth } from '@/components/page-width';`, p);
  s = s.replace(`import { PageWidth } from '@/components/page-width';`,
                `import { IconButton } from '@/components/icon-button';\nimport { PageWidth } from '@/components/page-width';`);
  writeFileSync(p, s);
  console.log(`  ${p.includes('history') ? '履歴' : 'お気に入り'}: 1件消す`);
}

// --- 写真の拡大表示の「閉じる」 ---
{
  const p = 'app/src/components/photo-viewer.tsx';
  let s = readFileSync(p, 'utf8');
  const m = s.match(/ {12}<Pressable\n {14}onPress=\{close\}[\s\S]*?\n {12}<\/Pressable>/);
  if (!m) throw new Error('photo-viewer: 閉じるが見つかりません');
  s = s.replace(m[0],
`            {/*
              閉じる。写真の上に置くため、白い地に濃い記号にしてある。
              色だけを変える作りにすると、明るい写真では消える。
            */}
            <IconButton icon="close" size={22} label="閉じる" onPress={close} onDark />`);
  const anchor = s.match(/^import .*from 'react-native-reanimated';$/m);
  if (!anchor) throw new Error('photo-viewer: 取り込み位置が見つかりません');
  s = s.replace(anchor[0], `${anchor[0]}\n\nimport { IconButton } from '@/components/icon-button';`);
  writeFileSync(p, s);
  console.log('  写真の拡大: 閉じる');
}

// --- 検索欄の「消す」 ---
{
  const p = 'app/src/app/(tabs)/index.tsx';
  let s = readFileSync(p, 'utf8');
  const old = `        <Pressable onPress={() => onChange('')} hitSlop={HIT_SLOP} accessibilityLabel="消す">
          <Ionicons name="close-circle" size={big ? 19 : 18} color={c.textFaint} />
        </Pressable>`;
  must(s, old, p);
  s = s.replace(old,
`        <IconButton
          icon="close-circle"
          size={big ? 19 : 18}
          label="打ったものを消す"
          onPress={() => onChange('')}
          compact
        />`);
  must(s, `import { HeroArt } from '@/components/hero-art';`, p);
  s = s.replace(`import { HeroArt } from '@/components/hero-art';`,
                `import { HeroArt } from '@/components/hero-art';\nimport { IconButton } from '@/components/icon-button';`);
  writeFileSync(p, s);
  console.log('  検索欄: 消す');
}
