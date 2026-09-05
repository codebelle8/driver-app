/**
 * Google の地図を読み込む。
 *
 * **1か所にまとめた理由**
 *   施設の画面と探す画面が、それぞれ同じ読み込みを持っていた。
 *   言語の切り替えを入れたとき、片方だけ日本語のまま残った。
 *
 * **言語は最初の読み込みで決まる**
 *   Maps の JavaScript API は、読み込み時の language をあとから
 *   変えられない。切り替えたあとに地図の文字が前の言語のまま
 *   残ることがあるが、開き直せば揃う。
 *
 *   地図ごとに読み込み直す作りにはしない。API を二重に読み込むと
 *   グローバルが衝突し、地図が出なくなる。
 *
 * **region は JP のまま**
 *   region は「どの国から見た地図か」を決めるもので、表示言語とは別。
 *   案内するのは日本国内の施設なので、英語表示でも JP が正しい。
 */
import type { Locale } from './i18n/dictionaries';

let loading: Promise<void> | null = null;
/** 実際に読み込んだ言語。切り替え後の食い違いを判じるのに使う。 */
let loadedLocale: Locale | null = null;

export function loadMaps(key: string, locale: Locale): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('web ではありません'));
  }

  const w = window as unknown as { google?: { maps?: unknown } };
  if (w.google?.maps) return Promise.resolve();
  if (loading) return loading;

  loadedLocale = locale;
  loading = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(key)}&language=${locale}&region=JP`;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('地図を読み込めませんでした'));
    document.head.appendChild(el);
  });
  return loading;
}

/** 読み込んだ言語と、いま選ばれている言語が食い違っているか */
export function mapsLocaleStale(locale: Locale): boolean {
  return loadedLocale !== null && loadedLocale !== locale;
}

/**
 * 地図に共通で渡す設定。
 *
 * **航空写真へ切り替えられるようにする**
 *   建物の形と車寄せの位置は、地図の線より写真のほうが読み取れる。
 *   追加の費用はかからない（同じ地図の読み込みの中の切り替え）。
 *
 * **全画面と鍵盤の説明は出さない**
 *   画面の中に収めて使うもので、全画面にすると戻り方が分からなくなる。
 *   鍵盤の説明は、指で使う画面では場所を取るだけ。
 *
 * **ストリートビューは出さない**
 *   人形を置くたびに別の課金が発生する。要否は発注元の判断待ち。
 */
export const MAP_OPTIONS = {
  mapTypeControl: true,
  /*
    出す種類は地図と航空写真の2つに絞る。

    既定では「地形」「ラベル無しの写真」まで並び、走行前に
    選ぶには多い。hybrid（写真＋地名）にしているのは、
    写真だけでは通りの名前が読み取れないため。
  */
  mapTypeControlOptions: { mapTypeIds: ['roadmap', 'hybrid'] as string[] },
  streetViewControl: false,
  fullscreenControl: false,
  keyboardShortcuts: false,
};
