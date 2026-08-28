import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { createClient } from './supabase/server';
import type { AdminProfile } from './supabase/database.types';

export interface Staff {
  userId: string;
  email: string | null;
  profile: AdminProfile;
}

/**
 * ログイン済みかつ admin_profiles に登録されている利用者を返す。
 * 満たさない場合はログイン画面へ送る。
 *
 * ログインできること（認証）と、操作できること（認可）は別物。
 * Supabase の利用者を作っただけでは admin_profiles に行が無く、
 * 権限をまったく持たない。ここで両方を確認する。
 */
export async function requireStaff(): Promise<Staff> {
  const supabase = await createClient();

  /*
    proxy.ts が既にトークンを検証し、利用者を確かめている。
    その結果を受け取れれば、ここで getUser() を呼ぶ必要はない。

    getUser() は Supabase の認証サーバーへの往復を伴う。2回呼ぶと
    表示のたびに 70〜100ms を余分に使う。

    受け取れない場合（proxy を通らない経路）は従来どおり自分で確かめる。
  */
  const forwarded = await headers();
  const userId = forwarded.get('x-kn-user-id');
  const email = forwarded.get('x-kn-user-email');

  let user: { id: string; email: string | null } | null =
    userId ? { id: userId, email: email || null } : null;

  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  }

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) redirect('/login?error=no_permission');

  return { userId: user.id, email: user.email, profile };
}

/**
 * 公開・削除を行える者だけを通す。調査員は弾く。
 *
 * データベース側の RLS でも同じ境界を敷いているが、こちらでも確認する理由:
 *   RLS は権限の無い操作を「エラー」ではなく「対象0件」にすることがある。
 *   その場合、画面上は成功したように見えて何も起きない。
 *   ここで先に弾けば、利用者に理由を伝えられる。
 */
export async function requireManager(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.profile.role === 'surveyor') redirect('/?error=manager_only');
  return staff;
}

/** その施設をこの人が編集できるか。調査員は公開済みに触れない。 */
export function canEditFacility(staff: Staff, status: string): boolean {
  if (staff.profile.role !== 'surveyor') return true;
  return status !== 'published';
}

/** 管理者のみが行える操作で使う。編集者は弾く。 */
export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.profile.role !== 'admin') redirect('/?error=admin_only');
  return staff;
}
