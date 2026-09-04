/**
 * 画面に敷く写真の置き場。
 *
 * **ファイルを置くだけで入れ替わる。**
 *   app/public/ の中身は、そのままサイトの直下へ配られる。
 *   下の場所へ置いて配備し直せば反映され、コードは触らない。
 *
 *     app/public/art/hero.(jpg|png)  … 上部。呼びかけと検索欄の右側
 *     app/public/art/rail.(jpg|png)  … 左メニューの下半分
 *
 *   置いていないあいだは読み込みに失敗し、下敷きの淡い緑がそのまま残る。
 *   失敗を異常として扱わず、通常の分岐として設計している。
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
 *   いただいた原本は2枚で 4.5MB あった。飾りの絵のために、施設を探す
 *   画面の表示を待たせる理由はない。`node tools/build-art.mjs` が
 *   表示に要る大きさの .jpg を作り、原本は assets/art/ へ控える。
 *
 * **ブラウザでのみ使う**
 *   この2枚が出るのは 1024px 以上の広い画面で、実際にはブラウザに限られる。
 *   端末側では public/ の仕組みが無く、この道は通らない。
 */
import { Platform } from 'react-native';

/**
 * 試す順。軽い .jpg を先に見る。
 *
 * tools/build-art.mjs を通していれば .jpg があり、1回で当たる。
 * 通していない（置いたばかりの）場合は .png で当たる。
 */
export const HERO_ART_URLS = ['/art/hero.jpg', '/art/hero.png'];
export const RAIL_ART_URLS = ['/art/rail.jpg', '/art/rail.png'];

/** 写真を読みに行くか。ブラウザのときだけ。 */
export const CAN_LOAD_ART = Platform.OS === 'web';
