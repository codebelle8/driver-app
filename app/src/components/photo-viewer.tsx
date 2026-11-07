import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { IconButton } from '@/components/icon-button';
import { photoUrl } from '@/lib/supabase';
import type { Photo } from '@/lib/types';
import { RADIUS, SPACE, TEXT, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import { useT } from '@/lib/i18n/context';

/**
 * 写真・進入案内図を画面いっぱいに開いて拡大する。
 *
 * なぜ必要か:
 *   進入案内図には「どの車線から入るか」「どこで曲がるか」が細い線で描かれる。
 *   一覧の中の小さな枠のままでは読み取れない。
 *
 *   走行前の限られた時間で見るため、開く・拡大する・閉じるの3つだけに絞り、
 *   それ以外の操作は置いていない。
 */

/** これ以上拡げても粗くなるだけの上限 */
const MAX_SCALE = 6;
/** 二本指で縮めたときに、ここを下回ったら元の大きさへ戻す */
const MIN_SCALE = 1;
/** 二回叩いたときに拡がる倍率 */
const DOUBLE_TAP_SCALE = 2.5;

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

export function PhotoViewer({
  photos,
  index,
  onClose,
}: {
  photos: Photo[];
  /** 開く写真。null なら閉じている。 */
  index: number | null;
  onClose: () => void;
}) {
  const t = useT();
  if (index === null || !photos[index]) return null;
  const photo = photos[index];
  return (
    <ImageViewer
      uri={photoUrl(photo.storage_path)}
      label={photo.caption ?? t.photoKind[photo.kind]}
      tag={t.photoKind[photo.kind]}
      caption={photo.caption}
      cachePolicy="disk"
      onClose={onClose}
    />
  );
}

/**
 * 1枚の画像を画面いっぱいに開いて拡大する。施設の写真（上の PhotoViewer）と、
 * チャットの画像（2026-11-08）で使う。
 *
 * 出しているあいだだけ置く（閉じたら外す）。拡大・移動の具合は、開くたびに初めから。
 */
export function ImageViewer({
  uri,
  label,
  tag,
  caption,
  cachePolicy,
  onClose,
}: {
  uri: string;
  /** 読み上げに伝える名前 */
  label: string;
  /** 左上の札（施設の写真では種類）。無ければ出さない */
  tag?: string;
  /** 下の説明。無ければ出さない */
  caption?: string | null;
  cachePolicy?: 'disk' | 'memory-disk';
  onClose: () => void;
}) {
  const t = useT();
  const c = useTheme();
  const styles = makeStyles(c);
  const { width, height } = useWindowDimensions();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  function reset() {
    scale.value = 1;
    savedScale.value = 1;
    x.value = 0;
    y.value = 0;
    savedX.value = 0;
    savedY.value = 0;
  }

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clamp(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      // 元の大きさまで戻したら、ずらした位置も戻す。
      // 縮めたのに端に寄ったままだと、次に拡げたとき見当違いの場所が出る。
      if (scale.value <= MIN_SCALE) {
        x.value = withTiming(0);
        y.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // 拡大していないときに動かせると、閉じたつもりで画像がずれる
      if (savedScale.value <= MIN_SCALE) return;
      x.value = savedX.value + e.translationX;
      y.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > MIN_SCALE) {
        scale.value = withTiming(MIN_SCALE);
        savedScale.value = MIN_SCALE;
        x.value = withTiming(0);
        y.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  // 二本指の拡大と一本指の移動は同時に効く必要がある。
  // 二回叩く操作だけは、拡大・移動と取り合いにならないよう別に扱う。
  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  function close() {
    reset();
    onClose();
  }

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={close}>
      {/* 画面いっぱいに開くため、ここにも土台が要る */}
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root}>
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.stage, { width, height }, imageStyle]}>
              <Image
                source={{ uri }}
                style={{ width, height }}
                contentFit="contain"
                cachePolicy={cachePolicy}
                transition={0}
                accessibilityLabel={label}
              />
            </Animated.View>
          </GestureDetector>

          <View style={styles.topBar} pointerEvents="box-none">
            {tag ? (
              <View style={styles.kindTag}>
                <Text style={styles.kindTagText}>{tag}</Text>
              </View>
            ) : (
              <View />
            )}
            {/*
              閉じる。写真の上に置くため、白い地に濃い記号にしてある。
              色だけを変える作りにすると、明るい写真では消える。
            */}
            <IconButton icon="close" size={22} label={t.common.close} onPress={close} onDark />
          </View>

          <View style={styles.bottomBar} pointerEvents="none">
            {caption && <Text style={styles.caption}>{caption}</Text>}
            <Text style={styles.hint}>{t.photo.zoomHint}</Text>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // 拡大中は図だけに集中したいので、地は配色によらず黒で固定する
    root: { flex: 1, backgroundColor: '#000000' },
    stage: { alignItems: 'center', justifyContent: 'center' },
    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: SPACE.xl,
      paddingHorizontal: SPACE.lg,
    },
    kindTag: {
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: RADIUS.sm,
      paddingHorizontal: SPACE.sm,
      paddingVertical: 4,
    },
    kindTagText: { color: '#ffffff', fontSize: TEXT.sub, fontWeight: '600' },
    close: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingBottom: SPACE.xl,
      paddingHorizontal: SPACE.lg,
      gap: 4,
    },
    caption: { color: '#ffffff', fontSize: TEXT.body },
    hint: { color: 'rgba(255,255,255,0.6)', fontSize: TEXT.sub },
  });
}
