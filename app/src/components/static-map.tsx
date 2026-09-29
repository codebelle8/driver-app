import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MapPoint } from '@/components/facility-map';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import { fill } from '@/lib/i18n/dictionaries';
import { useT } from '@/lib/i18n/context';

/**
 * 施設のまわりの地図（国土地理院）。
 *
 * **使われる場面**
 *   Google の地図を読めないとき（鍵が無い・読み込めない）と、
 *   **端末（Expo Go・APK）では常に**こちら。Google の地図は web でしか読めない。
 *
 * **動かせる地図にしていない理由**
 *   この画面は到着直前に開かれる。指で動かせる地図を置くと、
 *   拡大縮小や移動に気を取られ、肝心の「どこに着けるか」から離れる。
 *   必要な操作はナビの開始で、それは下の「経路」が担っている。
 *   ここは位置関係を一目で掴むための絵として置く。
 *
 * **入口ごとにピンを立てる**（ご指摘 2026-09-29）
 *   すべての入口が収まるよう、寄り具合と中心を決める。ピンには下の
 *   カードと同じ記号（A・B）を付け、選んでいる入口を大きく塗りつぶして出す。
 *   ピンを押すと、その入口を選ぶ。動かない地図なので、すべてのピンは
 *   常に画面の中にある（選び直しで寄せる必要が無い）。
 *
 * **地図の出どころ**
 *   国土地理院の地図タイル。鍵も契約も要らず、日本国内なら
 *   建物の形まで載っている。出典の表示が条件なので、右下に出す。
 *
 * **電波が無いとき**
 *   タイルは取りに行けないため、地の色だけになる。
 *   一度見た施設は expo-image が控えているので、そのまま出る。
 *   地図が出なくても、名前・住所・進入方法は端末の中にあるため画面は成り立つ。
 *   ピンは端末の中の座標から描くので、地の色の上にも出る。
 */

/** 地図タイルの取得元。 */
const TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';

/** 出典の表示。国土地理院の利用条件。 */
const ATTRIBUTION = '国土地理院';

/**
 * 拡大の度合い（入口が1つのとき・いちばん寄ったとき）。
 *
 * 16 は「建物の形と前の道路が分かる」程度。
 * これより引くと車寄せの位置が読めず、寄せると周囲の道が切れる。
 */
const ZOOM = 16;

/** 入口が離れていても、ここより引かない（引きすぎると建物が読めない） */
const MIN_ZOOM = 12;

/** ピンが縁で切れないための余白（上はピンの高さぶん多めに取る） */
const MARGIN = { side: 36, top: 52, bottom: 24 };

/** タイル1枚の大きさ（国土地理院の規格） */
const TILE_SIZE = 256;

/** 経度から、タイル座標（小数）へ */
function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * 2 ** z;
}

/** 緯度から、タイル座標（小数）へ（メルカトル図法） */
function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

/**
 * すべての点が収まる寄り具合と、その中心（タイル座標）を決める。
 * ZOOM から1段ずつ引き、画面（余白を除く）に収まったところで止める。
 */
function fitView(spots: { lat: number; lng: number }[], width: number, height: number) {
  for (let z = ZOOM; z >= MIN_ZOOM; z--) {
    const xs = spots.map((s) => lngToTileX(s.lng, z));
    const ys = spots.map((s) => latToTileY(s.lat, z));
    const spanX = (Math.max(...xs) - Math.min(...xs)) * TILE_SIZE;
    const spanY = (Math.max(...ys) - Math.min(...ys)) * TILE_SIZE;
    const fits =
      spanX <= width - MARGIN.side * 2 && spanY <= height - MARGIN.top - MARGIN.bottom;
    if (fits || z === MIN_ZOOM) {
      return {
        zoom: z,
        cx: (Math.max(...xs) + Math.min(...xs)) / 2,
        // ピンは上へ伸びるので、中心を少し下げて上の余白を確保する
        cy: (Math.max(...ys) + Math.min(...ys)) / 2 - (MARGIN.top - MARGIN.bottom) / 2 / TILE_SIZE,
      };
    }
  }
  return null;
}

export function StaticMap({
  points,
  center,
  selectedId,
  onSelect,
  width,
  height,
}: {
  /** 座標のある入口。空なら施設の座標（center）に記号なしのピンを1本 */
  points: MapPoint[];
  center: { lat: number | null; lng: number | null };
  selectedId: string | null;
  onSelect?: (id: string) => void;
  width: number;
  height: number;
}) {
  const t = useT();
  const c = useTheme();
  const styles = makeStyles(c);

  const view = useMemo(() => {
    const spots: { id: string | null; code: string; label: string; lat: number; lng: number }[] =
      points.length > 0
        ? points.map((p) => ({ id: p.id, code: p.code, label: p.label, lat: p.lat, lng: p.lng }))
        : center.lat !== null && center.lng !== null
          ? [{ id: null, code: '', label: '', lat: center.lat, lng: center.lng }]
          : [];
    if (spots.length === 0 || width <= 0 || height <= 0) return null;

    const fit = fitView(spots, width, height);
    if (!fit) return null;
    const { zoom, cx: fx, cy: fy } = fit;

    /*
      中心のタイルを軸に、画面を覆うぶんだけ並べる。
      中心がタイルのどこに乗るかは決まっていないため、その端数のぶんだけ
      全体をずらす。
    */
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const baseLeft = width / 2 - (fx - cx) * TILE_SIZE;
    const baseTop = height / 2 - (fy - cy) * TILE_SIZE;
    const spanX = Math.ceil(width / TILE_SIZE / 2) + 1;
    const spanY = Math.ceil(height / TILE_SIZE / 2) + 1;
    const max = 2 ** zoom;

    const tiles: { key: string; url: string; left: number; top: number }[] = [];
    for (let dx = -spanX; dx <= spanX; dx++) {
      for (let dy = -spanY; dy <= spanY; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        // 世界の端。南北は折り返さない。
        if (y < 0 || y >= max) continue;
        const wrappedX = ((x % max) + max) % max;
        tiles.push({
          key: `${zoom}_${x}_${y}`,
          url: TILE_URL.replace('{z}', String(zoom))
            .replace('{x}', String(wrappedX))
            .replace('{y}', String(y)),
          left: baseLeft + dx * TILE_SIZE,
          top: baseTop + dy * TILE_SIZE,
        });
      }
    }

    // 各点の、画面の中での位置（ピンの先）
    const pins = spots.map((s) => ({
      ...s,
      x: width / 2 + (lngToTileX(s.lng, zoom) - fx) * TILE_SIZE,
      y: height / 2 + (latToTileY(s.lat, zoom) - fy) * TILE_SIZE,
    }));
    return { tiles, pins };
  }, [points, center.lat, center.lng, width, height]);

  // 座標が無い施設。地図は出せないが、その旨を書いておく。
  if (!view) {
    return (
      <View style={[styles.wrap, { width, height }]}>
        <Ionicons name="map-outline" size={26} color={c.textFaint} />
        <Text style={styles.none}>{t.map.noCoords}</Text>
      </View>
    );
  }

  // 選んでいるピンを最後に描く（重なったときに上へ来る）
  const ordered = [...view.pins].sort(
    (a, b) => Number(a.id === selectedId) - Number(b.id === selectedId),
  );

  return (
    <View style={[styles.wrap, { width, height }]}>
      {view.tiles.map((tile) => (
        <Image
          key={tile.key}
          source={{ uri: tile.url }}
          style={[styles.tile, { left: tile.left, top: tile.top }]}
          contentFit="cover"
          // 一度取ったものは端末に残す。同じ施設を開き直しても取りに行かない。
          cachePolicy="disk"
          transition={120}
        />
      ))}

      {ordered.map((p) => {
        if (p.id === null) {
          // 入口に座標が無い施設。施設の位置に記号なしのピン（以前と同じ）
          return (
            <View
              key="center"
              style={[styles.plainPin, { left: p.x - 17, top: p.y - 32 }]}
              pointerEvents="none"
            >
              <Ionicons name="location" size={34} color={c.accent} />
            </View>
          );
        }
        const on = p.id === selectedId;
        const head = on ? 34 : 26;
        return (
          <Pressable
            key={p.id}
            onPress={() => onSelect?.(p.id!)}
            // 押せる範囲は見た目より広く取る（走行前の指で押しやすく）
            hitSlop={10}
            style={[styles.pin, { left: p.x - head / 2, top: p.y - head - 7, width: head }]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            accessibilityLabel={fill(t.facility.pinLabel, { code: p.code, name: p.label })}
          >
            <View
              style={[
                styles.pinHead,
                { width: head, height: head, borderRadius: head / 2 },
                on ? styles.pinHeadOn : styles.pinHeadOff,
              ]}
            >
              <Text style={[styles.pinCode, on ? styles.pinCodeOn : styles.pinCodeOff]}>
                {p.code}
              </Text>
            </View>
            <View style={[styles.pinTail, on ? styles.pinTailOn : styles.pinTailOff]} />
            {/* 説明は、ピンの幅に縛られないよう下へ浮かせる（縛ると1字ずつ縦に折れる） */}
            {on && p.label ? (
              <View style={[styles.pinLabelBox, { top: head + 8, left: head / 2 - 60 }]} pointerEvents="none">
                <Text style={styles.pinLabel}>{p.label}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}

      {/* 国土地理院の利用条件により、出典を示す */}
      <Text style={styles.credit}>{ATTRIBUTION}</Text>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.surface2,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    tile: { position: 'absolute', width: TILE_SIZE, height: TILE_SIZE },
    plainPin: { position: 'absolute' },

    pin: { position: 'absolute', alignItems: 'center' },
    pinHead: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    },
    pinHeadOn: { backgroundColor: c.accent, borderColor: '#ffffff' },
    pinHeadOff: { backgroundColor: '#ffffff', borderColor: c.accent },
    pinCode: { fontWeight: '800' },
    pinCodeOn: { color: '#ffffff', fontSize: TEXT.body },
    pinCodeOff: { color: c.accent, fontSize: TEXT.sub },
    /* 先。小さな正方形を45度回して、下の角を座標に当てる */
    pinTail: {
      width: 10,
      height: 10,
      marginTop: -6,
      transform: [{ rotate: '45deg' }],
      borderRightWidth: 2,
      borderBottomWidth: 2,
    },
    pinTailOn: { backgroundColor: c.accent, borderColor: '#ffffff' },
    pinTailOff: { backgroundColor: '#ffffff', borderColor: c.accent },
    pinLabelBox: { position: 'absolute', width: 120, alignItems: 'center' },
    pinLabel: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: RADIUS.sm,
      backgroundColor: c.surface,
      fontSize: TEXT.small,
      fontWeight: '700',
      color: c.text,
      overflow: 'hidden',
    },
    credit: {
      position: 'absolute',
      right: 4,
      bottom: 3,
      paddingHorizontal: 4,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.75)',
      fontSize: TEXT.micro,
      color: '#333333',
      overflow: 'hidden',
    },
    none: { marginTop: SPACE.sm, fontSize: TEXT.sub, color: c.textFaint },
  });
}
