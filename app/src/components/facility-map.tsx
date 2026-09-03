import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StaticMap } from '@/components/static-map';

/**
 * 施設の地図。
 *
 * **Google マップ（Maps JavaScript API）を使う**
 *   クライアント様のご要望が「Google マップ連携」であり、
 *   管理画面でも同じ API を使っている。鍵は1本で足りる。
 *
 * **鍵が無い・読み込めない場合は国土地理院へ落とす**
 *   地図が出ないより、別の地図でも位置が分かるほうがよい。
 *   鍵の設定が済んでいない環境でも、アプリは成り立つ。
 *
 * **動かせる地図にしている**
 *   Google の地図は指で動かせるのが当たり前の形で、動かない地図は
 *   壊れているように見える。ナビの開始は下の「経路」が担う。
 */

/** 地図の寄り具合。建物と前の道路が読める程度。 */
const ZOOM = 17;

let loading: Promise<void> | null = null;

/** Google の地図を読み込む。一度きり。 */
function loadMaps(key: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('web ではありません'));
  const w = window as unknown as { google?: { maps?: unknown } };
  if (w.google?.maps) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(key)}&language=ja&region=JP`;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('地図を読み込めませんでした'));
    document.head.appendChild(el);
  });
  return loading;
}

export function FacilityMap({
  lat,
  lng,
  /** ピンに添える短い説明（例: 車寄せ） */
  label,
  width,
  height,
}: {
  lat: number | null;
  lng: number | null;
  label?: string;
  width: number;
  height: number;
}) {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const box = useRef<View>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!key || lat === null || lng === null) return;
    let alive = true;

    loadMaps(key)
      .then(() => {
        // View の実体は div。web でのみ触れる。
        const el = box.current as unknown as HTMLElement | null;
        if (!alive || !el) return;

        const g = (window as unknown as { google: typeof google }).google;
        const map = new g.maps.Map(el, {
          center: { lat, lng },
          zoom: ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          keyboardShortcuts: false,
        });

        new g.maps.Marker({ map, position: { lat, lng }, title: label });
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
    };
  }, [key, lat, lng, label]);

  // 鍵が無い・読み込めない・座標が無い場合は国土地理院の地図
  if (!key || failed || lat === null || lng === null) {
    return <StaticMap lat={lat} lng={lng} label={label} width={width} height={height} />;
  }

  return <View ref={box} style={[styles.map, { width, height }]} />;
}

const styles = StyleSheet.create({
  map: { overflow: 'hidden' },
});
