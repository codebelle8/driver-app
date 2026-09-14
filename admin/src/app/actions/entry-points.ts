'use server';

import { revalidatePath } from 'next/cache';

import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { entryPointSchema, fieldErrors, formToObject, pickIds } from '@/lib/validation';
import type { ActionState } from './facilities';

/** チェックボックス／三値のセレクトを boolean | null へ寄せる */
function triState(value: FormDataEntryValue | null): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export async function saveEntryPoint(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const facilityId = formData.get('facility_id');
  if (typeof facilityId !== 'string') {
    return { message: '施設が特定できませんでした' };
  }
  const entryPointId = formData.get('id');

  const raw = {
    ...formToObject(formData),
    is_roofed: triState(formData.get('is_roofed')),
    is_24h: triState(formData.get('is_24h')),
    is_active: formData.get('is_active') === 'on' || formData.get('is_active') === 'true',
  };

  const parsed = entryPointSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), message: '入力内容をご確認ください。' };
  }

  const supabase = await createClient();

  const payload = { ...parsed.data, facility_id: facilityId };

  const { error } =
    typeof entryPointId === 'string' && entryPointId
      ? await supabase.from('entry_points').update(payload).eq('id', entryPointId)
      : await supabase.from('entry_points').insert(payload);

  if (error) {
    // 施設内で入口記号が重複した場合は分かりやすく伝える
    if (error.code === '23505') {
      return {
        errors: { code: `入口記号「${parsed.data.code}」はこの施設で既に使われています` },
        message: '入力内容をご確認ください。',
      };
    }
    return { message: `保存に失敗しました: ${error.message}` };
  }

  revalidatePath(`/facilities/${facilityId}`);
  revalidatePath('/');
  return { ok: true, message: '入口の情報を保存しました。' };
}

/**
 * 入口を消す。1件でも、選んだぶんをまとめてでも。
 *
 * getAll で受けているのは、まとめて消すときに同じ名前の隠し入力を
 * 選んだ数だけ並べるため。1件のときは要素が1つの配列になるだけで、
 * 経路は変わらない。件数ごとに別の処理を持つと、権限の確認や
 * 画面の作り直しを二重に書くことになる。
 */
export async function deleteEntryPoint(formData: FormData): Promise<void> {
  await requireStaff();

  const ids = pickIds(formData);
  const facilityId = formData.get('facility_id');
  if (ids.length === 0 || typeof facilityId !== 'string') return;

  const supabase = await createClient();
  await supabase.from('entry_points').delete().in('id', ids);

  revalidatePath(`/facilities/${facilityId}`);
  revalidatePath('/');
}

export async function saveCaution(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const entryPointId = formData.get('entry_point_id');
  const facilityId = formData.get('facility_id');
  const body = formData.get('body');

  if (typeof entryPointId !== 'string' || typeof facilityId !== 'string') {
    return { message: '入口が特定できませんでした' };
  }
  if (typeof body !== 'string' || !body.trim()) {
    return {
      errors: { body: '注意事項の本文を入力してください' },
      message: '入力内容をご確認ください。赤い欄をご覧ください。',
    };
  }

  const timeFrom = formData.get('time_from');
  const timeTo = formData.get('time_to');
  const hasFrom = typeof timeFrom === 'string' && timeFrom !== '';
  const hasTo = typeof timeTo === 'string' && timeTo !== '';

  if (hasFrom !== hasTo) {
    return {
      errors: { time_from: '時間帯は開始と終了の両方を入力してください' },
      message: '入力内容をご確認ください。',
    };
  }

  const weekdays = formData
    .getAll('weekdays')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);

  const bodyEn = formData.get('body_en');

  const supabase = await createClient();
  const { error } = await supabase.from('cautions').insert({
    entry_point_id: entryPointId,
    body: body.trim(),
    // 空欄は null。空文字を入れると、アプリが「訳がある」と見て空を出す。
    body_en: typeof bodyEn === 'string' && bodyEn.trim() !== '' ? bodyEn.trim() : null,
    severity: (formData.get('severity') as 'info' | 'warn' | 'critical') ?? 'warn',
    time_from: hasFrom ? (timeFrom as string) : null,
    time_to: hasTo ? (timeTo as string) : null,
    weekdays,
  });

  if (error) return { message: `保存に失敗しました: ${error.message}` };

  revalidatePath(`/facilities/${facilityId}`);
  return { ok: true, message: '注意事項を追加しました。' };
}

/** 注意事項を消す。1件でも、選んだぶんをまとめてでも。 */
export async function deleteCaution(formData: FormData): Promise<void> {
  await requireStaff();

  const ids = pickIds(formData);
  const facilityId = formData.get('facility_id');
  if (ids.length === 0 || typeof facilityId !== 'string') return;

  const supabase = await createClient();
  await supabase.from('cautions').delete().in('id', ids);

  revalidatePath(`/facilities/${facilityId}`);
}
