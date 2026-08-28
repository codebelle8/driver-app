'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import type { AdminRole } from '@/lib/supabase/database.types';

export interface AccountActionState {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** 発行直後の初期パスワード。一度だけ画面に出す。 */
  issued?: { email: string; password: string };
}

/**
 * 初期パスワードを作る。
 *
 * 紛らわしい文字 (0/O, 1/l/I) を除いているのは、この文字列が画面から
 * 手で書き写され、口頭やメモで調査員へ渡されるため。
 * 読み違えによる問い合わせは、そのまま管理者の手間になる。
 */
function generatePassword(length = 14): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
}

const ROLES: AdminRole[] = ['admin', 'editor', 'surveyor'];

function isRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}

/**
 * アカウントを発行する。
 *
 * 招待メールではなく初期パスワードを発行する方式にしている理由:
 *   Supabase の既定の送信メールは1時間あたりの通数が厳しく制限されており、
 *   20名分をまとめて招待すると届かないものが出る。届いたかどうかを
 *   管理者が確認できないため、原因の分からない「ログインできない」が発生する。
 *   その場で渡せるパスワードにすれば、配布の成否が管理者の手の内に残る。
 */
export async function createAccount(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  await requireAdmin();

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const displayName = String(formData.get('display_name') ?? '').trim();
  const role = formData.get('role');

  const errors: Record<string, string> = {};
  if (!email) errors.email = 'メールアドレスをご入力ください';
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    errors.email = 'メールアドレスの形式をご確認ください';
  }
  if (!displayName) errors.display_name = 'お名前をご入力ください';
  if (!isRole(role)) errors.role = '役割をお選びください';

  if (Object.keys(errors).length) {
    return { errors, message: '入力内容をご確認ください。' };
  }

  const admin = createAdminClient();
  const password = generatePassword();

  // email_confirm を立てるのは、確認メールを待たずに使い始められるようにするため。
  // 本人確認は「管理者がこの人にパスワードを手渡した」という事実で担保する。
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    const duplicate = /already|exists|registered/i.test(createError?.message ?? '');
    return {
      errors: duplicate ? { email: 'このメールアドレスは既に登録されています' } : {},
      message: duplicate
        ? '入力内容をご確認ください。'
        : `アカウントを作成できませんでした（${createError?.message ?? '原因不明'}）`,
    };
  }

  const { error: profileError } = await admin.from('admin_profiles').insert({
    user_id: created.user.id,
    display_name: displayName,
    role: role as AdminRole,
  });

  if (profileError) {
    // 権限の行が作れないと、ログインはできるが何もできない中途半端な状態になる。
    // 追跡できない利用者を残さないため、認証側も取り消す。
    await admin.auth.admin.deleteUser(created.user.id);
    return { message: `権限の登録に失敗しました（${profileError.message}）` };
  }

  revalidatePath('/accounts');
  return {
    ok: true,
    message: `${displayName} さんのアカウントを発行しました。`,
    issued: { email, password },
  };
}

/** 有効・停止を切り替える。停止しても記録は残るため、削除は用意しない。 */
export async function setAccountActive(formData: FormData): Promise<void> {
  const me = await requireAdmin();

  const userId = String(formData.get('user_id') ?? '');
  const active = formData.get('active') === 'true';

  // 自分を停止すると、その場で管理画面から締め出される
  if (userId === me.userId && !active) return;

  const supabase = await createClient();
  await supabase.from('admin_profiles').update({ is_active: active }).eq('user_id', userId);

  revalidatePath('/accounts');
}

/** 役割を変更する。 */
export async function setAccountRole(formData: FormData): Promise<void> {
  const me = await requireAdmin();

  const userId = String(formData.get('user_id') ?? '');
  const role = formData.get('role');
  if (!isRole(role)) return;

  const supabase = await createClient();

  // 最後の管理者が自分を降格すると、誰もアカウントを操作できなくなる。
  // 復旧には Supabase の管理画面から直接 SQL を実行するしかなくなるため塞ぐ。
  if (userId === me.userId && role !== 'admin') {
    const { count } = await supabase
      .from('admin_profiles')
      .select('user_id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true);

    if ((count ?? 0) <= 1) return;
  }

  await supabase.from('admin_profiles').update({ role }).eq('user_id', userId);

  revalidatePath('/accounts');
}
