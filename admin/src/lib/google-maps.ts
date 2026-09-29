/**
 * Google の地図を読み込む。**1か所にまとめている。**
 *
 * 施設の画面には、入口ごとの座標の地図（coord-picker）と、入口の位置の
 * 一覧地図（entry-points-map）が並ぶ。別々に読み込むと、同じ API を
 * 二度読み込んで地図が出なくなり、課金対象の呼び出しも増える。
 */

let loading: Promise<void> | null = null;

export function loadMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as { google?: { maps?: unknown } }).google?.maps) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=ja&region=JP`;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      loading = null;
      reject(new Error('地図を読み込めませんでした'));
    };
    document.head.appendChild(el);
  });
  return loading;
}

/** しずく形のピン（24×33。先が座標を指す）。アプリの施設の地図と同じ形 */
export const PIN_PATH =
  'M12 0C5.37 0 0 5.37 0 12c0 8.4 10.2 19.3 11.2 20.4a1.1 1.1 0 0 0 1.6 0C13.8 31.3 24 20.4 24 12 24 5.37 18.63 0 12 0z';

/** 入口のピンの色（アプリの主役の緑と同じ） */
export const PIN_GREEN = '#008000';
