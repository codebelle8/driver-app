import { cookies } from 'next/headers';

import { DEFAULT_LOCALE, dictionaries, isLocale, type Dictionary, type Locale } from './dictionaries';

export const LOCALE_COOKIE = 'kn_locale';
export const THEME_COOKIE = 'kn_theme';

export type Theme = 'light' | 'dark';
export const DEFAULT_THEME: Theme = 'dark';

/**
 * 言語とテーマは Cookie に保存し、**サーバー側で読んでから描画する。**
 * クライアント側で適用すると、最初の一瞬だけ既定の言語や配色が見えてしまう。
 */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return value === 'light' || value === 'dark' ? value : DEFAULT_THEME;
}

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()];
}

export type { Dictionary, Locale };
