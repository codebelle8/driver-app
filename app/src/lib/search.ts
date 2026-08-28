/**
 * 検索語の正規化。
 *
 * データベース側の `normalize_search_text()` と**同じ変換**を行う。
 * 施設側は登録時にこの変換をかけた文字列を `search_text` 列へ持ち、
 * そこに trigram 索引が張られている。
 *
 * 変換対象を片方だけ広げてはいけない:
 *   たとえばアプリ側だけ「ヴ→ゔ」を足すと、「ヴィラ」で検索したときに
 *   データベース側の「ヴィラ」（変換されていない）と一致しなくなる。
 *   完全でなくてよいので、両者が同一であることが重要。
 *
 * 日本語の検索に全文検索（tsvector）を使っていない理由:
 *   日本語は単語が空白で区切られないため、「グランドホテル汐留」が
 *   1語として扱われ、「汐留」で引けなくなる。部分一致が必要。
 */

/** supabase/migrations/20260807000001_initial_schema.sql と同一 */
const KATAKANA =
  'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロワヲンー';
const HIRAGANA =
  'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろわをんー';

const TABLE = new Map<string, string>();
for (let i = 0; i < KATAKANA.length; i++) {
  TABLE.set(KATAKANA[i], HIRAGANA[i]);
}

/** 検索語をデータベース上の表記へ揃える */
export function normalizeSearchText(input: string): string {
  let out = '';
  for (const ch of input) {
    out += TABLE.get(ch) ?? ch;
  }
  return out.toLowerCase();
}

/**
 * PostgREST の ilike に渡すパターンを作る。
 *
 * `%` `_` `,` `(` `)` は問い合わせ側で別の意味を持つため取り除く。
 *
 * 取り除いたあとに空白を1つへ詰めているのは、`100%_ホテル` のように
 * 記号が連続した場合、置き換えた空白がそのまま連続してしまい、
 * データベース側の文字列（空白は1つ）と一致しなくなるため。
 *
 * 記号を「除去」していて「エスケープ」していないのは、施設名にこれらが
 * 含まれることが実質なく、エスケープの複雑さに見合わないため。
 */
export function toSearchPattern(input: string): string | null {
  const cleaned = normalizeSearchText(input)
    .replace(/[%_,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '') return null;
  return `%${cleaned}%`;
}
