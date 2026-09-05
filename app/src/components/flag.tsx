import { StyleSheet, View } from 'react-native';

import type { Locale } from '@/lib/i18n/dictionaries';

/**
 * 言語の切り替えに添える国旗。
 *
 * **絵文字を使わない理由**
 *   🇯🇵 のような国旗の絵文字は、Windows では旗として描かれず
 *   「JP」という2文字のまま出る。この画面はブラウザでも開くため、
 *   環境によって別のものが出るのは具合が悪い。
 *
 * **図の部品を足さずに描く**
 *   react-native-svg は入っていない。入れるとネイティブ側の
 *   作り直しが要り、確認の手間が跳ね上がる。旗2つのために
 *   払う代償としては大きい。View を重ねれば同じものが描ける。
 *
 * **英語に英国旗を当てている**
 *   言語としての英語を指す印としては、国よりも言語の出所を
 *   示すほうが誤解が少ない。米国旗にすると「米国向け」の
 *   意味に寄る。
 *
 * **union jack は簡略化してある**
 *   本来は赤い斜め帯が白帯の片側へ寄る（カウンターチェンジ）。
 *   16px 前後では1画素にも満たないため、中央に重ねている。
 *   遠目には同じものに見え、判別の役目は果たす。
 */
export function Flag({ locale, width = 20 }: { locale: Locale; width?: number }) {
  // 旗の縦横比は 2:3
  const height = Math.round((width * 2) / 3);
  const frame = {
    width,
    height,
    borderRadius: 2,
    overflow: 'hidden' as const,
    borderWidth: StyleSheet.hairlineWidth,
    // 日本の旗は白地で、白い下地の上では輪郭が消える
    borderColor: 'rgba(0,0,0,0.25)',
  };

  if (locale === 'ja') {
    const disc = Math.round(height * 0.6);
    return (
      <View style={[frame, { backgroundColor: '#ffffff' }]} accessibilityElementsHidden>
        <View
          style={{
            position: 'absolute',
            left: (width - disc) / 2,
            top: (height - disc) / 2,
            width: disc,
            height: disc,
            borderRadius: disc / 2,
            backgroundColor: '#BC002D',
          }}
        />
      </View>
    );
  }

  // 斜めの帯は、対角線の長さぶんだけ伸ばして回す
  const diagonal = Math.sqrt(width * width + height * height);
  const angle = (Math.atan2(height, width) * 180) / Math.PI;
  const bar = (w: number, h: number, color: string, deg: number) => ({
    position: 'absolute' as const,
    left: (width - w) / 2,
    top: (height - h) / 2,
    width: w,
    height: h,
    backgroundColor: color,
    transform: [{ rotate: `${deg}deg` }],
  });

  return (
    <View style={[frame, { backgroundColor: '#012169' }]} accessibilityElementsHidden>
      {/* 白の斜め */}
      <View style={bar(diagonal, height * 0.2, '#ffffff', angle)} />
      <View style={bar(diagonal, height * 0.2, '#ffffff', -angle)} />
      {/* 赤の斜め（細く重ねる） */}
      <View style={bar(diagonal, height * 0.09, '#C8102E', angle)} />
      <View style={bar(diagonal, height * 0.09, '#C8102E', -angle)} />
      {/* 白の十字 */}
      <View style={bar(width, height * 0.34, '#ffffff', 0)} />
      <View style={bar(width * 0.17, height, '#ffffff', 0)} />
      {/* 赤の十字 */}
      <View style={bar(width, height * 0.2, '#C8102E', 0)} />
      <View style={bar(width * 0.1, height, '#C8102E', 0)} />
    </View>
  );
}
