import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Image as RNImage, Pressable, StyleSheet, View } from 'react-native';

import { useLocked } from '@/components/plan-gate';
import { homePressed } from '@/lib/home-signal';
import { useT } from '@/lib/i18n/context';
import { HIT_SLOP } from '@/theme';
import { useThemeControl } from '@/theme-context';

/**
 * ヘッダーに置くロゴ。
 *
 * 濃紺版と白抜き版を明暗で使い分ける。
 * 片方だけを色反転させて済ませないのは、ロゴの図柄に複数の色が
 * 使われており、単純な反転では配色が崩れるため。
 *
 * 画像は表示高さの約3倍（160px）を読み込んでいる。
 * 端末の画素密度は 1〜3 倍と幅があり、等倍の画像を渡すと
 * 高精細な端末で輪郭が甘くなる。
 */
const DISPLAY_HEIGHT = 32;

const LOGO_DARK = require('@/assets/brand/logo.png');
const LOGO_LIGHT = require('@/assets/brand/logo-white.png');

/** 万一どちらの方法でも寸法が取れない場合に使う、おおよその比率 */
const FALLBACK_ASPECT = 2.9;

/**
 * 画像そのものから縦横比を求める。
 *
 * 値を決め打ちにしていたところ、濃紺版 (462x160) と白抜き版 (469x160) で
 * 比率が異なり、白抜き版がわずかに横へ伸びていた。
 * 元画像を差し替えても追随するよう、実測に切り替えている。
 *
 * 求め方が2通りあるのは、require() の返り値が環境で異なるため。
 *   ネイティブ … 数値（資材の識別子）。resolveAssetSource で寸法を引く
 *   ブラウザ  … { uri, width, height } の オブジェクト。そのまま読める
 *
 * ブラウザ側には resolveAssetSource が存在せず、呼ぶと画面が真っ白になる。
 */
function aspectOf(source: unknown): number {
  if (
    typeof source === 'object' &&
    source !== null &&
    'width' in source &&
    'height' in source
  ) {
    const { width, height } = source as { width: number; height: number };
    if (width && height) return width / height;
  }

  const resolve = (
    RNImage as unknown as {
      resolveAssetSource?: (s: unknown) => { width: number; height: number } | null;
    }
  ).resolveAssetSource;

  if (typeof resolve === 'function') {
    const resolved = resolve(source);
    if (resolved?.height) return resolved.width / resolved.height;
  }

  return FALLBACK_ASPECT;
}

/**
 * 押せるロゴ。押すと探す画面へ戻る。
 *
 * **なぜ押せるようにしたか**（ご指示 2026-09-10）
 *   ロゴを押せば最初の画面へ戻る、というのは web で身についた癖で、
 *   まず試される。何も起きないと、そこで手が止まる。
 *
 * **期限が切れているあいだは設定へ**
 *   探す画面へは入れないため、押しても門で戻されるだけになる。
 *   はじめから、行ける先へ渡す。
 *
 * ログインの入口では使わない（渡す先が無い）。あちらは BrandLogo のまま。
 */
export function BrandHome({ height = DISPLAY_HEIGHT }: { height?: number }) {
  const t = useT();
  const locked = useLocked();
  const href = locked ? '/mypage' : '/';

  return (
    <Link href={href} asChild>
      <Pressable
        /*
          既に探す画面に居るときは、渡す先が同じで何も起きない。
          押されたことを伝え、絞り込みは向こうで解いてもらう。
        */
        onPress={homePressed}
        accessibilityRole="link"
        accessibilityLabel={locked ? t.brand.toSettings : t.brand.toSearch}
        hitSlop={HIT_SLOP}
      >
        <BrandLogo height={height} />
      </Pressable>
    </Link>
  );
}

export function BrandLogo({ height = DISPLAY_HEIGHT }: { height?: number }) {
  // 端末の設定ではなく、利用者が選んだ表示に従う。
  // useColorScheme() を見ていたため、明るい表示に切り替えても
  // 白抜きのロゴが残り、明るい地の上で読めなくなっていた。
  const { theme } = useThemeControl();
  const source = theme === 'light' ? LOGO_DARK : LOGO_LIGHT;

  return (
    <Image
      source={source}
      style={{ height, width: height * aspectOf(source) }}
      contentFit="contain"
      // ロゴは読み込みが速く、切り替わりの演出はかえって目障りになる
      transition={0}
      accessibilityLabel="車寄せナビ"
    />
  );
}

/**
 * 施設が無いときなどに置く、控えめな図柄。
 * 何も無い画面は「壊れている」と受け取られやすい。
 */
export function BrandMark({ size = 72, opacity = 0.25 }: { size?: number; opacity?: number }) {
  return (
    <View style={[styles.mark, { opacity }]}>
      <Image
        source={require('@/assets/brand/splash-icon.png')}
        style={{ width: size, height: size }}
        contentFit="contain"
        transition={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center' },
});
