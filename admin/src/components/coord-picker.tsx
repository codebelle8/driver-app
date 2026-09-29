'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { loadMaps, PIN_PATH } from '@/lib/google-maps';

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
 *
 * **同じ施設のほかの入口を灰色で出す**（ご指摘 2026-09-29）
 *   以前はこの入口の点しか出しておらず、B を直しているときに A の位置が
 *   見えなかった。進入路が2つある施設では、2つが同じ道に重なっていないかを
 *   ここで確かめたい。灰色のしずく形に記号（A・B）を付けて出す。
 *   動かせず、押すと下の地図へ抜ける（点を置く操作をじゃましない）。
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

/** 同じ施設のほかの入口（見るだけ） */
export interface OtherEntry {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

/** ほかの入口のピンの色。この入口の N・P と取り違えない灰色 */
const OTHER_GREY = '#7a858c';

export function CoordPicker({
  nav,
  dropoff,
  others = [],
  onChange,
  labels,
}: {
  nav: Coord;
  dropoff: Coord;
  /** 同じ施設のほかの入口のナビ地点 */
  others?: OtherEntry[];
  onChange: (which: Point, value: Coord) => void;
  labels: {
    nav: string;
    dropoff: string;
    hint: string;
    missingKey: string;
    failed: string;
    others: string;
  };
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<Partial<Record<Point, google.maps.Marker>>>({});
  const [error, setError] = useState<string | null>(null);
  /**
   * 地図ができたか。
   *
   * 地図の読み込みは後から終わる。これを持たないと、印を描く効果が
   * 地図のできる前に一度だけ走って終わり、開いた時点の点が出ない。
   */
  const [ready, setReady] = useState(false);
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

        // 新しい入口は、ほかの入口のそばから始める（東京駅から探させない）
        const near = others[0] ? { lat: others[0].lat, lng: others[0].lng } : null;
        const center = toNumber(nav) ?? toNumber(dropoff) ?? near ?? FALLBACK;
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
        setReady(true);
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

  // --- ほかの入口を灰色で出す ----------------------------------------------
  const othersKey = others.map((o) => `${o.code}:${o.lat}:${o.lng}`).join('|');
  useEffect(() => {
    if (!ready || !map.current) return;
    const drawn = others.map(
      (o) =>
        new google.maps.Marker({
          map: map.current,
          position: { lat: o.lat, lng: o.lng },
          title: `${o.code} ${o.name}`,
          // 押しても下の地図へ抜ける（点を置く操作をじゃましない）
          clickable: false,
          zIndex: 0,
          label: { text: o.code, color: '#ffffff', fontWeight: '800', fontSize: '12px' },
          icon: {
            path: PIN_PATH,
            fillColor: OTHER_GREY,
            fillOpacity: 0.9,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
            scale: 1.1,
            anchor: new google.maps.Point(12, 33),
            labelOrigin: new google.maps.Point(12, 12),
          },
        }),
    );
    return () => {
      for (const m of drawn) m.setMap(null);
    };
    // 並びが変わったときだけ描き直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, othersKey]);

  // --- 入力欄の値を、地図の印へ反映する -------------------------------------
  useEffect(() => {
    if (!ready || !map.current) return;

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
  }, [ready, nav, dropoff, labels.nav, labels.dropoff, place]);

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
                ? 'rounded-md border border-accent bg-accent-soft px-3 py-1 font-medium text-accent-ink'
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
        data-testid="coord-picker"
        className="h-80 w-full overflow-hidden rounded-lg border border-border-strong bg-surface-2"
      />
      {others.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-text-faint">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: OTHER_GREY }}
          />
          {labels.others.replace('{codes}', others.map((o) => o.code).join('・'))}
        </p>
      )}
    </div>
  );
}
