import { useFonts } from 'expo-font';

/**
 * 「あなたの声が、アプリを進化させる。」だけに使う、手書き風の書体（2026-10-13）。
 *
 * ご指示「標準の書体ではなく、意味に合う書体を」。ドライバー一人ひとりの「声」を、
 * 人の手で書いたような字で見せる。紹介サイトの同じ一文と同じ書体（Klee One の
 * SemiBold）。
 *
 * **この一文の字だけを入れてある**（Google Fonts で絞り込んだもの。15KB）。
 * ほかの文に使うと、その字だけ別の書体に落ちる。一文を変えたら、書体の
 * ファイル（assets/fonts/KleeOne-Voice.ttf）も作り直すこと。英語の一文の字も含む。
 * 使用許諾は SIL Open Font License（assets/fonts/KleeOne-OFL.txt）。
 *
 * 読み込めないあいだ・読み込めなかったときは、いつもの書体で出す（文は欠けない）。
 */
export const VOICE_FONT = 'KleeOneVoice';

export function useVoiceFont(): boolean {
  const [loaded, error] = useFonts({ [VOICE_FONT]: require('@/assets/fonts/KleeOne-Voice.ttf') });
  return loaded && !error;
}
