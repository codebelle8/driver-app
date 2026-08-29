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

/**
 * 検索の照合で無視する文字。
 *
 * **空白**
 *   打つ人によって入れたり入れなかったりする。「ハイアット セントリック 銀座東京」を
 *   空白なしで打つと引けない、という状態になっていた。走行前に急いで打つ場面で、
 *   空白の有無を合わせろというのは無理がある。
 *
 * **括弧・カンマ**
 *   問い合わせ側では以前から取り除いていたが、登録側では残していた。
 *   そのため「トランクホテル CAT STREET(TRUNK)」を名前のとおり打つと
 *   引けなかった。両側で同じものを落とす。
 *
 * **中黒（・）**
 *   「シャングリ・ラ」「コートヤード・バイ・マリオット」のように区切りで使われるが、
 *   打つ人はまず入れない。空白とまったく同じ事情なので一緒に落とす。
 *
 * `%` と `_` は問い合わせで別の意味を持つため、ここで落としておく。
 */
const IGNORED = /[\s　%_,()・]+/g;

/** 検索語をデータベース上の表記へ揃える */
export function normalizeSearchText(input: string): string {
  let out = '';
  for (const ch of input) {
    out += TABLE.get(ch) ?? ch;
  }
  return out.toLowerCase().replace(IGNORED, '');
}

/**
 * 施設の各項目から、照合用の1つの文字列を組み立てる。
 *
 * **項目ごとに変換してから、空白でつなぐ。**
 *   先に全部つないでから空白を落とすと、項目の切れ目が消えて
 *   「前の項目の末尾＋次の項目の先頭」という、どこにも書かれていない
 *   語ができてしまう。実際に「丸ノ内ホテル」で、名前の末尾「…丸の内」と
 *   よみの先頭「ほてる…」がつながり、別の施設に当たっていた。
 *
 *   問い合わせ側では空白を落とすので、ここに残した空白をまたぐ語は
 *   決して一致しない。切れ目として確実に働く。
 *
 * サーバー側 (facilities_refresh_search_text) と同じ組み立て方にすること。
 */
export function buildSearchText(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => normalizeSearchText(p ?? ''))
    .filter(Boolean)
    .join(' ');
}

/**
 * PostgREST の ilike に渡すパターンを作る。
 *
 * 落とす文字は normalizeSearchText が持っている。登録側とまったく同じ
 * 変換をかけることで、「名前のとおり打ったのに引けない」を防ぐ。
 *
 * 記号を「除去」していて「エスケープ」していないのは、施設名にこれらが
 * 含まれても検索の手がかりにならず、エスケープの複雑さに見合わないため。
 */
export function toSearchPattern(input: string): string | null {
  const cleaned = normalizeSearchText(input);
  if (cleaned === '') return null;
  return `%${cleaned}%`;
}
