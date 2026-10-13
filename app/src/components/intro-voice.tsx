import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { useT } from '@/lib/i18n/context';
import { useVoiceFont, VOICE_FONT } from '@/lib/voice-font';

/** 一文が浮かび上がるまでの間（ロゴが目に入ってから） */
const DELAY_MS = 350;

/**
 * 導入の最後のロゴの下に出す一文（「あなたの声が、アプリを進化させる。」。2026-10-13）。
 *
 * 手書き風の書体で、ロゴが目に入ってから、ふわっと浮かび上がる。ロゴの段に
 * なったときに作られ、そのとき動き出す。映像そのものは作り直さない。
 *
 * 導入の本体（intro-video.tsx）とはファイルを分けている。書体の読み込みと
 * 動きを本体に足すと、映像の操作（消音・再生）まで含めて作りの検査が
 * 細かくなり、本体を書き直すことになるため。
 */
export function IntroVoice() {
  const t = useT();
  const font = useVoiceFont();
  const [shown] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const anim = Animated.timing(shown, {
      toValue: 1,
      duration: 600,
      delay: DELAY_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [shown]);

  return (
    <Animated.Text style={[styles.voice, font && { fontFamily: VOICE_FONT }, { opacity: shown }]} testID="intro-voice">
      {t.brand.voice}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  voice: { fontSize: 22, lineHeight: 34, letterSpacing: 1, color: '#ffffff', textAlign: 'center' },
});
