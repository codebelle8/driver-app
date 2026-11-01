'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth';
import { isFreeOperatorEmail } from '@/lib/owner';
import { nextPaidUntil } from '@/lib/plans';
import { createAdminClient, createClient } from '@/lib/supabase/server';
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

  if (Object.keys(errors).length > 0) return { errors, message: '入力内容をご確認ください。赤い欄をご覧ください。' };

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

/**
 * アプリの会員を、調査員にする（または戻す）。ご指示 2026-11-01。
 *
 * **以前はできなかった。** 調査員は「アカウント」の画面で新しく発行するしかなく、
 * アプリに登録済みのアドレスで発行すると「既に登録されています」で止まった。
 * ここでは、その方の会員のアカウントに調査員の権限を足すだけにする。
 * パスワードもデータもそのままで、同じアドレスで管理画面にも入れるようになる。
 *
 * **戻すときは権限の行だけを消す。** 「アカウント」の画面の「削除」は認証ごと
 * 消すため、会員だった方に使うと会員のアカウントまで消える。こちらは
 * 通常の会員に戻すだけで、アカウントもデータも残る。
 *
 * **書き込みはログイン中の管理者の鍵で行う。** 権限の表の変更は操作履歴に
 * 自動で残る（データベースのトリガー）。サーバーの鍵で書くと、誰が
 * 押したのかが空欄になる。
 *
 * 触らないもの:
 *   * 運営者（所有者・上野修さん）… もとから無料。所有者は管理者でもある
 *   * 編集者・管理者 … 役割は「アカウント」の画面で変える
 *   * 停止中の会員 … 先に停止を解いていただく
 */
export async function setMemberSurveyor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const userId = String(formData.get('user_id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { message: '会員が特定できませんでした' };
  const on = formData.get('surveyor') === 'true';

  const admin = createAdminClient();
  const { data: member } = await admin
    .from('driver_profiles')
    .select('display_name, status')
    .eq('user_id', userId)
    .maybeSingle();
  if (!member) return { message: '会員が見つかりませんでした' };

  const { data: user } = await admin.auth.admin.getUserById(userId);
  const email = user?.user?.email ?? null;
  if (isFreeOperatorEmail(email)) return { message: '運営者のアカウントは変更できません' };

  const supabase = await createClient();
  const { data: staff } = await admin
    .from('admin_profiles')
    .select('role, is_active')
    .eq('user_id', userId)
    .maybeSingle();

  if (staff && staff.role !== 'surveyor') {
    return { message: '管理画面の担当者です。役割は「アカウント」の画面で変えてください' };
  }

  if (on) {
    if (member.status === 'blocked') {
      return { message: '利用を停止している方です。先に「停止を解く」を押してください' };
    }
    if (staff?.is_active) return { ok: true };
    const { error } = staff
      ? await supabase.from('admin_profiles').update({ is_active: true }).eq('user_id', userId)
      : await supabase.from('admin_profiles').insert({
          user_id: userId,
          /* 管理画面の一覧と操作履歴に出る名前。表示名が無ければアドレス */
          display_name: member.display_name?.trim() || email || '調査員',
          role: 'surveyor',
        });
    if (error) return { message: `調査員にできませんでした（${error.message}）` };
  } else {
    if (!staff) return { ok: true };
    const { error } = await supabase.from('admin_profiles').delete().eq('user_id', userId);
    if (error) return { message: `調査員をやめられませんでした（${error.message}）` };
  }

  revalidatePath('/members');
  revalidatePath('/accounts');
  return { ok: true };
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
    .select('status, plan, paid_until, trial_ends_at')
    .eq('user_id', userId)
    .maybeSingle();

  /*
    いつまでご利用いただけるかを、ここで決める（ご指示 2026-09-15）。

    **以前は決めていなかった。** 「ご利用中」にすると、そのまま無期限に
    使えた。1か月ぶん払った方も1年ぶん払った方も同じ扱いで、期限という
    ものが無かった。お選びの刻みぶんだけ先の日付を入れる。

    戻すときは消す。無料期間へ戻したのに期限だけ残っていると、
    次に「入金を確認した」を押したとき、その残りへ足してしまう。
  */
  const patch: {
    status: 'active' | 'trial' | 'blocked';
    paid_until?: string | null;
  } = { status: next };

  if (next === 'active') {
    patch.paid_until = nextPaidUntil(
      {
        paidUntil: before?.paid_until ?? null,
        /*
          **無料期間の残りも足す。** 無料期間の途中でお振込みいただいた
          方の残りを切り捨てると、早く払った方ほど損をする（ご指摘 2026-09-15）。
        */
        trialEndsAt: before?.trial_ends_at ?? null,
      },
      before?.plan ?? null,
    );
  } else {
    patch.paid_until = null;
  }

  const { error } = await admin.from('driver_profiles').update(patch).eq('user_id', userId);
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
    diff: {
      status: { from: before?.status ?? null, to: next },
      paid_until: { from: before?.paid_until ?? null, to: patch.paid_until ?? null },
    },
  });

  /*
    お支払いの報告が出ていたら、ここで片付ける。

    「入金を確認した」を押した時点で用は済んでいる。押したあとも
    ヘッダーに残り続けると、片付いたのか分からない。

    ご利用中にしたときだけ。停止や無料期間へ戻したときは、まだ
    入金を待っている状態なので残す。
  */
  if (next === 'active') {
    await admin
      .from('admin_notices')
      .update({
        state: 'done',
        decided_at: new Date().toISOString(),
        decided_by: me.userId,
      })
      .eq('kind', 'payment')
      .eq('member_id', userId)
      .eq('state', 'open');
  }

  revalidatePath('/members');
  revalidatePath('/', 'layout');
}
