/**
 * 画面幅ごとの作り分け。
 *
 * **なぜ要るか**
 *   PWA にしたことで、同じ画面が iPhone でも 27インチの外部画面でも開く。
 *   スマホ用の1枚を引き伸ばすと、1920px の画面でカード1枚が868px幅になり、
 *   中身は左端に寄ったまま、下半分が真っ白という見た目になっていた。
 *
 * **誰が PC で開くか**
 *   乗務員の方はスマホで、走行前に1件だけ調べる。
 *   PC で開くのは事務所側で、一覧を眺めて突き合わせる使い方になる。
 *   広い画面では「一度に見渡せること」を優先する。
 *
 * **区切りの決め方**
 *   端末の種類では分けない。同じ iPad でも横向きと縦向きで使える幅が違い、
 *   PC でも窓を半分にすればスマホと同じ幅になる。**そのときの幅だけ**で決める。
 *
 *     〜767      スマホ。1段組み。下タブ。
 *     768〜1023  タブレット。2段組みだが、案内は縦積みのまま。
 *     1024〜     PC。左の縦メニュー。一覧と地図を左右に並べる。
 */
import { useWindowDimensions } from 'react-native';

/** 2段組みに切り替える幅 */
export const MEDIUM = 768;

/** 左メニューと左右分割に切り替える幅 */
export const WIDE = 1024;

/**
 * 中身の最大幅。
 *
 * 本文の1行が長くなりすぎると、目が行末から次の行頭へ戻れなくなる。
 * 日本語で読みやすいのは1行40字前後で、この幅がおよその上限にあたる。
 * 左右分割の画面はこれに縛られない（地図は広いほうがよい）。
 */
export const CONTENT_MAX = 1120;

export interface Layout {
  width: number;
  height: number;
  /** 768px 以上。2段組みにしてよい */
  isMedium: boolean;
  /** 1024px 以上。左メニューと左右分割を出す */
  isWide: boolean;
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isMedium: width >= MEDIUM,
    isWide: width >= WIDE,
  };
}
