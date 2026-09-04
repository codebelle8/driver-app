/**
 * 画面に敷く写真の置き場。
 *
 * **なぜ1か所にまとめるか**
 *   ご提示の画面図には2枚の写真が入る。まだ受け取っていないため、
 *   いまは写真を使わない見た目にしてある。届いたときに画面ごとを
 *   探して回らずに済むよう、取り込みと有無の判定をここへ集めた。
 *
 * **差し替えの手順**
 *   1. 次の2枚を置く。
 *        app/src/assets/art/hero.jpg  … 上部。ホテルの車寄せに車が着いた図
 *        app/src/assets/art/rail.jpg  … 左メニューの下半分。並木道と車
 *   2. 下の HAS_ART を true にする。
 *   3. require の行のコメントを外す。
 *
 *   画面側は触らない。
 *
 * **寸法の目安**（横長で、右側に主題を置くと収まりがよい）
 *   hero.jpg … 1600×760 前後
 *   rail.jpg …  520×760 前後（縦長）
 */

/**
 * 写真が入っているか。
 *
 * false のあいだは、写真の代わりに淡い緑の面を敷く。
 * 「読み込みに失敗した箱」ではなく、それ自体で成り立つ面にしてある。
 */
export const HAS_ART = false;

/*
  写真を置いたら、次の2行のコメントを外して上の HAS_ART を true にする。

  ファイルが無いまま require を書くと、束ね（bundle）の時点で失敗して
  画面がまったく出なくなる。そのため既定では書かない。
*/
// export const HERO_ART = require('@/assets/art/hero.jpg');
// export const RAIL_ART = require('@/assets/art/rail.jpg');

export const HERO_ART: number | null = null;
export const RAIL_ART: number | null = null;
