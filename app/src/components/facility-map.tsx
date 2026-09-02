import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { StaticMap } from '@/components/static-map';

/**
 * 施設の地図。
 *
 * **2通りの出し方を持つ理由**
 *   Google の地図はネイティブの組み込みを要するため、Expo Go には入っていない。
 *   そのまま読み込むと、Expo Go ではアプリごと起動しなくなる。
 *   （現在地の追加時に同じ失敗をしており、その繰り返しを避ける。）
 *
 *   Expo Go では読み込みそのものを行わず、国土地理院の地図を使う。
 *   （読み込んでしまうと、描画の段でネイティブごと落ちる。
 *     JS の例外ではないので、受け皿を置いても捕まえられない。）
 *   利用者から見れば、どちらでも「車寄せの位置が分かる」ことは変わらない。
 *
 *   ビルドしたアプリ … Google
 *   Expo Go / web   … 国土地理院
 *
 * **動かせる地図にしている**
 *   Google の地図は指で動かせるのが当たり前の形で、動かない地図は
 *   壊れているように見える。ナビの開始は下の「経路」が担うため、
 *   地図を押してナビが始まる作りはやめた（拡大縮小と衝突するため）。
 */

interface Loaded {
  MapView: React.ComponentType<Record<string, unknown>>;
  Marker: React.ComponentType<Record<string, unknown>>;
  PROVIDER_GOOGLE: unknown;
}

let cached: Loaded | null | undefined;

/**
 * Expo Go で動いているか。
 *
 * Expo Go には react-native-maps のネイティブ側が入っていない。
 * JS の読み込みは通ってしまい、描画の段でネイティブごと落ちる。
 * これは JS の例外ではないため、try/catch でも ErrorBoundary でも
 * 捕まえられず、アプリが落ちて再読み込みを繰り返す。
 *
 * 捕まえられない以上、**読み込む前に避ける**しかない。
 */
const IN_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

async function loadMaps(): Promise<Loaded | null> {
  if (cached !== undefined) return cached;
  // web と Expo Go では使えない。最初から静止画の地図にする。
  if (Platform.OS === 'web' || IN_EXPO_GO) {
    cached = null;
    return null;
  }
  try {
    const m = await import('react-native-maps');
    cached = {
      MapView: m.default as unknown as Loaded['MapView'],
      Marker: m.Marker as unknown as Loaded['Marker'],
      PROVIDER_GOOGLE: m.PROVIDER_GOOGLE,
    };
  } catch {
    // Expo Go にはネイティブ側が入っていない。静止画の地図で代替する。
    cached = null;
  }
  return cached;
}

/**
 * 描画中の失敗を受け止める。
 *
 * 読み込み (import) が通っても、ネイティブ側が入っていなければ
 * 描く段になって落ちる。Expo Go がこの状態にあたる。
 * try/catch は読み込みしか守れないため、描画側にも受け皿を置く。
 */
class MapBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** 地図の見せる範囲。数字が小さいほど寄る。約 250m 四方。 */
const SPAN = 0.0025;

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
  const [maps, setMaps] = useState<Loaded | null | undefined>(cached);

  useEffect(() => {
    let alive = true;
    loadMaps().then((m) => {
      if (alive) setMaps(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 読み込みの結果が出るまで、また使えない場合は国土地理院の地図
  if (!maps || lat === null || lng === null) {
    return <StaticMap lat={lat} lng={lng} label={label} width={width} height={height} />;
  }

  const { MapView, Marker, PROVIDER_GOOGLE } = maps;

  const fallback = (
    <StaticMap lat={lat} lng={lng} label={label} width={width} height={height} />
  );

  return (
    <MapBoundary fallback={fallback}>
    <View style={[styles.wrap, { width, height }]}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: lat,
          longitude: lng,
          latitudeDelta: SPAN,
          longitudeDelta: SPAN,
        }}
        // 走行前に開く画面なので、余計な操作の入口は出さない
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <Marker
          coordinate={{ latitude: lat, longitude: lng }}
          title={label}
          // 建物ではなく、着ける場所を指している
          anchor={{ x: 0.5, y: 1 }}
        />
      </MapView>
    </View>
    </MapBoundary>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
