import { Image, type ImageContentPosition, type ImageStyle } from 'expo-image';
import { useState } from 'react';

import { CAN_LOAD_ART } from '@/lib/art';

/**
 * 在り処を順に試して読み込む写真。
 *
 * **なぜ順に試すか**
 *   拡張子を1つに決めていない。.jpg でお願いしたところ .png で
 *   ご提供いただいた経緯があり、名前が合っていれば受け取れるほうが
 *   やり取りが1往復減る。
 *
 * **どれも読めなかったとき**
 *   何も描かない。呼ぶ側が下敷きを敷いてあるので、そのまま残る。
 *   写真が無い状態は当面続くため、失敗を異常として扱わない。
 */
export function ArtImage({
  urls,
  style,
  contentPosition,
}: {
  /** 試す順。先頭から。 */
  urls: string[];
  style?: ImageStyle;
  contentPosition?: ImageContentPosition;
}) {
  const [at, setAt] = useState(0);

  if (!CAN_LOAD_ART || at >= urls.length) return null;

  return (
    <Image
      // 在り処が変わったら描き直させる。同じ要素のまま差し替えると、
      // 失敗したままの状態が残ることがある。
      key={urls[at]}
      source={{ uri: urls[at] }}
      style={style}
      contentFit="cover"
      contentPosition={contentPosition}
      transition={200}
      onError={() => setAt((i) => i + 1)}
      accessibilityLabel=""
    />
  );
}
