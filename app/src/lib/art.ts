/**
 * 画面に敷く写真の置き場。
 *
 * **ファイルを置くだけで入れ替わる。**
 *   app/public/ の中身は、そのままサイトの直下へ配られる。
 *   下の場所へ置いて配備し直せば反映され、コードは触らない。
 *
 *     app/public/art/hero-1.(jpg|png) … 上部。1枚目
 *     app/public/art/hero-2.(jpg|png) … 上部。2枚目
 *     app/public/art/hero-3.(jpg|png) … 上部。3枚目
 *     app/public/art/hero-4.(jpg|png) … 上部。4枚目
 *     app/public/art/rail.(jpg|png)   … 左メニューの下半分
 *
 *   置いていないものは読み込みに失敗し、そこは飛ばされる。
 *   1枚も無ければ下敷きの淡い緑がそのまま残る。
 *   失敗を異常として扱わず、通常の分岐として設計している。
 *
 * **番号を付けない hero も受け取る**
 *   4枚に分ける前は hero.jpg の1枚だった。番号付きが1枚も無いときは
 *   こちらを見る。入れ替えの途中で画面が空になるのを避けるため。
 *
 * **拡張子を1つに決めない理由**
 *   .jpg でお願いしたところ .png でご提供いただいた。名前が合っていれば
 *   受け取れるほうが、やり取りが1往復減る。順に試し、どちらかが読めれば
 *   それを使う。
 *
 * **require で束ねない理由**
 *   require はファイルが無いと束ね（bundle）の時点で失敗し、画面が
 *   まったく出なくなる。写真の有無がアプリを壊す作りにはしない。
 *
 * **軽くしてから配る**
 *   いただいた原本は1枚で 2.5MB あった。飾りの絵のために、施設を探す
 *   画面の表示を待たせる理由はない。`node tools/build-art.mjs` が
 *   表示に要る大きさの .jpg を作り、原本は assets/art/ へ控える。
 *
 * **ブラウザでのみ使う**
 *   これらが出るのは 1024px 以上の広い画面で、実際にはブラウザに限られる。
 *   端末側では public/ の仕組みが無く、この道は通らない。
 */
import { Platform } from 'react-native';

/** 上部の入れ替え表示の枚数 */
export const HERO_SLIDE_COUNT = 4;

/** 1枚ぶんの在り処。読めるまで順に試す。 */
const candidates = (name: string) => [`/art/${name}.jpg`, `/art/${name}.png`];

/**
 * 上部の写真。1枚ぶんずつ、試す順の配列で持つ。
 *
 * 番号付きの4枚を先に並べ、最後に番号なしを置く。番号付きが1枚も
 * 読めなかったときだけ、番号なしが残って1枚として出る。
 */
export const HERO_SLIDES: string[][] = [
  ...Array.from({ length: HERO_SLIDE_COUNT }, (_, i) => candidates(`hero-${i + 1}`)),
  candidates('hero'),
];

/** 左メニューの下半分に敷く写真 */
export const RAIL_ART_URLS = candidates('rail');

/** 写真を読みに行くか。ブラウザのときだけ。 */
export const CAN_LOAD_ART = Platform.OS === 'web';

/**
 * 1枚あたりの表示時間（ミリ秒）。
 *
 * 短いと、読もうとしている最中に背景が動いて気が散る。
 * 長すぎると、4枚あることが伝わらないまま画面を離れる。
 */
export const SLIDE_HOLD_MS = 5000;

/** 入れ替わりにかける時間（ミリ秒） */
export const SLIDE_FADE_MS = 900;
