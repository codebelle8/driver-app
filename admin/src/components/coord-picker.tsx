'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 地図から座標を決める。
 *
 * **なぜ要るか**
 *   これまで緯度経度は手入力だった。地図上の「ここに着ける」を
 *   数字に置き換える作業を人にやらせており、桁を間違えても気づけない。
 *   35.6656 を 35.6566 と打っても、見た目には何も起きない。
 *
 * **数値の入力欄を残している理由**
 *   地図で置いた点を、数字でも確かめられるようにするため。
 *   クライアント様からいただく一覧は度分秒の文字列で、
 *   それを貼り付けて使う場面も残る。地図と数字は常に同じ値を指す。
 *
 * **2つの点を扱う**
 *   ナビ地点  … カーナビに渡す。進入レーン上の地点
 *   停車位置  … 実際に停める場所。画面に出す
 *   別物なので、取り違えないよう色と形を分けている。
 */

/** 地図の初期位置。東京駅。登録済みの座標があればそちらを使う。 */
const FALLBACK = { lat: 35.6812, lng: 139.7671 };

/** 初期の拡大。建物と前の道路が見える程度。 */
const ZOOM = 17;

type Point = 'nav' | 'dropoff';

interface Coord {
  lat: string;
  lng: string;
}

/** 文字列の座標を数値へ。空や壊れている場合は null。 */
function toNumber(c: Coord): { lat: number; lng: number } | null {
  const lat = Number(c.lat);
  const lng = Number(c.lng);
  if (!c.lat.trim() || !c.lng.trim()) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** 地図から受け取った値を、入力欄に入れる形へ。6桁で約10cmの精度。 */
function fromLatLng(lat: number, lng: number): Coord {
  return { lat: lat.toFixed(6), lng: lng.toFixed(6) };
}

let loading: Promise<void> | null = null;

/**
 * Google の地図を読み込む。
 *
 * 一度きりにしているのは、進入口ごとにこの部品が並ぶため。
 * 数だけ読み込むと、そのぶん課金対象の呼び出しが増える。
 */
function loadMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as { google?: { maps?: unknown } }).google?.maps) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=ja&region=JP`;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('地図を読み込めませんでした'));
    document.head.appendChild(el);
  });
  return loading;
}

export function CoordPicker({
  nav,
  dropoff,
  onChange,
  labels,
}: {
  nav: Coord;
  dropoff: Coord;
  onChange: (which: Point, value: Coord) => void;
  labels: { nav: string; dropoff: string; hint: string; missingKey: string; failed: string };
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<Partial<Record<Point, google.maps.Marker>>>({});
  const [error, setError] = useState<string | null>(null);
  /** いまどちらの点を置こうとしているか。地図を押したときの行き先。 */
  const [target, setTarget] = useState<Point>('nav');

  // onChange は毎回作り直される。地図の登録処理を作り直さないよう控える。
  const changed = useRef(onChange);
  changed.current = onChange;

  const place = useCallback((which: Point, lat: number, lng: number) => {
    changed.current(which, fromLatLng(lat, lng));
  }, []);

  // --- 地図を用意する -------------------------------------------------------
  useEffect(() => {
    if (!key) {
      setError(labels.missingKey);
      return;
    }
    let alive = true;

    loadMaps(key)
      .then(() => {
        if (!alive || !box.current || map.current) return;

        const center = toNumber(nav) ?? toNumber(dropoff) ?? FALLBACK;
        map.current = new google.maps.Map(box.current, {
          center,
          zoom: ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          // 建物の形が見えたほうが、車寄せの位置を決めやすい
          mapTypeId: google.maps.MapTypeId.ROADMAP,
        });

        // 地図を押したら、いま選んでいるほうの点を置く
        map.current.addListener('click', (ev: google.maps.MapMouseEvent) => {
          if (!ev.latLng) return;
          place(targetRef.current, ev.latLng.lat(), ev.latLng.lng());
        });
      })
      .catch(() => {
        if (alive) setError(labels.failed);
      });

    return () => {
      alive = false;
    };
    // 初回だけ組み立てる。値の反映は下の効果で行う。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // click の中から最新の選択を読むための控え
  const targetRef = useRef<Point>(target);
  targetRef.current = target;

  // --- 入力欄の値を、地図の印へ反映する -------------------------------------
  useEffect(() => {
    if (!map.current) return;

    for (const [which, coord] of [
      ['nav', nav],
      ['dropoff', dropoff],
    ] as const) {
      const at = toNumber(coord);
      const existing = markers.current[which];

      if (!at) {
        existing?.setMap(null);
        delete markers.current[which];
        continue;
      }

      if (existing) {
        existing.setPosition(at);
        continue;
      }

      const marker = new google.maps.Marker({
        map: map.current,
        position: at,
        draggable: true,
        title: which === 'nav' ? labels.nav : labels.dropoff,
        label: {
          text: which === 'nav' ? 'N' : 'P',
          color: '#ffffff',
          fontWeight: '700',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 13,
          // ナビ地点と停車位置は別物。色で取り違えを防ぐ。
          fillColor: which === 'nav' ? '#1a73e8' : '#0f9d58',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
      marker.addListener('dragend', (ev: google.maps.MapMouseEvent) => {
        if (ev.latLng) place(which, ev.latLng.lat(), ev.latLng.lng());
      });
      markers.current[which] = marker;
    }
  }, [nav, dropoff, labels.nav, labels.dropoff, place]);

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm text-text-muted">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* どちらの点を置くかを先に選ぶ。押し間違いで上書きしないため。 */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-text-muted">{labels.hint}</span>
        {(['nav', 'dropoff'] as const).map((which) => (
          <button
            key={which}
            type="button"
            onClick={() => setTarget(which)}
            className={
              target === which
                ? 'rounded-md border border-accent bg-accent-soft px-3 py-1 font-medium text-accent'
                : 'rounded-md border border-border px-3 py-1 text-text-muted hover:border-border-strong'
            }
          >
            <span
              className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
              style={{ background: which === 'nav' ? '#1a73e8' : '#0f9d58' }}
            />
            {which === 'nav' ? labels.nav : labels.dropoff}
          </button>
        ))}
      </div>

      <div
        ref={box}
        className="h-80 w-full overflow-hidden rounded-lg border border-border-strong bg-surface-2"
      />
    </div>
  );
}
