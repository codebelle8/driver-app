'use client';

import { useEffect, useRef, useState } from 'react';

import { loadMaps, PIN_GREEN, PIN_PATH } from '@/lib/google-maps';

/**
 * 入口の位置の一覧地図（ご指摘 2026-09-29）。
 *
 * **なぜ要るか**
 *   入口ごとの編集欄にも地図はあるが、その入口の点しか出ない。進入路が
 *   2つある施設で、A と B の位置関係を一度に確かめる場所が無かった。
 *   アプリ側は「入口ごとにピンを立てる」形に直したので、同じ見え方を
 *   ここで確かめられるようにする。
 *
 * **アプリと同じ見え方にする**
 *   * 入口ごとにピンを立て、カードと同じ記号（A・B）を付ける
 *   * すべてのピンが収まる範囲に合わせる
 *   * ピンを押すと、その入口の編集欄へ移る
 *   * 入口の「地図で見る」を押すと、ここのピンへ寄る
 *
 *   出すのはナビ地点（アプリの地図と「経路」が使う座標）。停止中の入口は
 *   薄く出す（アプリには出ないが、置き場所は確かめられるように）。
 */

export interface OverviewPoint {
  code: string;
  name: string;
  lat: number;
  lng: number;
  active: boolean;
}

/** 入口の「地図で見る」から、この地図へ知らせる合図の名前 */
export const SHOW_ENTRY_EVENT = 'kn:show-entry';

/** 範囲を合わせたときの寄りの上限（入口どうしが近いと寄りすぎる） */
const MAX_FIT_ZOOM = 18;
const ZOOM = 17;

/** 動きを減らす設定なら、画面の移動は一息で行う */
const motion = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

export function EntryPointsMap({
  points,
  labels,
}: {
  points: OverviewPoint[];
  labels: { title: string; hint: string; missingKey: string; failed: string; inactive: string };
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef(new Map<string, google.maps.Marker>());
  const [failed, setFailed] = useState(false);
  const error = !key ? labels.missingKey : failed ? labels.failed : null;
  const [selected, setSelected] = useState<string | null>(null);

  const layoutKey = points.map((p) => `${p.code}:${p.lat}:${p.lng}:${p.active}`).join('|');

  /** 選んでいる入口に合わせて塗り分ける */
  const paint = (current: string | null) => {
    for (const [code, marker] of markers.current) {
      const on = code === current;
      const active = marker.get('active') !== false;
      marker.setIcon({
        path: PIN_PATH,
        fillColor: on ? PIN_GREEN : '#ffffff',
        fillOpacity: active ? 1 : 0.55,
        strokeColor: on ? '#ffffff' : PIN_GREEN,
        strokeOpacity: active ? 1 : 0.55,
        strokeWeight: 2,
        scale: on ? 1.5 : 1.2,
        anchor: new google.maps.Point(12, 33),
        labelOrigin: new google.maps.Point(12, 12),
      });
      marker.setLabel({
        text: code,
        color: on ? '#ffffff' : PIN_GREEN,
        fontWeight: '800',
        fontSize: on ? '15px' : '13px',
      });
      marker.setZIndex(on ? 10 : 1);
    }
  };

  useEffect(() => {
    if (points.length === 0 || !key) return;
    let alive = true;
    const drawn = markers.current;
    loadMaps(key)
      .then(() => {
        if (!alive || !box.current) return;
        const m = new google.maps.Map(box.current, {
          center: { lat: points[0].lat, lng: points[0].lng },
          zoom: ZOOM,
          mapTypeControl: true,
          mapTypeControlOptions: { mapTypeIds: ['roadmap', 'hybrid'] },
          streetViewControl: false,
          fullscreenControl: false,
        });
        map.current = m;
        drawn.clear();

        for (const p of points) {
          const marker = new google.maps.Marker({
            map: m,
            position: { lat: p.lat, lng: p.lng },
            title: `${p.code} ${p.name}${p.active ? '' : `（${labels.inactive}）`}`,
          });
          marker.set('active', p.active);
          /* ピンを押すと、その入口の編集欄へ移る */
          marker.addListener('click', () => {
            setSelected(p.code);
            paint(p.code);
            const card = document.getElementById(`ep-${p.code}`);
            if (card) {
              card.scrollIntoView({ behavior: motion(), block: 'start' });
              card.dataset.flash = '1';
              window.setTimeout(() => {
                delete card.dataset.flash;
              }, 1600);
            }
          });
          drawn.set(p.code, marker);
        }
        paint(null);

        if (points.length >= 2) {
          const bounds = new google.maps.LatLngBounds();
          for (const p of points) bounds.extend({ lat: p.lat, lng: p.lng });
          m.fitBounds(bounds, 56);
          google.maps.event.addListenerOnce(m, 'idle', () => {
            const z = m.getZoom();
            if (z !== undefined && z > MAX_FIT_ZOOM) m.setZoom(MAX_FIT_ZOOM);
          });
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      for (const mk of drawn.values()) mk.setMap(null);
      drawn.clear();
      map.current = null;
    };
    // 並びが変わったときだけ作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, layoutKey]);

  /* 入口の「地図で見る」から呼ばれる。その入口のピンへ寄り、地図を画面に入れる */
  useEffect(() => {
    const onShow = (ev: Event) => {
      const code = (ev as CustomEvent<string>).detail;
      const p = points.find((x) => x.code === code);
      if (!p) return;
      setSelected(code);
      paint(code);
      map.current?.panTo({ lat: p.lat, lng: p.lng });
      wrap.current?.scrollIntoView({ behavior: motion(), block: 'center' });
    };
    window.addEventListener(SHOW_ENTRY_EVENT, onShow);
    return () => window.removeEventListener(SHOW_ENTRY_EVENT, onShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  if (points.length === 0) return null;

  return (
    <div ref={wrap} className="space-y-2" data-selected={selected ?? ''}>
      <div>
        <p className="text-sm font-semibold">{labels.title}</p>
        <p className="mt-0.5 text-xs text-text-faint">{labels.hint}</p>
      </div>
      {error ? (
        <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm text-text-muted">{error}</div>
      ) : (
        <div
          ref={box}
          data-testid="entry-points-map"
          className="h-80 w-full overflow-hidden rounded-lg border border-border-strong bg-surface-2"
        />
      )}
    </div>
  );
}

/** 入口の見出しに置く「地図で見る」。一覧地図のその入口のピンへ寄せる */
export function ShowOnMapButton({ code, label }: { code: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(SHOW_ENTRY_EVENT, { detail: code }))}
      className="rounded-md border border-border px-2.5 py-1 text-xs text-text-muted hover:border-border-strong hover:text-text"
    >
      {label}
    </button>
  );
}
