import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RADIUS, SPACE, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 施設のまわりの地図。
 *
 * **動かせる地図にしていない理由**
 *   この画面は到着直前に開かれる。指で動かせる地図を置くと、
 *   拡大縮小や移動に気を取られ、肝心の「どこに着けるか」から離れる。
 *   必要な操作はナビの開始で、それは下の「経路」が担っている。
 *   ここは位置関係を一目で掴むための絵として置く。
 *
 * **地図の出どころ**
 *   国土地理院の地図タイル。鍵も契約も要らず、日本国内なら
 *   建物の形まで載っている。出典の表示が条件なので、右下に出す。
 *   Google の鍵が用意でき次第、TILE_URL を差し替えれば移れる。
 *
 * **電波が無いとき**
 *   タイルは取りに行けないため、地の色だけになる。
 *   一度見た施設は expo-image が控えているので、そのまま出る。
 *   地図が出なくても、名前・住所・進入方法は端末の中にあるため画面は成り立つ。
 */

/** 地図タイルの取得元。Google へ移る場合はここだけ差し替える。 */
const TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png';

/** 出典の表示。国土地理院の利用条件。 */
const ATTRIBUTION = '国土地理院';

/**
 * 拡大の度合い。
 *
 * 16 は「建物の形と前の道路が分かる」程度。
 * これより引くと車寄せの位置が読めず、寄せると周囲の道が切れる。
 */
const ZOOM = 16;

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

export function StaticMap({
  lat,
  lng,
  /** ピンの下に出す短い説明（例: 車寄せ） */
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
  const c = useTheme();
  const styles = makeStyles(c);

  /*
    中心のタイルを軸に、画面を覆うぶんだけ並べる。

    中心の施設がタイルのどこに乗るかは決まっていないため、
    その端数のぶんだけ全体をずらして、施設が画面の中央に来るようにする。
  */
  const tiles = useMemo(() => {
    if (lat === null || lng === null) return null;

    const fx = lngToTileX(lng, ZOOM);
    const fy = latToTileY(lat, ZOOM);
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);

    // 施設がタイル内のどこにあるか（0〜255px）
    const offsetX = (fx - cx) * TILE_SIZE;
    const offsetY = (fy - cy) * TILE_SIZE;

    // 中心タイルの左上を、画面中央から見てどこに置くか
    const baseLeft = width / 2 - offsetX;
    const baseTop = height / 2 - offsetY;

    // 画面を覆うのに、中心から何枚ぶん要るか
    const spanX = Math.ceil(width / TILE_SIZE / 2) + 1;
    const spanY = Math.ceil(height / TILE_SIZE / 2) + 1;

    const max = 2 ** ZOOM;
    const out: { key: string; url: string; left: number; top: number }[] = [];

    for (let dx = -spanX; dx <= spanX; dx++) {
      for (let dy = -spanY; dy <= spanY; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        // 世界の端。南北は折り返さない。
        if (y < 0 || y >= max) continue;
        const wrappedX = ((x % max) + max) % max;

        out.push({
          key: `${x}_${y}`,
          url: TILE_URL.replace('{z}', String(ZOOM))
            .replace('{x}', String(wrappedX))
            .replace('{y}', String(y)),
          left: baseLeft + dx * TILE_SIZE,
          top: baseTop + dy * TILE_SIZE,
        });
      }
    }
    return out;
  }, [lat, lng, width, height]);

  // 座標が無い施設。地図は出せないが、その旨を書いておく。
  if (!tiles) {
    return (
      <View style={[styles.wrap, { width, height }]}>
        <Ionicons name="map-outline" size={26} color={c.textFaint} />
        <Text style={styles.none}>座標が登録されていません</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { width, height }]}>
      {tiles.map((t) => (
        <Image
          key={t.key}
          source={{ uri: t.url }}
          style={[styles.tile, { left: t.left, top: t.top }]}
          contentFit="cover"
          // 一度取ったものは端末に残す。同じ施設を開き直しても取りに行かない。
          cachePolicy="disk"
          transition={120}
        />
      ))}

      {/* ピンは常に中央。地図のほうをずらして合わせている。 */}
      <View style={styles.pin} pointerEvents="none">
        <Ionicons name="location" size={34} color={c.accent} />
        {label ? <Text style={styles.pinLabel}>{label}</Text> : null}
      </View>

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
    pin: { alignItems: 'center' },
    pinLabel: {
      marginTop: -4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: RADIUS.sm,
      backgroundColor: c.surface,
      fontSize: 11,
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
      fontSize: 9,
      color: '#333333',
      overflow: 'hidden',
    },
    none: { marginTop: SPACE.sm, fontSize: 12, color: c.textFaint },
  });
}
