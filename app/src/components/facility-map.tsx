import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StaticMap } from '@/components/static-map';
import { useLocale } from '@/lib/i18n/context';
import { loadMaps, MAP_OPTIONS } from '@/lib/maps';
import { useTheme } from '@/theme-context';

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
 *   **端末（Expo Go・APK）では常にこちら**（Google の地図は web でしか読めない）。
 *
 * **動かせる地図にしている**
 *   Google の地図は指で動かせるのが当たり前の形で、動かない地図は
 *   壊れているように見える。ナビの開始は下の「経路」が担う。
 *
 * **入口ごとにピンを立てる**（ご指摘 2026-09-29）
 *   以前は先頭の入口（A）の1本しか立てていなかった。進入路が2つある施設で、
 *   地図には1つしか無いように見えていた。
 *
 *   * ピンには下のカードと同じ記号（A・B）を付ける
 *   * すべてのピンが収まる範囲に合わせる（A を中心に固定すると、B が外に出る）
 *   * 選んでいる入口のピンを大きく・塗りつぶしで出す。カードを押すと、そのピンへ寄る
 *   * ピンを押すと、その入口を選ぶ（経路の行き先も変わる）
 */

/** 地図の寄り具合。建物と前の道路が読める程度。入口が1つのときに使う。 */
const ZOOM = 17;

/**
 * 範囲を合わせたときの寄りの上限。
 *
 * 入口どうしが近いと、範囲合わせで寄りすぎて、まわりの道が切れる。
 */
const MAX_FIT_ZOOM = 18;

/** 範囲を合わせるときの余白（ピンの頭が縁で切れないように） */
const FIT_PADDING = 56;

/** 地図に立てる入口 */
export interface MapPoint {
  id: string;
  /** カードと同じ記号（A・B） */
  code: string;
  lat: number;
  lng: number;
  /** ピンに添える短い説明（例: 車寄せ） */
  label: string;
}

/** しずく形のピン（24×33。先が座標を指す） */
const PIN_PATH =
  'M12 0C5.37 0 0 5.37 0 12c0 8.4 10.2 19.3 11.2 20.4a1.1 1.1 0 0 0 1.6 0C13.8 31.3 24 20.4 24 12 24 5.37 18.63 0 12 0z';

export function FacilityMap({
  points,
  center,
  selectedId,
  onSelect,
  width,
  height,
}: {
  /** 座標のある入口。空なら施設の座標（center）に1本だけ立てる */
  points: MapPoint[];
  /** 入口に座標が無いときに使う施設の座標 */
  center: { lat: number | null; lng: number | null };
  /** 選んでいる入口 */
  selectedId: string | null;
  /** ピンが押されたとき */
  onSelect?: (id: string) => void;
  width: number;
  height: number;
}) {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { locale } = useLocale();
  const c = useTheme();
  const box = useRef<View>(null);
  const [failed, setFailed] = useState(false);

  const mapRef = useRef<google.maps.Map | null>(null);
  const markers = useRef(new Map<string, google.maps.Marker>());
  /** 押されたときに呼ぶ先。地図を作り直さずに差し替えるため控える */
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  /** 前に選んでいた入口。最初の描画では寄せない（範囲合わせを崩さない） */
  const shown = useRef<string | null>(null);

  const accent = c.accent;
  const noPlace = points.length === 0 && (center.lat === null || center.lng === null);
  /* 入口の並びが変わったときだけ作り直す（選び直しでは作り直さない） */
  const layoutKey = points.map((p) => `${p.id}:${p.code}:${p.lat}:${p.lng}`).join('|');

  /** 選んでいる入口に合わせて、ピンの見た目を塗り分ける */
  const paint = () => {
    const g = (window as unknown as { google?: typeof google }).google;
    if (!g) return;
    for (const [id, marker] of markers.current) {
      const on = id === selectedRef.current;
      marker.setIcon({
        path: PIN_PATH,
        fillColor: on ? accent : '#ffffff',
        fillOpacity: 1,
        strokeColor: on ? '#ffffff' : accent,
        strokeWeight: 2,
        scale: on ? 1.5 : 1.15,
        anchor: new g.maps.Point(12, 33),
        labelOrigin: new g.maps.Point(12, 12),
      });
      const code = (marker.get('code') as string) ?? '';
      marker.setLabel({
        text: code,
        color: on ? '#ffffff' : accent,
        fontWeight: '800',
        fontSize: on ? '15px' : '13px',
      });
      marker.setZIndex(on ? 10 : 1);
    }
  };

  useEffect(() => {
    if (!key || noPlace) return;
    let alive = true;

    loadMaps(key, locale)
      .then(() => {
        // View の実体は div。web でのみ触れる。
        const el = box.current as unknown as HTMLElement | null;
        if (!alive || !el) return;

        const g = (window as unknown as { google: typeof google }).google;
        const first = points[0] ?? { lat: center.lat!, lng: center.lng! };
        const map = new g.maps.Map(el, {
          center: { lat: first.lat, lng: first.lng },
          zoom: ZOOM,
          ...MAP_OPTIONS,
        });
        mapRef.current = map;
        markers.current.clear();

        if (points.length === 0) {
          // 入口に座標が無い施設。施設の座標に1本だけ立てる（以前と同じ）
          new g.maps.Marker({ map, position: { lat: first.lat, lng: first.lng } });
        }

        for (const p of points) {
          const marker = new g.maps.Marker({
            map,
            position: { lat: p.lat, lng: p.lng },
            title: `${p.code} ${p.label}`,
          });
          marker.set('code', p.code);
          marker.addListener('click', () => selectRef.current?.(p.id));
          markers.current.set(p.id, marker);
        }
        paint();
        shown.current = selectedRef.current;

        /*
          すべてのピンが収まる範囲に合わせる。

          入口が1つなら、これまでどおりそこを中心に寄せる。2つ以上なら
          範囲に合わせ、寄りすぎたら上限まで引く。
        */
        if (points.length >= 2) {
          const bounds = new g.maps.LatLngBounds();
          for (const p of points) bounds.extend({ lat: p.lat, lng: p.lng });
          map.fitBounds(bounds, FIT_PADDING);
          g.maps.event.addListenerOnce(map, 'idle', () => {
            const z = map.getZoom();
            if (z !== undefined && z > MAX_FIT_ZOOM) map.setZoom(MAX_FIT_ZOOM);
          });
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
      for (const m of markers.current.values()) m.setMap(null);
      markers.current.clear();
      mapRef.current = null;
    };
    // paint と points は layoutKey に含まれる。選び直しでは作り直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, locale, layoutKey, center.lat, center.lng, noPlace]);

  /* 選び直したら塗り分け直し、そのピンへ寄せる */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    paint();
    if (selectedId && shown.current !== null && shown.current !== selectedId) {
      const p = points.find((x) => x.id === selectedId);
      if (p) map.panTo({ lat: p.lat, lng: p.lng });
    }
    shown.current = selectedId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, accent]);

  // 鍵が無い・読み込めない・座標が無い場合は国土地理院の地図
  if (!key || failed || noPlace) {
    return (
      <StaticMap
        points={points}
        center={center}
        selectedId={selectedId}
        onSelect={onSelect}
        width={width}
        height={height}
      />
    );
  }

  return <View ref={box} style={[styles.map, { width, height }]} />;
}

const styles = StyleSheet.create({
  map: { overflow: 'hidden' },
});
