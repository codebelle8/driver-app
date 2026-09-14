'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import type { ActionState } from './facilities';

/**
 * 運営者の情報と、規約類の掲載先。
 *
 * **管理者だけ。** 問い合わせ先を書き換えられると、利用者が別の宛先へ
 * 誘導される。編集者・調査員には渡さない。
 *
 * **文面は持たない。掲載先だけを持つ。**
 *   文面をこちらで抱えると、直すたびに配り直しになる。外に置いて
 *   いただき、アプリは指すだけ。
 */

/** https で始まる URL だけを通す。http は経路上で書き換えられうる。 */
const URL_PATTERN = /^https:\/\/[^\s]+$/;
/** メールアドレスの形。細かく見ない（見すぎると正しいものを弾く）。 */
const MAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveSiteSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };

  /*
    **「https://」の付け忘れは、こちらで補う。**

    ブラウザのアドレス欄から写すと、頭の「https://」が落ちることがある。
    そのたびに弾いていては、打ち直しになるだけで誰の得にもならない。
    形が URL らしければ、こちらで付ける。

    「http://」はそのままにしない。**この画面から出す先は、規約や
    連絡先といった読ませるための頁**で、鍵の掛かっていない経路では
    途中で書き換えられうる。付け替えて通すのではなく、理由を伝えて
    直していただく（相手の頁が https に対応しているとは限らないため、
    こちらの判断で差し替えない）。
  */
  const fixUrl = (raw: string): string => {
    const t = raw.trim();
    if (!t) return '';
    if (t.startsWith('http://') || t.startsWith('https://')) return t;
    return `https://${t}`;
  };

  const v = {
    operatorName: get('operator_name'),
    contactEmail: get('contact_email'),
    termsUrl: fixUrl(get('terms_url')),
    privacyUrl: fixUrl(get('privacy_url')),
    lawUrl: fixUrl(get('law_url')),
  };

  const errors: Record<string, string> = {};
  for (const [key, value] of [
    ['terms_url', v.termsUrl],
    ['privacy_url', v.privacyUrl],
    ['law_url', v.lawUrl],
  ] as const) {
    if (!value) continue;
    if (value.startsWith('http://')) {
      errors[key] = 'http:// ではなく https:// のURLをご指定ください';
    } else if (!URL_PATTERN.test(value)) {
      errors[key] = 'URLの形が正しくありません（例: https://example.com/terms）';
    }
  }
  if (v.contactEmail && !MAIL_PATTERN.test(v.contactEmail)) {
    errors.contact_email = 'メールアドレスの形が正しくありません（例: info@example.com）';
  }

  /*
    **欄の下だけでなく、上にもまとめて出す。**

    欄が画面の外にあると、赤い文字に気づけない。保存を押したのに
    何も起きていないように見える。
  */
  if (Object.keys(errors).length > 0) {
    return { errors, message: '入力を確かめてください。赤い欄をご覧ください。' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('site_settings')
    .update({
      // 空欄は null。空文字を入れると、アプリが「入っている」と見て空の行を出す。
      operator_name: v.operatorName || null,
      contact_email: v.contactEmail || null,
      terms_url: v.termsUrl || null,
      privacy_url: v.privacyUrl || null,
      law_url: v.lawUrl || null,
    })
    .eq('id', 1);

  if (error) return { message: `保存できませんでした: ${error.message}` };

  revalidatePath('/site');
  return { ok: true, message: '保存しました' };
}
