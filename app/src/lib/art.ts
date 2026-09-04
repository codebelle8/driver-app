/**
 * 画面に敷く写真の置き場。
 *
 * **ファイルを置くだけで入れ替わる。**
 *   app/public/ の中身は、そのままサイトの直下へ配られる。
 *   下の場所へ置いて配備し直せば反映され、コードは触らない。
 *
 *     app/public/art/hero.jpg  … 上部。呼びかけと検索欄の右側
 *     app/public/art/rail.jpg  … 左メニューの下半分
 *
 *   置いていないあいだは読み込みに失敗し、下敷きの淡い緑がそのまま残る。
 *   失敗を異常として扱わず、通常の分岐として設計している。
 *
 * **require で束ねない理由**
 *   require はファイルが無いと束ね（bundle）の時点で失敗し、画面が
 *   まったく出なくなる。「まだ写真が無い」状態は当面続くため、
 *   置いていないことがアプリを壊す作りにはしない。
 *
 * **ブラウザでのみ使う**
 *   この2枚が出るのは 1024px 以上の広い画面で、実際にはブラウザに限られる。
 *   端末側では public/ の仕組みが無く、この道は通らない。
 */
import { Platform } from 'react-native';

/** 上部に敷く写真の在り処 */
export const HERO_ART_URL = '/art/hero.jpg';

/** 左メニューの下半分に敷く写真の在り処 */
export const RAIL_ART_URL = '/art/rail.jpg';

/** 写真を読みに行くか。ブラウザのときだけ。 */
export const CAN_LOAD_ART = Platform.OS === 'web';
