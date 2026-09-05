import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Pin } from '@/lib/facilities';
import type { Palette } from '@/theme';
import { SPACE } from '@/theme';
import { useTheme } from '@/theme-context';
import { useLocale, useT } from '@/lib/i18n/context';
import { loadMaps, MAP_OPTIONS } from '@/lib/maps';

/**
 * 検索結果を一枚の地図に並べる。広い画面でのみ使う。
 *
 * **何のためか**
 *   事務所で一覧を突き合わせるとき、「この施設はどのあたりか」を
 *   1件ずつ開いて確かめるのでは手数が多すぎる。193件の位置関係が
 *   一目で分かれば、エリアの取りこぼしにも気づける。
 *
 * **一覧との対応**
 *   一覧の行にマウスを乗せると、対応するピンが色と大きさで応える。
 *   ピンを押すとその施設を開く。左右のどちらから辿っても同じ場所に着く。
 *
 * **鍵が無いときは出さない**
 *   1枚の地図に多数のピンを置く用途では、国土地理院の代替（タイルを
 *   並べた静止画）では役に立たない。地図の代わりに、その旨を出す。
 *   スマホ側は詳細画面の1枚地図なので、従来どおり代替が効く。
 */

/** ピンが1つのときの寄り具合。建物と前の道路が読める程度。 */
const SINGLE_ZOOM = 16;

/** ピンを囲ったときに空ける余白（px） */
const PADDING = 56;

export function FacilitiesMap({
  pins,
  activeId,
  onSelect,
}: {
  pins: Pin[];
  /** 一覧で指している施設。ピンを目立たせる。 */
  activeId: string | null;
  onSelect: (facilityId: string) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const c = useTheme();
  const s = makeStyles(c);
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  const box = useRef<View>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef(new Map<string, google.maps.Marker>());

  /*
    押されたときの処理は、印を作り直さずに差し替えたい。
    印は施設が変わったときだけ作り直し、この参照だけを更新する。
    毎回作り直すと、地図が一瞬白くなる。
  */
  const select = useRef(onSelect);
  select.current = onSelect;

  // --- 地図と印を組み立てる ---------------------------------------------------
  useEffect(() => {
    if (!key || pins.length === 0) return;
    let alive = true;

    loadMaps(key, locale)
      .then(() => {
        const el = box.current as unknown as HTMLElement | null;
        if (!alive || !el) return;

        const g = (window as unknown as { google: typeof google }).google;

        map.current ??= new g.maps.Map(el, {
          center: { lat: pins[0].lat, lng: pins[0].lng },
          zoom: SINGLE_ZOOM,
          ...MAP_OPTIONS,
        });

        for (const m of markers.current.values()) m.setMap(null);
        markers.current.clear();

        const bounds = new g.maps.LatLngBounds();
        for (const p of pins) {
          /*
            既定の雫形ではなく小さな丸にする。

            都心に193件が集まるため、雫形だと互いに重なって
            塊にしか見えず、何件がどこにあるのか読み取れなかった。
            丸なら重なっても粒が分かれて見える。
          */
          const marker = new g.maps.Marker({
            map: map.current,
            position: { lat: p.lat, lng: p.lng },
            title: p.name,
            icon: dot(g, c.accent, false),
          });
          marker.addListener('click', () => select.current(p.facilityId));
          markers.current.set(p.facilityId, marker);
          bounds.extend({ lat: p.lat, lng: p.lng });
        }

        /*
          全部が入る位置へ寄せる。

          1件のときに fitBounds を使うと、点を囲おうとして最大まで
          寄り、建物の屋根しか映らなくなる。1件は中心に置くだけにする。
        */
        if (pins.length === 1) {
          map.current.setCenter({ lat: pins[0].lat, lng: pins[0].lng });
          map.current.setZoom(SINGLE_ZOOM);
        } else {
          map.current.fitBounds(bounds, PADDING);
        }
      })
      .catch(() => {
        /* 読み込めなければ地図は出ない。下の案内文が出る。 */
      });

    return () => {
      alive = false;
    };
  }, [key, pins, locale]);

  // --- 指している施設を目立たせる ---------------------------------------------
  useEffect(() => {
    const g = (window as unknown as { google?: typeof google }).google;
    if (!g?.maps) return;

    for (const [id, marker] of markers.current) {
      const on = id === activeId;
      marker.setZIndex(on ? 999 : 1);
      marker.setIcon(dot(g, c.accent, on));
    }
  }, [activeId, c.accent, pins]);

  if (!key) {
    return (
      <View style={s.fallback}>
        <Text style={s.fallbackTitle}>{t.map.cannotShow}</Text>
        <Text style={s.fallbackBody}>
          {t.map.noKey}
        </Text>
      </View>
    );
  }

  if (pins.length === 0) {
    return (
      <View style={s.fallback}>
        <Text style={s.fallbackBody}>{t.map.noPins}</Text>
      </View>
    );
  }

  return <View ref={box} style={s.map} />;
}

/** 地図に置く丸。指しているものだけ大きく、色を反転させる。 */
function dot(g: typeof google, accent: string, on: boolean): google.maps.Symbol {
  return {
    path: g.maps.SymbolPath.CIRCLE,
    scale: on ? 10 : 5,
    fillColor: on ? accent : '#ffffff',
    fillOpacity: 1,
    strokeColor: accent,
    strokeWeight: on ? 3 : 2,
  };
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    map: { flex: 1, backgroundColor: c.bgSub },
    fallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACE.sm,
      padding: SPACE.xl,
      backgroundColor: c.bgSub,
    },
    fallbackTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    fallbackBody: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
