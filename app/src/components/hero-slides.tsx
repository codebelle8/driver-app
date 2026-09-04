import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  CAN_LOAD_ART,
  HERO_SLIDES,
  SLIDE_FADE_MS,
  SLIDE_HOLD_MS,
} from '@/lib/art';
import type { Palette } from '@/theme';
import { HIT_SLOP } from '@/theme';
import { useTheme } from '@/theme-context';

/**
 * 上部の写真を順に入れ替える。
 *
 * **写真は切らずに、まるごと出す**
 *   いただいた4枚は、それぞれが一枚で完結する横長の絵で、文字や案内の図が
 *   その中にある。端を切ると意味が変わる。縦横の比を保ったまま枠に収める。
 *
 *   枠は画面の幅で決まり、絵より平たいことも縦長のこともある。余った側には
 *   同じ絵を大きく引き伸ばしてぼかしたものを敷く。地の色をそのまま出すと、
 *   絵が宙に浮いて貼りついたように見える。
 *
 * **読めたものだけを回す**
 *   4枚ぶんの場所を用意しているが、置かれていない番号は読み込みに失敗する。
 *   失敗したものは並びから外し、残ったものだけで回す。
 *   1枚だけなら止まったまま、0枚なら何も描かない（下敷きが残る）。
 *
 * **1枚ずつ順に読む**
 *   4枚を一度に取りに行くと、1枚 230KB として1MB近くを、施設の一覧より
 *   先に奪うことになる。1枚目の行方が決まってから次を頼む。
 *   1枚あたり5秒あるので、順に読んでも次の出番には間に合う。
 *
 * **重ねて溶かす**
 *   横へ滑らせる動きは、後ろに敷く絵には強すぎる。手前で読み書きする
 *   人の目を引いてしまう。重ねたまま濃さだけを入れ替える。
 *
 * **手で送れる**
 *   左右の矢印で前後へ動かせる。押したら数え直し、押した直後に
 *   勝手に切り替わらないようにする。
 *
 * **動きを控える設定を尊ぶ**
 *   端末側で「視差効果を減らす」を選んでいる方には、動く背景が
 *   苦痛になることがある。その場合は自動では動かさない（矢印は使える）。
 *
 * **見えていないときは止める**
 *   別のタブへ移っているあいだも回し続けると、見られていない絵のために
 *   電池を使う。戻ってきたら再び回す。
 */

/** 番号付きの枚数。最後の1つは番号なしの受け皿。 */
const NUMBERED = HERO_SLIDES.length - 1;

/**
 * 余白へ敷く、ぼかした同じ絵の強さ。
 *
 * 強くかけるほど地に馴染むが、色まで溶けて灰色に寄る。
 * 縁がどこか分からなくなる程度で止める。
 */
const EDGE_BLUR = 24;

export function HeroSlides() {
  const c = useTheme();
  const s = makeStyles(c);

  /** 読み込めた並び。番号どおりの順を保つ。 */
  const [ok, setOk] = useState<boolean[]>(() => HERO_SLIDES.map(() => false));
  /** 各枚がいま試している在り処（.jpg → .png） */
  const [tryAt, setTryAt] = useState<number[]>(() => HERO_SLIDES.map(() => 0));
  /** ここまでを読みに行く。1枚ずつ増やす。 */
  const [upto, setUpto] = useState(1);
  const [at, setAt] = useState(0);
  /** 手で送った回数。数え直しの合図に使う。 */
  const [nudge, setNudge] = useState(0);

  /** その枚の行方が決まったか（読めた／在り処を試し尽くした） */
  const settled = (i: number) => ok[i] || tryAt[i] >= HERO_SLIDES[i].length;

  const live = useMemo(
    () => HERO_SLIDES.map((_, i) => i).filter((i) => ok[i]),
    [ok],
  );

  /*
    番号付きが1枚でも読めたら、番号なしは使わない。

    両方を混ぜると、4枚めの次に同じ絵がもう一度出ることになる。
    番号なしは「番号付きを1枚も置いていないとき」の受け皿にあたる。
  */
  const order = useMemo(() => {
    const numbered = live.filter((i) => i < NUMBERED);
    return numbered.length > 0 ? numbered : live;
  }, [live]);

  const fades = useRef(HERO_SLIDES.map(() => new Animated.Value(0))).current;

  const step = (d: number) => {
    if (order.length <= 1) return;
    setAt((i) => (i + d + order.length) % order.length);
    // 押した直後に自動で切り替わらないよう、数え直させる
    setNudge((n) => n + 1);
  };

  // --- 次の1枚へ進む ----------------------------------------------------------
  useEffect(() => {
    if (upto >= HERO_SLIDES.length) return;
    // いま頼んでいるものの行方が決まるまで、次は頼まない
    if (!settled(upto - 1)) return;

    /*
      番号付きが1枚でも読めていれば、番号なしは取りに行かない。

      置かれていても使わないものを落とすのは、そのぶん施設の一覧を
      待たせるだけになる。
    */
    if (upto === NUMBERED && live.some((i) => i < NUMBERED)) return;

    setUpto((n) => n + 1);
  });

  // --- 順に入れ替える ---------------------------------------------------------
  useEffect(() => {
    if (order.length <= 1) return;
    if (prefersReducedMotion()) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      timer ??= setInterval(() => {
        setAt((i) => (i + 1) % order.length);
      }, SLIDE_HOLD_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    // 見えているあいだだけ回す
    const onVisibility = () => (isVisible() ? start() : stop());
    onVisibility();

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      stop();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
    // nudge が変わると数え直す（手で送った直後に切り替わらないように）
  }, [order.length, nudge]);

  // 並びが変わったら、位置を範囲内へ戻す
  useEffect(() => {
    if (order.length > 0 && at >= order.length) setAt(0);
  }, [order.length, at]);

  // --- 濃さを入れ替える -------------------------------------------------------
  useEffect(() => {
    const shown = order[at];
    /*
      1つずつ始める。まとめない。

      Animated.parallel は既定で「1つ止まったら全部止める」ため、
      前回のまとまりが片付く際に、今回始めたばかりの動きまで止めていた。
      写真は読めているのに濃さが 0 のまま、という状態になっていた。
    */
    for (const [i] of HERO_SLIDES.entries()) {
      Animated.timing(fades[i], {
        toValue: i === shown ? 1 : 0,
        duration: SLIDE_FADE_MS,
        /*
          端末側では動かさない。

          ブラウザには動かす実体が無く、true にすると値だけが進んで
          画面へ反映されない。この部品はブラウザでしか使わない。
        */
        useNativeDriver: false,
      }).start();
    }
  }, [at, order, fades]);

  if (!CAN_LOAD_ART) return null;

  return (
    <>
      {HERO_SLIDES.slice(0, upto).map((urls, i) => {
        const url = urls[tryAt[i]];
        if (!url) return null;
        return (
          <Animated.View
            key={`${i}:${url}`}
            style={[StyleSheet.absoluteFill, { opacity: fades[i] }]}
            pointerEvents="none"
          >
            {/*
              余白へ敷く、ぼかした同じ絵。

              枠と絵の比は画面幅で変わり、必ずどちらかに余りが出る。
              地の色を出すと絵が貼りついて見えるため、同じ絵を広げて
              ぼかしたものを敷き、縁を溶かす。
            */}
            <Image
              source={{ uri: url }}
              style={s.backdrop}
              contentFit="cover"
              blurRadius={EDGE_BLUR}
              transition={0}
              accessibilityLabel=""
            />

            {/* 本体。切らずに、まるごと収める。 */}
            <Image
              source={{ uri: url }}
              style={s.photo}
              contentFit="contain"
              // 溶かし合いはこちらで行う。二重に効かせない。
              transition={0}
              onLoad={() =>
                setOk((prev) => {
                  if (prev[i]) return prev;
                  const next = [...prev];
                  next[i] = true;
                  return next;
                })
              }
              onError={() =>
                setTryAt((prev) => {
                  const next = [...prev];
                  next[i] = prev[i] + 1;
                  return next;
                })
              }
              accessibilityLabel=""
            />
          </Animated.View>
        );
      })}

      {/*
        送りの矢印。2枚以上あるときだけ出す。

        自動で入れ替わることに気づかない方もいるため、送れることを
        形で示す。押せる範囲は見た目より広く取る。
      */}
      {order.length > 1 && (
        <>
          <Arrow side="left" onPress={() => step(-1)} styles={s} c={c} />
          <Arrow side="right" onPress={() => step(1)} styles={s} c={c} />
        </>
      )}
    </>
  );
}

/** 左右の送り */
function Arrow({
  side,
  onPress,
  styles,
  c,
}: {
  side: 'left' | 'right';
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={side === 'left' ? '前の写真' : '次の写真'}
      style={side === 'left' ? styles.arrowLeft : styles.arrowRight}
    >
      <View style={hovered ? styles.arrowBoxOn : styles.arrowBox}>
        <Ionicons
          name={side === 'left' ? 'chevron-back' : 'chevron-forward'}
          size={22}
          color={c.text}
        />
      </View>
    </Pressable>
  );
}

/**
 * 動きを控える設定か。
 *
 * ブラウザは prefers-reduced-motion で表す。端末側にも同じ設定はあるが、
 * この部品はブラウザでしか使わないため、こちらだけを見る。
 */
function prefersReducedMotion(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** いまこの画面が見えているか */
function isVisible(): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    /*
      ぼかした絵は、枠より少し大きく取る。

      ぼかすと縁が薄くなり、枠と同じ大きさでは端に地の色が透ける。
      外へはみ出させておけば、どの縁も色で埋まる。
    */
    backdrop: {
      position: 'absolute',
      top: -24,
      left: -24,
      right: -24,
      bottom: -24,
    },
    photo: { width: '100%', height: '100%' },

    arrowLeft: {
      position: 'absolute',
      left: 12,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
    },
    arrowRight: {
      position: 'absolute',
      right: 12,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
    },
    /*
      白の地に濃い記号。写真の上に置くため、明るい絵でも暗い絵でも読める。
      色だけを変える作りにすると、絵によっては消える。
    */
    arrowBox: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      opacity: 0.82,
      borderWidth: 1,
      borderColor: c.border,
    },
    arrowBoxOn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      opacity: 1,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
  });
