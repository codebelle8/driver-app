import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/lib/i18n/context';

/**
 * 起動時の導入。映像3本のあと、ロゴを見せる。
 *
 * **飛ばせるようにしている理由**
 *   このアプリは出発前に、次に向かう施設を1件調べるために開かれる。
 *   映像とロゴで 17秒あり、急いでいる場面ではそのまま待ち時間になる。
 *   飛ばせない導入は、急いでいる人にとって不具合と区別が付かない。
 *   画面のどこを押しても、その場で終わる。途中のどの段階でも同じ。
 *
 * **映像は画面いっぱいに広げている**
 *   映像は横長 (864x496)、画面は縦。埋めるために左右が切り落とされる。
 *   中央付近が主題である前提の見せ方にあたる。
 *
 * **ロゴは全体を収めている**
 *   文字を含むロゴを切ってしまっては、出す意味がない。
 *
 * **下では画面が組み上がっている**
 *   これは上に重ねているだけなので、終わった時点ですぐ操作できる。
 */

const SOURCES = [
  require('@/assets/intro/1.mp4'),
  require('@/assets/intro/2.mp4'),
  require('@/assets/intro/3.mp4'),
];

const LOGO = require('@/assets/brand/splash.png');

/** ロゴを見せる時間 */
const LOGO_MS = 2000;

/** 消えるまでの時間。ふっと消すことで、切り替わりを目で追える。 */
const FADE_MS = 280;

/** 起動画面と同じ地色。境目が見えないようにする。 */
const BACKDROP = '#0B192F';

type Phase = 'video' | 'logo';

export function IntroVideo({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('video');
  const [index, setIndex] = useState(0);
  const [gone, setGone] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  // 二重に終了処理が走らないようにする
  const finishing = useRef(false);

  const player = useVideoPlayer(SOURCES[0], (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  function finish() {
    if (finishing.current) return;
    finishing.current = true;
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setGone(true);
      onDone?.();
    });
  }

  /** 1本終わるごとに次へ。最後まで終わったらロゴへ移る。 */
  function advance() {
    setIndex((i) => {
      if (i + 1 < SOURCES.length) return i + 1;
      setPhase('logo');
      return i;
    });
  }

  useEventListener(player, 'playToEnd', advance);

  // 再生できない映像があっても止まらないよう、異常時も先へ進める
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') advance();
  });

  // 差し替わった映像を再生する
  useEffect(() => {
    if (phase !== 'video') return;
    player.replace(SOURCES[index]);
    player.play();
  }, [index, phase, player]);

  // ロゴを見せ終えたら閉じる
  useEffect(() => {
    if (phase !== 'logo') return;
    // 映像はもう出さない。裏で鳴り続けないよう止める。
    player.pause();
    const timer = setTimeout(finish, LOGO_MS);
    return () => clearTimeout(timer);
    // finish は再生成されても中身が変わらない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, player]);

  if (gone) return null;

  return (
    <Animated.View style={[styles.wrap, { opacity }]}>
      {/* どこを押しても飛ばせる。押せる場所を探させない。 */}
      <Pressable
        onPress={finish}
        style={styles.fill}
        accessibilityRole="button"
        accessibilityLabel={t.intro.skip}
      >
        {phase === 'video' ? (
          <VideoView
            player={player}
            style={styles.fill}
            // 画面を埋める。はみ出した左右は切り落とされる。
            contentFit="cover"
            nativeControls={false}
            allowsPictureInPicture={false}
          />
        ) : (
          <View style={styles.logoWrap}>
            {/* ロゴは切らない。文字まで含めて収める。 */}
            <Image source={LOGO} style={styles.logo} contentFit="contain" />
          </View>
        )}

        <View style={styles.skipRow} pointerEvents="none">
          <Text style={styles.skip}>{t.intro.skipHint}</Text>
          {phase === 'video' && (
            <Text style={styles.count}>
              {index + 1} / {SOURCES.length}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BACKDROP,
    zIndex: 20,
  },
  fill: { flex: 1, alignSelf: 'stretch' },
  logoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: '72%', aspectRatio: 1 },
  skipRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    alignItems: 'center',
    gap: 4,
  },
  skip: { fontSize: 12, color: 'rgba(255,255,255,0.72)' },
  count: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },
});
