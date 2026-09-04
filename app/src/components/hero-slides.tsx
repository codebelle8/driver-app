import { Image, type ImageContentPosition } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, type ImageStyle } from 'react-native';

import {
  CAN_LOAD_ART,
  HERO_SLIDES,
  SLIDE_FADE_MS,
  SLIDE_HOLD_MS,
} from '@/lib/art';

/**
 * 上部の写真を順に入れ替える。
 *
 * **読めたものだけを回す**
 *   4枚ぶんの場所を用意しているが、置かれていない番号は読み込みに
 *   失敗する。失敗したものは並びから外し、残ったものだけで回す。
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
 * **動きを控える設定を尊ぶ**
 *   端末側で「視差効果を減らす」を選んでいる方には、動く背景が
 *   苦痛になることがある。その場合は1枚目のまま止める。
 *
 * **見えていないときは止める**
 *   別のタブへ移っているあいだも回し続けると、見られていない絵のために
 *   電池を使う。戻ってきたら再び回す。
 */
/** 番号付きの枚数。最後の1つは番号なしの受け皿。 */
const NUMBERED = HERO_SLIDES.length - 1;

export function HeroSlides({
  style,
  contentPosition = { top: 0, right: 0 },
}: {
  style?: ImageStyle;
  /** どこを基準に切るか。既定は右上。 */
  contentPosition?: ImageContentPosition;
}) {
  /** 読み込めた並び。番号どおりの順を保つ。 */
  const [ok, setOk] = useState<boolean[]>(() => HERO_SLIDES.map(() => false));
  /** 各枚がいま試している在り処（.jpg → .png） */
  const [tryAt, setTryAt] = useState<number[]>(() => HERO_SLIDES.map(() => 0));
  /** ここまでを読みに行く。1枚ずつ増やす。 */
  const [upto, setUpto] = useState(1);
  const [at, setAt] = useState(0);

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
  }, [order.length]);

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
            <Image
              source={{ uri: url }}
              style={style}
              contentFit="cover"
              contentPosition={contentPosition}
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
    </>
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
