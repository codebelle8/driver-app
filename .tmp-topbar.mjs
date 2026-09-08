import { readFileSync, writeFileSync } from 'node:fs';

const edit = (path, pairs) => {
  const raw = readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.split('\r\n').join('\n');
  for (const [from, to] of pairs) {
    const n = s.split(from).length - 1;
    if (n !== 1) throw new Error(`${path}: ${n}件一致\n---\n${from.slice(0, 120)}\n---`);
    s = s.split(from).join(to);
  }
  writeFileSync(path, crlf ? s.split('\n').join('\r\n') : s);
  console.log('  直した', path);
};

const PAGE_CONSTS = `/**
 * 広い画面の左右の余白。
 *
 * ご提示の画面図の見え方（左メニューの右端から48px）に合わせている。
 */
const PAGE_PAD = 48;

/**
 * 本文の最大幅。
 *
 * 1536px の画面では余白を引いた全幅（1184px）がそのまま入り、
 * 画面図と同じ見え方になる。それより広い画面では、1行が長くなりすぎて
 * 目が行末から次の行頭へ戻れなくなるため、ここで止める。
 *
 * 2560px の画面で試したところ 1240px では余白が勝ちすぎ、中身が画面の
 * 半分に満たなかった。1440px まで許して釣り合いを取る。
 */
const PAGE_MAX = 1440;`;

// --- 1. 余白と最大幅を、共通の置き場所へ --------------------------------------
edit('app/src/lib/layout.ts', [
  [
    `import { useWindowDimensions } from 'react-native';`,
    `import { useWindowDimensions } from 'react-native';

${PAGE_CONSTS.split('const PAGE_PAD').join('export const PAGE_PAD').split('const PAGE_MAX').join('export const PAGE_MAX')}

/*
  上の2つは探す画面だけのものだったが、上部の帯を共通の部品へ
  出したときに両方から要るようになった。同じ数を2か所へ書くと、
  片方を直したときに帯と本文の左端がずれる。
*/`,
  ],
]);

// --- 2. 探す画面から、上部の帯を取り除く --------------------------------------
edit('app/src/app/(tabs)/index.tsx', [
  [`\n${PAGE_CONSTS}\n`, '\n'],
  [
    `import { HEADER_HEIGHT, RAIL_WIDTH } from '@/components/side-rail';`,
    `import { RAIL_WIDTH } from '@/components/side-rail';`,
  ],
  [`import { countUnread, fetchNotices, getRead } from '@/lib/notices';\n`, ''],
  [`import { describePlace } from '@/lib/place';\n`, ''],
  [
    `  /** 案内できる範囲（都道府県と、その中の市区町村の数） */
  const [coverage, setCoverage] = useState<{
    prefectures: string[];
    cities: number;
    total: number;
  }>({ prefectures: [], cities: 0, total: 0 });
`,
    '',
  ],
  [`  const [atTop, setAtTop] = useState(true);
  const [unseen, setUnseen] = useState(0);
`, `  const [atTop, setAtTop] = useState(true);
`],
  [
    `      setCategories(cats);
      setCoverage(area);
      setSync((prev) => ({ ...prev, facilityCount: area.total }));
      setLoading(false);

      const [notices, read] = await Promise.all([fetchNotices(locale), getRead()]);
      if (alive) setUnseen(countUnread(notices, read));
    })();`,
    `      setCategories(cats);
      setSync((prev) => ({ ...prev, facilityCount: area.total }));
      setLoading(false);
    })();`,
  ],
  [
    `      const { cats, area } = await readLocal();
      if (!alive) return;
      setCategories(cats);
      setCoverage(area);

      const [notices, read] = await Promise.all([fetchNotices(locale), getRead()]);
      if (alive) setUnseen(countUnread(notices, read));
    })();`,
    `      const { cats } = await readLocal();
      if (!alive) return;
      setCategories(cats);
    })();`,
  ],
  [
    `        const [notices, read, history] = await Promise.all([
          fetchNotices(locale),
          getRead(),
          fetchHistory(),
        ]);
        if (!alive) return;
        setUnseen(countUnread(notices, read));
        setRecent(history.slice(0, RECENT_COUNT));`,
    `        const history = await fetchHistory();
        if (!alive) return;
        setRecent(history.slice(0, RECENT_COUNT));`,
  ],
  [
    `    const { cats, area } = await readLocal();
    setCategories(cats);
    setCoverage(area);
  }, [readLocal, locale]);`,
    `    const { cats } = await readLocal();
    setCategories(cats);
  }, [readLocal]);`,
  ],
]);
