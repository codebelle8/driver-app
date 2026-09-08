'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import type { ActionState } from './facilities';

/**
 * 会員（ドライバー）と、お支払いの受取口座。
 *
 * **管理者だけ。** 受取口座を書き換えられると、支払いがまるごと他所へ
 * 流れる。編集者・調査員には渡さない。
 *
 * **service_role を使う理由**
 *   会員の名簿は、会員自身が status や無料期間を書き換えられないよう
 *   列ごとに権限を絞ってある（20260908000003）。管理者にもその列は
 *   渡していない。ここは画面の外（サーバー側）でのみ動くため、
 *   RLS を迂回する鍵を使い、入口で requireAdmin() を通す。
 *
 * **お金に関わる操作は記録する**
 *   入金の確認は人が判断する。誰がいつ「ご利用中」にしたのかが
 *   残らないと、後から突き合わせられない。
 */

/** 口座番号。銀行によって桁が違うため、数字であることだけを見る。 */
const ACCOUNT_NUMBER = /^[0-9]{1,10}$/;

function read(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    bankName: get('bank_name'),
    branchName: get('branch_name'),
    accountType: get('account_type'),
    accountNumber: get('account_number'),
    accountHolder: get('account_holder'),
    accountHolderKana: get('account_holder_kana'),
    note: get('note'),
  };
}

/**
 * 受取口座を保存する。
 *
 * **半端な状態で保存させない。** 銀行名・口座番号・名義のどれかが
 * 欠けたまま入ると、アプリは「準備中」を出し続ける。入れたつもりで
 * 出ていない、という分かりにくい状態になる。
 *
 * すべて空にするのは通す（取り下げたいことがある）。
 */
export async function savePaymentSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const v = read(formData);
  const errors: Record<string, string> = {};

  const filled = [v.bankName, v.accountNumber, v.accountHolder || v.accountHolderKana].filter(
    Boolean,
  ).length;

  if (filled > 0 && filled < 3) {
    if (!v.bankName) errors.bank_name = '金融機関名を入力してください';
    if (!v.accountNumber) errors.account_number = '口座番号を入力してください';
    if (!v.accountHolder && !v.accountHolderKana) {
      errors.account_holder = '口座名義を入力してください';
    }
  }

  if (v.accountNumber && !ACCOUNT_NUMBER.test(v.accountNumber)) {
    errors.account_number = '口座番号は数字だけで入力してください';
  }
  if (v.accountType && v.accountType !== 'futsu' && v.accountType !== 'touza') {
    errors.account_type = '種別をお選びください';
  }

  if (Object.keys(errors).length > 0) return { errors };

  const admin = createAdminClient();
  const { error } = await admin
    .from('payment_settings')
    .update({
      // 空欄は null。空文字を入れると「入っている」と見なされる。
      bank_name: v.bankName || null,
      branch_name: v.branchName || null,
      account_type: (v.accountType || null) as 'futsu' | 'touza' | null,
      account_number: v.accountNumber || null,
      account_holder: v.accountHolder || null,
      account_holder_kana: v.accountHolderKana || null,
      note: v.note || null,
    })
    .eq('id', 1);

  if (error) return { message: `保存できませんでした: ${error.message}` };

  revalidatePath('/members');
  return { ok: true, message: '受取口座を保存しました' };
}

/**
 * 入金を確認して、ご利用中にする（または戻す）。
 *
 * **自動では判断しない。** 振込は名義しか届かず、金額も相殺や手数料で
 * ずれる。人が通帳を見て決める。ここはその結果を書き留めるだけ。
 */
export async function setMemberActive(formData: FormData): Promise<void> {
  await setStatus(formData, (active) => (active ? 'active' : 'trial'));
}

/**
 * ご利用を停止する（または戻す）。
 *
 * 停止すると、その方はログインできなくなる。既に入っている端末も、
 * 次に開いたときに入口で止まる。
 *
 * 戻す先は「無料期間」。停止の前が有料だったかどうかは、ここでは
 * 判じない。入金の確認は人が見て決めるものなので、戻したうえで
 * あらためて「入金を確認した」を押していただく。
 */
export async function setMemberBlocked(formData: FormData): Promise<void> {
  await setStatus(formData, (blocked) => (blocked ? 'blocked' : 'trial'));
}

async function setStatus(
  formData: FormData,
  decide: (on: boolean) => 'active' | 'trial' | 'blocked',
): Promise<void> {
  const me = await requireAdmin();

  const userId = String(formData.get('user_id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return;

  const next = decide(formData.get('active') === 'true');

  const admin = createAdminClient();
  const { data: before } = await admin
    .from('driver_profiles')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle();

  const { error } = await admin
    .from('driver_profiles')
    .update({ status: next })
    .eq('user_id', userId);
  if (error) return;

  /*
    誰がいつ切り替えたかを残す。

    入金の確認は人の判断で、後から「本当に入っていたのか」を
    突き合わせる場面がある。記録が無いと辿れない。
  */
  await admin.from('audit_logs').insert({
    actor_id: me.userId,
    action: 'update',
    table_name: 'driver_profiles',
    record_id: userId,
    diff: { status: { from: before?.status ?? null, to: next } },
  });

  revalidatePath('/members');
}
