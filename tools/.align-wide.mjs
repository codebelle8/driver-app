/** 広い画面で、上部の帯と写真を本文の列に揃える。 */
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'app/src/app/(tabs)/index.tsx';
let s = readFileSync(p, 'utf8');
const must = (a) => {
  if (!s.includes(a)) throw new Error('見つからない: ' + JSON.stringify(a.slice(0, 70)));
};

// --- 上部の帯。中身を列の幅に収める --------------------------------------------
must(`        <View style={[styles.topBar, isWide && styles.topBarWide]}>
          {/*
            広い画面では出さない。左メニューが常に見えており、
            畳んで開くための記号は要らない。
          */}`);
s = s.replace(
  `        <View style={[styles.topBar, isWide && styles.topBarWide]}>
          {/*
            広い画面では出さない。左メニューが常に見えており、
            畳んで開くための記号は要らない。
          */}`,
  `        <View style={[styles.topBar, isWide && styles.topBarWide]}>
          {/*
            中身は本文と同じ列に収める。

            帯そのものは横一杯に伸ばし、区切りの線を画面の端まで引く。
            中身まで一緒に広げると、2560px の画面で現在地が左端、
            鐘が右端へ離れ、下の本文とどこにも揃わなくなる。
          */}
          <View style={isWide ? styles.topBarInner : styles.topBarRow}>
          {/*
            広い画面では出さない。左メニューが常に見えており、
            畳んで開くための記号は要らない。
          */}`,
);

must(`          <BellButton unseen={unseen} wide={isWide} styles={styles} c={c} />
        </View>`);
s = s.replace(
  `          <BellButton unseen={unseen} wide={isWide} styles={styles} c={c} />
        </View>`,
  `          <BellButton unseen={unseen} wide={isWide} styles={styles} c={c} />
          </View>
        </View>`,
);

// --- 体裁 -------------------------------------------------------------------
must(`    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      paddingHorizontal: SPACE.lg,
      paddingTop: SPACE.sm,
      paddingBottom: SPACE.md,
    },`);
s = s.replace(
  `    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      paddingHorizontal: SPACE.lg,
      paddingTop: SPACE.sm,
      paddingBottom: SPACE.md,
    },`,
  `    topBar: {
      paddingHorizontal: SPACE.lg,
      paddingTop: SPACE.sm,
      paddingBottom: SPACE.md,
    },
    /* 帯の中身。狭い画面ではこれが帯そのものの並びにあたる。 */
    topBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
    },
    /* 広い画面。中身を本文と同じ列に収める。 */
    topBarInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.md,
      width: '100%',
      maxWidth: PAGE_MAX,
      alignSelf: 'center',
      flex: 1,
    },`,
);

must(`    topBarWide: {
      height: HEADER_HEIGHT,
      paddingTop: 0,
      paddingBottom: 0,
      paddingHorizontal: PAGE_PAD,
      gap: SPACE.md,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },`);
s = s.replace(
  `    topBarWide: {
      height: HEADER_HEIGHT,
      paddingTop: 0,
      paddingBottom: 0,
      paddingHorizontal: PAGE_PAD,
      gap: SPACE.md,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },`,
  `    topBarWide: {
      height: HEADER_HEIGHT,
      paddingTop: 0,
      paddingBottom: 0,
      paddingHorizontal: PAGE_PAD,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },`,
);

// --- 上部の絵。列の中に収める --------------------------------------------------
must(`    hero: { height: HERO_HEIGHT, justifyContent: 'center' },`);
s = s.replace(
  `    hero: { height: HERO_HEIGHT, justifyContent: 'center' },`,
  `    /*
      絵も本文と同じ列に収める。

      以前は画面いっぱいに敷いていた。1536px では列と画面の端が
      ほぼ一致するため気づかなかったが、2560px では絵が右端に貼りつき、
      呼びかけと検索欄（列の中）とのあいだに500px の隙間ができていた。
    */
    hero: {
      height: HERO_HEIGHT,
      justifyContent: 'center',
      width: '100%',
      maxWidth: PAGE_MAX,
      alignSelf: 'center',
    },`,
);

// heroInner の重ねがけを外す（外側で列に収めたため）
must(`    heroInner: {
      width: '100%',
      maxWidth: PAGE_MAX,
      alignSelf: 'center',
      paddingHorizontal: PAGE_PAD,
    },`);
s = s.replace(
  `    heroInner: {
      width: '100%',
      maxWidth: PAGE_MAX,
      alignSelf: 'center',
      paddingHorizontal: PAGE_PAD,
    },`,
  `    heroInner: { paddingHorizontal: PAGE_PAD },`,
);

// --- 列の幅を広げる -----------------------------------------------------------
must(`const PAGE_MAX = 1240;`);
s = s.replace(
  `const PAGE_MAX = 1240;`,
  `const PAGE_MAX = 1440;`,
);
must(` * 1536px の画面では余白を引いた全幅（1184px）がそのまま入り、`);
s = s.replace(
  ` * 1536px の画面では余白を引いた全幅（1184px）がそのまま入り、
 * 画面図と同じ見え方になる。それより広い画面では、1行が長くなりすぎて
 * 目が行末から次の行頭へ戻れなくなるため、ここで止める。`,
  ` * 1536px の画面では余白を引いた全幅（1184px）がそのまま入り、
 * 画面図と同じ見え方になる。それより広い画面では、1行が長くなりすぎて
 * 目が行末から次の行頭へ戻れなくなるため、ここで止める。
 *
 * 2560px の画面で試したところ 1240px では余白が勝ちすぎ、中身が
 * 画面の半分に満たなかった。1440px まで許して釣り合いを取る。`,
);

writeFileSync(p, s);
console.log('  上部の帯と絵を列に揃え、列の幅を 1240 → 1440 にしました');
