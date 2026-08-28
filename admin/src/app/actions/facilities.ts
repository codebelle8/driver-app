'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireManager, requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { facilitySchema, fieldErrors, formToObject } from '@/lib/validation';

export interface ActionState {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
}

/**
 * 施設コード (HTL-0001) を採番する。
 * カテゴリの接頭辞ごとに連番を振る。写真のファイル名と対応させるため、
 * 一度採番したコードは変更しない。
 */
async function nextFacilityCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryId: string,
): Promise<string> {
  const { data: category } = await supabase
    .from('categories')
    .select('code_prefix')
    .eq('id', categoryId)
    .single();

  if (!category) throw new Error('カテゴリが見つかりません');

  const { data: existing } = await supabase
    .from('facilities')
    .select('code')
    .like('code', `${category.code_prefix}-%`)
    .order('code', { ascending: false })
    .limit(1);

  const last = existing?.[0]?.code;
  const nextNumber = last ? Number(last.split('-')[1]) + 1 : 1;

  return `${category.code_prefix}-${String(nextNumber).padStart(4, '0')}`;
}

export async function createFacility(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const parsed = facilitySchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), message: '入力内容をご確認ください。' };
  }

  const supabase = await createClient();

  let code: string;
  try {
    code = await nextFacilityCode(supabase, parsed.data.category_id);
  } catch (e) {
    return { message: e instanceof Error ? e.message : 'コードの採番に失敗しました' };
  }

  const { data, error } = await supabase
    .from('facilities')
    .insert({ ...parsed.data, code })
    .select('id')
    .single();

  if (error) {
    return { message: `登録に失敗しました: ${error.message}` };
  }

  revalidatePath('/facilities');
  revalidatePath('/');
  redirect(`/facilities/${data.id}?created=1`);
}

export async function updateFacility(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const id = formData.get('id');
  if (typeof id !== 'string') return { message: '施設が特定できませんでした' };

  const parsed = facilitySchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), message: '入力内容をご確認ください。' };
  }

  const supabase = await createClient();

  // 更新できた行を返させているのは、権限が足りないときに黙って
  // 0件で終わるのを検出するため。RLS は「見えない行」を除外するだけで
  // エラーにしないため、これが無いと保存できたように見えてしまう。
  const { data: updated, error } = await supabase
    .from('facilities')
    .update(parsed.data)
    .eq('id', id)
    .select('id');

  if (error) return { message: `更新に失敗しました: ${error.message}` };
  if (!updated || updated.length === 0) {
    return {
      message:
        '保存できませんでした。公開済みの施設は調査員の権限では変更できません。'
        + '管理者へご連絡ください。',
    };
  }

  revalidatePath(`/facilities/${id}`);
  revalidatePath('/facilities');
  revalidatePath('/');
  return { ok: true, message: '保存しました。' };
}

export async function deleteFacility(formData: FormData): Promise<void> {
  await requireManager();

  const id = formData.get('id');
  if (typeof id !== 'string') return;

  const supabase = await createClient();
  await supabase.from('facilities').delete().eq('id', id);

  revalidatePath('/facilities');
  revalidatePath('/');
  redirect('/facilities');
}

/**
 * 公開前チェック。データベース側の関数を呼び、問題点の一覧を受け取る。
 * 検証ロジックを画面側に持たせないのは、CSV 一括投入など別経路から
 * 登録された場合にも同じ基準が働くようにするため。
 */
export async function checkPublishReadiness(facilityId: string): Promise<string[]> {
  await requireStaff();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('validate_facility_for_publish', {
    p_facility_id: facilityId,
  });

  if (error) return [`チェックに失敗しました: ${error.message}`];
  return (data as string[]) ?? [];
}

export async function setFacilityStatus(formData: FormData): Promise<void> {
  await requireManager();

  const id = formData.get('id');
  const status = formData.get('status');
  if (typeof id !== 'string' || typeof status !== 'string') return;

  const supabase = await createClient();
  await supabase
    .from('facilities')
    .update({ status: status as 'draft' | 'published' | 'archived' })
    .eq('id', id);

  revalidatePath(`/facilities/${id}`);
  revalidatePath('/facilities');
  revalidatePath('/');
}
