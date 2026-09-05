/**
 * 施設のデータから、いまの言語のものを取り出す。
 *
 * **なぜ一か所にまとめるか**
 *   英語欄は空のことがある。193件の英訳が揃うまで英語表示を止める
 *   作りにはしていない。半分でも読めるほうが役に立つ。
 *   その「空なら日本語へ落とす」判断が場所ごとにばらつくと、
 *   ある画面では空欄、別の画面では日本語、という不揃いになる。
 *
 * **住所は並び替えが要る**
 *   日本語は「東京都千代田区内幸町一丁目」と大きい単位から書く。
 *   英語は逆で「1-chome, Uchisaiwaicho, Chiyoda-ku, Tokyo」。
 *   文字をつなぐ順そのものが言語で変わるため、つなぐ場所を
 *   一か所に持つ。
 */
import type { Locale } from './i18n/dictionaries';
import type { Category, Caution, EntryPoint, Facility } from './types';

/**
 * 日本語の値と英語の値から、いまの言語のものを選ぶ。
 *
 * 英語を選んでいても、英訳が空なら日本語を返す。空欄を出すより、
 * 読めない言語でも中身がある方がよい。地名や施設名は、
 * 地図や看板と照合する手がかりになる。
 */
export function pick(locale: Locale, ja: string, en: string | null): string;
export function pick(locale: Locale, ja: string | null, en: string | null): string | null;
export function pick(locale: Locale, ja: string | null, en: string | null): string | null {
  if (locale === 'en' && en != null && en.trim() !== '') return en;
  return ja;
}

export const facilityName = (f: Facility, locale: Locale) => pick(locale, f.name, f.name_en);

export const facilitySummary = (f: Facility, locale: Locale) =>
  pick(locale, f.summary, f.summary_en);

export const entryPointName = (e: EntryPoint, locale: Locale) => pick(locale, e.name, e.name_en);

export const approachText = (e: EntryPoint, locale: Locale) =>
  pick(locale, e.approach_text, e.approach_text_en);

export const approachFrom = (e: EntryPoint, locale: Locale) =>
  pick(locale, e.approach_from, e.approach_from_en);

export const cautionBody = (c: Caution, locale: Locale) => pick(locale, c.body, c.body_en);

export const categoryName = (c: Category, locale: Locale) => pick(locale, c.name, c.name_en);

/**
 * 住所を1行にまとめる。
 *
 * 日本語: 東京都千代田区内幸町一丁目
 * 英語:   1-chome, Uchisaiwaicho, Chiyoda-ku, Tokyo
 *
 * 英語側は、いずれかの英訳が欠けていればその部分に日本語が混ざる。
 * 混ざっても位置は正しく、地図との照合はできる。
 */
export function facilityAddress(f: Facility, locale: Locale): string {
  const prefecture = pick(locale, f.prefecture, f.prefecture_en);
  const city = pick(locale, f.city, f.city_en);
  const line = pick(locale, f.address_line, f.address_line_en);

  if (locale === 'en') {
    return [line, city, prefecture].filter((x) => x && x.trim() !== '').join(', ');
  }
  return `${prefecture}${city ?? ''}${line}`;
}
