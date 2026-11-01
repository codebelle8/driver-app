'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth';
import { isOwnerEmail } from '@/lib/owner';
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

/**
 * 対象が所有者かどうか。
 *
 * メールアドレスは認証情報の側にしか無いため、admin 権限で引く。
 * 判定の意味と、実際に止めている層については @/lib/owner を参照。
 */
async function isOwner(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  return isOwnerEmail(data?.user?.email);
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
      /*
        アプリの会員のアドレスで発行しようとした場合も、ここで止まる。
        会員を調査員にする入口（会員・お支払い）へ案内する（2026-11-01）。
      */
      errors: duplicate
        ? {
            email:
              'このメールアドレスは既に登録されています。アプリの会員を調査員にするときは、「会員・お支払い」の画面で「調査員にする」を押してください',
          }
        : {},
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

/**
 * アカウントを完全に削除する。
 *
 * **「停止」との違い:**
 *   停止はログインを止めるだけで、名前も操作履歴も残る。
 *   削除は認証情報ごと消すため、操作履歴の実行者欄が空欄になる
 *   （audit_logs.actor_id が on delete set null のため、記録自体は残る）。
 *   誰が何をしたか追えなくなるので、通常は停止を勧める。
 *
 * 退職者の個人情報を残さない、といった目的では削除が要る。
 */
export async function deleteAccount(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const me = await requireAdmin();

  const userId = String(formData.get('user_id') ?? '');
  if (!userId) return { message: 'アカウントが特定できませんでした' };

  // 自分を消すと、その場で締め出されたうえ取り消せない
  if (userId === me.userId) {
    return { message: 'ご自身のアカウントは削除できません。' };
  }

  if (await isOwner(userId)) {
    return { message: '所有者のアカウントは削除できません。' };
  }

  const supabase = await createClient();

  const { data: target } = await supabase
    .from('admin_profiles')
    .select('display_name, role')
    .eq('user_id', userId)
    .single();

  if (!target) return { message: 'アカウントが見つかりませんでした' };

  /*
    最後の管理者を消すと、誰もアカウントを操作できなくなる。
    復旧には Supabase の管理画面から直接 SQL を実行するしかない。
    停止のときと同じ理由で塞ぐ。
  */
  if (target.role === 'admin') {
    const { count } = await supabase
      .from('admin_profiles')
      .select('user_id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true);

    if ((count ?? 0) <= 1) {
      return { message: '管理者が1人だけのため削除できません。先に別の管理者を用意してください。' };
    }
  }

  // 認証情報を消すと admin_profiles も連鎖して消える (on delete cascade)
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { message: `削除できませんでした: ${error.message}` };

  revalidatePath('/accounts');
  return { ok: true, message: `${target.display_name} さんのアカウントを削除しました。` };
}

/** 有効・停止を切り替える。停止ならログインを止めるだけで、記録は残る。 */
export async function setAccountActive(formData: FormData): Promise<void> {
  const me = await requireAdmin();

  const userId = String(formData.get('user_id') ?? '');
  const active = formData.get('active') === 'true';

  // 自分を停止すると、その場で管理画面から締め出される
  if (userId === me.userId && !active) return;

  if (!active && (await isOwner(userId))) return;

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

  // 所有者を降格させてから消す、という順序を塞ぐ
  if (role !== 'admin' && (await isOwner(userId))) return;

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
