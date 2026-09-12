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
import { useT } from '@/lib/i18n/context';

/**
 * 上部の写真を順に入れ替える。
 *
 * **写真は切らずに、まるごと出す**
 *   いただいた絵は、それぞれが一枚で完結する横長の絵で、文字や案内の図が
 *   その中にある。端を切ると意味が変わる。縦横の比を保ったまま枠に収める。
 *
 *   枠は画面の幅で決まり、絵より平たいことも縦長のこともある。絵はその中へ
 *   実寸の比で置き、余った側は地の色にする。
 *
 * **余った側にはぼかした同じ絵を敷く**
 *   地の色をそのまま出すと、絵が宙に浮いて貼りついたように見える。
 *   同じ絵を広げてぼかしたものを敷き、帯を絵の色で満たす。
 *
 * **絵の縁は内側へにじませる**
 *   ぼかした面との境が直線で立たないよう、絵の内側に影を落とす
 *   （box-shadow の inset）。縁が白んで、外のぼかしへ続いて見える。
 *
 * **読めたものだけを回す**
 *   枚数ぶんの場所を用意しているが、置かれていない番号は読み込みに失敗する。
 *   失敗したものは並びから外し、残ったものだけで回す。
 *   1枚だけなら止まったまま、0枚なら何も描かない（下敷きが残る）。
 *
 * **1枚ずつ順に読む**
 *   全部を一度に取りに行くと、1枚 130KB としても、施設の一覧より
 *   先に何百KBも奪うことになる。1枚目の行方が決まってから次を頼む。
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
 * 絵の縦横の比。
 *
 * **差し替える絵も、この比に合わせてください。** 比が違うと、
 * 広いほうの端が切り取られます。いただいている絵は 1800x839 前後
 * （およそ 2.1）。
 */
const PHOTO_ASPECT = 2.1;

/**
 * 縁のにじみ。
 *
 * ぼかし幅と広がり幅。大きくすると縁が深く溶けるが、絵の中身まで
 * 白んでいく。人物の顔にかからない程度で止める。
 */
const EDGE_BLUR = 44;
const EDGE_SPREAD = 18;

/**
 * 余った側へ敷く絵のぼかし。
 *
 * 強くかけるほど地に馴染むが、色まで溶けて灰色に寄る。
 * 何が写っているか読み取れなくなる程度で止める。
 */
const EDGE_BLUR_RADIUS = 28;

export function HeroSlides() {
  const c = useTheme();
  const s = makeStyles(c);

  /*
    帯の実寸。絵を置く大きさを、ここから求める。

    画面幅から引き算しても出せるが、左メニューや余白の見込みが要り、
    画面ごとに合わなくなる。枠そのものを測る。
  */
  const [band, setBand] = useState({ width: 0, height: 0 });

  /*
    絵を置く大きさ。帯の中に、実寸の比のまま最大で収まる大きさ。

    帯が絵より平たければ高さが、縦長であれば幅が先に一杯になる。
  */
  const photo = (() => {
    if (band.width === 0 || band.height === 0) return { width: 0, height: 0 };
    const byHeight = band.height * PHOTO_ASPECT;
    return byHeight <= band.width
      ? { width: Math.round(byHeight), height: band.height }
      : { width: band.width, height: Math.round(band.width / PHOTO_ASPECT) };
  })();

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

    両方を混ぜると、最後の1枚の次に同じ絵がもう一度出ることになる。
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
    <View
      style={s.band}
      onLayout={(e) =>
        setBand({
          width: Math.round(e.nativeEvent.layout.width),
          height: Math.round(e.nativeEvent.layout.height),
        })
      }
    >
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
              余った側へ敷く、ぼかした同じ絵。

              枠と絵の比は画面幅で変わり、必ずどちらかに余りが出る。
              地の色を出すと絵が貼りついて見えるため、同じ絵を広げて
              ぼかしたものを敷く。
            */}
            <Image
              source={{ uri: url }}
              style={s.backdrop}
              contentFit="cover"
              blurRadius={EDGE_BLUR_RADIUS}
              transition={0}
              accessibilityLabel=""
            />

            {/* 絵。実寸の比のまま、帯の中央へ置く。 */}
            <View style={s.center}>
            <View style={[s.frame, { width: photo.width, height: photo.height }]}>
              <Image
                source={{ uri: url }}
                style={s.fill}
                contentFit="cover"
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

              {/*
                縁を内側から地の色でにじませる。

                絵そのものに影は落とせないため、同じ大きさの層を重ねて
                その内側に影を置く。絵の上に薄い霞がかかった状態になる。
              */}
              <View style={s.edge} />
            </View>
            </View>
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
    </View>
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
  const t = useT();
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={side === 'left' ? t.photo.prev : t.photo.next}
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
    band: { flex: 1 },
    /*
      ぼかした絵は、帯より少し大きく取る。

      ぼかすと縁が薄くなり、帯と同じ大きさでは端に下地が透ける。
      外へはみ出させておけば、どの縁も色で埋まる。
    */
    backdrop: {
      position: 'absolute',
      top: -28,
      left: -28,
      right: -28,
      bottom: -28,
    },
    /*
      中央寄せの器。

      縦の中央寄せに marginVertical: 'auto' を使ったところ効かず、
      枠の高さが 0 になっていた。器の側で寄せる。
    */
    center: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /* 絵を置く枠 */
    frame: { overflow: 'hidden' },
    fill: { width: '100%', height: '100%' },
    /*
      縁のにじみ。

      内側へ向かって地の色を差す（box-shadow の inset）。
      絵そのものに影は落とせないため、同じ大きさの層を重ねて置く。
      押せなくならないよう、当たり判定は通す。
    */
    edge: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      boxShadow: `inset 0 0 ${EDGE_BLUR}px ${EDGE_SPREAD}px ${c.bg}`,
    },

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
