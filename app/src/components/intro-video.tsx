import Ionicons from '@expo/vector-icons/Ionicons';
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/lib/i18n/context';
import { TEXT } from '@/theme';

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
 *
 * **音を出す**（ご指摘 2026-09-25「導入の映像に音が出ない」）
 *   映像には音声が入っている。端末（Expo Go・APK）では、そのまま鳴らす。
 *   ブラウザは、利用者がまだ何も押していないと「音ありの自動再生」を断る。
 *   断られると映像ごと止まるため、断る設定のときは消音で始め、
 *   「音を出す」を出す。押されたら（＝利用者の操作なので）音を入れる。
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

/**
 * 音を出してよいかを試すための、ごく短い無音（0.05秒）。
 *
 * ブラウザは、利用者がまだ何も押していないと「音ありの自動再生」を断る。
 * 本編で試すと、断られた数百ミリ秒は黒い画面のまま止まり、記録にも
 * 誤りが残る。**先にこの音で試し、断られるかどうかを見てから決める。**
 */
const SOUND_PROBE =
  'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';

/**
 * 音を出して始めてよいか。
 *
 * 端末（Expo Go・APK）は断られない。ブラウザは、尋ねられるなら尋ね
 * （getAutoplayPolicy。使えないブラウザもある）、駄目なら上の無音で試す。
 * 断られてもここで受け止めるので、画面にも記録にも出ない。
 */
async function soundAllowed(): Promise<boolean> {
  if (Platform.OS !== 'web') return true;
  const ask = (
    globalThis.navigator as Navigator & { getAutoplayPolicy?: (kind: string) => string }
  )?.getAutoplayPolicy;
  const policy = ask?.('mediaelement');
  if (policy) return policy === 'allowed';
  try {
    const probe = new Audio(SOUND_PROBE);
    await probe.play();
    probe.pause();
    return true;
  } catch {
    return false;
  }
}

/*
  **映像を片付けた・止めたときの「中断」を、誤りとして記録に出さない**（web）。

  expo-video のブラウザ版は、映像の再生（video.play()）の約束を受け止めて
  いない。導入を飛ばすと、次の1本の再生を始めた直後に映像ごと片付けるため、
  ブラウザが「再生が中断された」（AbortError）を受け止め手の無い誤りとして
  記録に出す。止めたのはこちらなので、正しい動きにあたる。

  受け止めるのは2種類だけ。
    AbortError      … 映像を片付けた・止めたことによる中断
    NotAllowedError … 音ありの自動再生の断り。音を出してよいかは別に確かめて
                      おり（soundAllowed）、断られたら消音で流している
  ほかの誤りは、これまでどおり外へ出る（投げ直すので、記録にも出る）。
  再生の約束を待っている側には、これまでどおりどの誤りも届く。
*/
if (Platform.OS === 'web' && typeof HTMLMediaElement !== 'undefined') {
  const proto = HTMLMediaElement.prototype as HTMLMediaElement & { __knPlayGuard?: boolean };
  if (!proto.__knPlayGuard) {
    proto.__knPlayGuard = true;
    const play = proto.play;
    proto.play = function guardedPlay(this: HTMLMediaElement) {
      const started = play.call(this);
      started?.catch?.((err: unknown) => {
        const name = (err as { name?: string } | null)?.name;
        if (name !== 'AbortError' && name !== 'NotAllowedError') throw err;
      });
      return started;
    };
  }
}

type Phase = 'video' | 'logo';

export function IntroVideo({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('video');
  const [index, setIndex] = useState(0);
  const [gone, setGone] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  // 二重に終了処理が走らないようにする
  const finishing = useRef(false);

  /* いま消音か。映像を差し替えるたびに見るので、控えも持つ */
  const silent = useRef(Platform.OS === 'web');
  const [showSound, setShowSound] = useState(false);

  const player = useVideoPlayer(SOURCES[0], (p) => {
    p.loop = false;
    /*
      端末は、そのまま音を出す。ブラウザは、断られると映像ごと止まるため
      いったん消音で始め、出してよいと分かってから音を入れる（下）。
    */
    p.muted = Platform.OS === 'web';
    p.play();
  });

  /** 「音を出す」。押されたのは利用者の操作なので、ブラウザも断らない */
  function turnSoundOn() {
    silent.current = false;
    player.muted = false;
    setShowSound(false);
    // 消音のまま止められていた場合に備えて、もう一度流す
    player.play();
  }

  function finish() {
    if (finishing.current) return;
    finishing.current = true;
    /*
      押した瞬間に音を止める。消えるのを待つあいだ鳴り続けると、飛ばせていない
      ように見える。**一時停止ではなく消音にする。** 次の1本の再生を始めた
      直後に一時停止すると、ブラウザが「再生が一時停止で中断された」誤りを
      記録に出す（expo-video が再生の約束を受け止めていないため）。
      映像は、消えたあと部品ごと片付けられる。
    */
    player.muted = true;
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

  /*
    ブラウザで音を出してよいかを確かめる。

    始めるときは消音にしてある（音ありを断られると、映像ごと止まるため）。
    出してよいと分かったら、すぐ音を入れる。駄目なら「音を出す」を出し、
    押されたとき（＝利用者の操作）に入れる。端末では、そのまま音が出る。
  */
  useEffect(() => {
    let alive = true;
    void soundAllowed().then((ok) => {
      if (!alive) return;
      if (ok) {
        silent.current = false;
        player.muted = false;
      } else {
        setShowSound(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [player]);

  // 差し替わった映像を再生する
  useEffect(() => {
    if (phase !== 'video') return;
    player.replace(SOURCES[index]);
    // 差し替えで消音が戻らないようにする
    player.muted = silent.current;
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

        {/*
          ブラウザに音ありの自動再生を断られたとき。押されたら音を入れる。
          飛ばす操作と重ならないよう、ここで止める（押しても導入は終わらない）。
        */}
        {showSound && phase === 'video' && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              turnSoundOn();
            }}
            style={styles.sound}
            accessibilityRole="button"
            accessibilityLabel={t.intro.sound}
          >
            <Ionicons name="volume-high" size={16} color="#ffffff" />
            <Text style={styles.soundText}>{t.intro.sound}</Text>
          </Pressable>
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
  sound: {
    position: 'absolute',
    top: 44,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(11,25,47,0.45)',
  },
  soundText: { fontSize: TEXT.sub, fontWeight: '700', color: '#ffffff' },
  skip: { fontSize: TEXT.sub, color: 'rgba(255,255,255,0.72)' },
  count: { fontSize: TEXT.small, color: 'rgba(255,255,255,0.45)' },
});
