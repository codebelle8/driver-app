import { z } from 'zod';

/**
 * 入力検証。データベース側の制約と対応させている。
 * DB の制約が最後の砦で、ここは「利用者に分かりやすく伝える」ための層。
 */

const trimmed = (max: number) => z.string().trim().max(max);

/** 日本の陸域はおよそ 北緯20〜46 / 東経122〜154。桁の取り違えを検出する。 */
const latitude = z
  .number()
  .min(20, '日本の範囲外です。緯度と経度が逆になっていませんか')
  .max(46, '日本の範囲外です。緯度と経度が逆になっていませんか');

const longitude = z
  .number()
  .min(122, '日本の範囲外です。緯度と経度が逆になっていませんか')
  .max(154, '日本の範囲外です。緯度と経度が逆になっていませんか');

/** 空文字を null に、数値文字列を数値に寄せる */
const optionalNumber = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isNaN(n) ? null : n;
  });

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    const s = (v ?? '').toString().trim();
    return s === '' ? null : s;
  });

export const facilitySchema = z.object({
  name: trimmed(200).min(1, '施設名を入力してください'),
  name_kana: trimmed(200).min(1, '施設名（かな）を入力してください。検索に使用します'),
  // 画面では「;」区切りの1行で入力し、配列に変換する
  aliases: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) =>
      (v ?? '')
        .toString()
        .split(/[;；,、]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  category_id: z.string().uuid('カテゴリを選択してください'),
  postal_code: optionalText.refine(
    (v) => v === null || /^\d{3}-?\d{4}$/.test(v),
    '郵便番号は 123-4567 の形式で入力してください',
  ),
  prefecture: trimmed(20).min(1, '都道府県を入力してください'),
  city: optionalText,
  address_line: trimmed(300).min(1, '住所を入力してください'),
  summary: optionalText,
  lat: optionalNumber.refine(
    (v) => v === null || latitude.safeParse(v).success,
    '緯度が日本の範囲外です',
  ),
  lng: optionalNumber.refine(
    (v) => v === null || longitude.safeParse(v).success,
    '経度が日本の範囲外です',
  ),
  status: z.enum(['draft', 'published', 'archived']),
  note_internal: optionalText,
});

export type FacilityInput = z.infer<typeof facilitySchema>;

export const entryPointSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z]$/, '入口記号は英字1文字（A・B・C…）で入力してください')
      .transform((v) => v.toUpperCase()),
    kind: z.enum(['dropoff', 'entrance', 'parking_entrance', 'bus_stop', 'service']),
    name: trimmed(200).min(1, '名称を入力してください'),
    approach_text: optionalText,
    approach_from: optionalText,
    nav_lat: optionalNumber,
    nav_lng: optionalNumber,
    dropoff_lat: optionalNumber,
    dropoff_lng: optionalNumber,
    height_limit_cm: optionalNumber.refine(
      (v) => v === null || (Number.isInteger(v) && v > 0),
      '高さ制限は正の整数（cm）で入力してください',
    ),
    is_roofed: z.boolean().nullable(),
    is_24h: z.boolean().nullable(),
    is_active: z.boolean(),
    note_internal: optionalText,
  })
  // 緯度と経度は必ず対で入る（DB 側にも同じ制約がある）
  .refine((v) => (v.nav_lat === null) === (v.nav_lng === null), {
    message: 'ナビ座標は緯度と経度の両方を入力してください',
    path: ['nav_lat'],
  })
  .refine((v) => (v.dropoff_lat === null) === (v.dropoff_lng === null), {
    message: '停車位置は緯度と経度の両方を入力してください',
    path: ['dropoff_lat'],
  })
  .refine((v) => v.nav_lat === null || latitude.safeParse(v.nav_lat).success, {
    message: 'ナビ緯度が日本の範囲外です。緯度と経度が逆になっていませんか',
    path: ['nav_lat'],
  })
  .refine((v) => v.nav_lng === null || longitude.safeParse(v.nav_lng).success, {
    message: 'ナビ経度が日本の範囲外です。緯度と経度が逆になっていませんか',
    path: ['nav_lng'],
  });

export type EntryPointInput = z.infer<typeof entryPointSchema>;

/** FormData を素直なオブジェクトへ。チェックボックスは boolean へ寄せる。 */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;
    out[key] = value;
  }
  return out;
}

/** zod のエラーを「項目名 → メッセージ」へ整形する */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
