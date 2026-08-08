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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) redirect('/login?error=no_permission');

  return { userId: user.id, email: user.email ?? null, profile };
}

/** 管理者のみが行える操作で使う。編集者は弾く。 */
export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.profile.role !== 'admin') redirect('/?error=admin_only');
  return staff;
}
