/**
 * 取り消せない操作の前に、一度受け止める。
 *
 * **なぜ要るか**
 *   消す操作は元に戻せない。指が滑って触れただけで消えるのは、
 *   走行前の慌ただしい場面ではとくに起こりやすい。
 *
 * **環境ごとの違いをここで吸収する**
 *   端末側には Alert があり、ブラウザには confirm がある。
 *   呼ぶ側がその違いを気にせずに済むようにまとめる。
 *
 * **「はい」を右に置かない**
 *   端末側の Alert は、消す側を destructive として示す。
 *   ブラウザの confirm は並びを決められないため、文面のほうで
 *   何が起きるかを明示する。
 */
import { Alert, Platform } from 'react-native';

export function confirmDelete(options: {
  /** 見出し。何を消すのか。 */
  title: string;
  /** 本文。件数と、元に戻せないことを書く。 */
  message: string;
  /** 消す側の文言。「削除する」「解除する」など。 */
  yes?: string;
  onYes: () => void;
}): void {
  const yes = options.yes ?? '削除する';

  if (Platform.OS === 'web') {
    // ブラウザは見出しと本文を分けられない。1つにまとめて出す。
    if (window.confirm(`${options.title}\n\n${options.message}`)) options.onYes();
    return;
  }

  Alert.alert(options.title, options.message, [
    { text: 'やめる', style: 'cancel' },
    { text: yes, style: 'destructive', onPress: options.onYes },
  ]);
}
