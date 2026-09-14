'use server';

import { revalidatePath } from 'next/cache';

import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { ActionState } from './facilities';

/**
 * カテゴリの追加・編集・並べ替え。
 *
 * 調査員には触らせない (requireManager)。カテゴリはアプリの絞り込みに
 * 直結し、1つ変えるだけで全ドライバーの見え方が変わるため。
 */

/** 施設コードの接頭辞。HTL-0001 の「HTL」にあたる。 */
const PREFIX_PATTERN = /^[A-Z]{2,5}$/;
/** 内部で使う識別子。英小文字と数字と下線のみ。 */
const CODE_PATTERN = /^[a-z][a-z0-9_]{1,29}$/;

function readForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    id: get('id'),
    code: get('code').toLowerCase(),
    name: get('name'),
    // 空欄は null。空文字を入れると、アプリが「訳がある」と見て空を出す。
    nameEn: get('name_en') || null,
    codePrefix: get('code_prefix').toUpperCase(),
    isActive: formData.get('is_active') === 'on',
  };
}

/** 入力の検証。DB の一意制約より先に、分かる言葉で返す。 */
function validate(v: ReturnType<typeof readForm>, opts: { requireCode: boolean }) {
  const errors: Record<string, string> = {};

  if (!v.name) errors.name = 'カテゴリ名を入力してください';
  else if (v.name.length > 30) errors.name = '30文字以内で入力してください';

  if (!v.codePrefix) errors.code_prefix = '接頭辞を入力してください';
  else if (!PREFIX_PATTERN.test(v.codePrefix)) {
    errors.code_prefix = '英大文字2〜5文字で入力してください（例: HTL）';
  }

  if (opts.requireCode) {
    if (!v.code) errors.code = '識別子を入力してください';
    else if (!CODE_PATTERN.test(v.code)) {
      errors.code = '英小文字で始まる2〜30文字（英小文字・数字・下線）で入力してください';
    }
  }

  return errors;
}

/** 一意制約の違反を、どの欄の問題か分かる形に直す */
function describeConflict(message: string): Record<string, string> {
  if (message.includes('code_prefix')) {
    return { code_prefix: 'この接頭辞は既に使われています' };
  }
  if (message.includes('code')) {
    return { code: 'この識別子は既に使われています' };
  }
  return {};
}

export async function createCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireManager();

  const v = readForm(formData);
  const errors = validate(v, { requireCode: true });
  if (Object.keys(errors).length) return { errors, message: '入力内容をご確認ください。赤い欄をご覧ください。' };

  const supabase = await createClient();

  /*
    並びの最後に置く。

    列の既定値は 0 のため、採番しないと追加したカテゴリがすべて 0 になり、
    並べ替えても順序が定まらなくなる。
  */
  const { data: last } = await supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('categories').insert({
    code: v.code,
    name: v.name,
    name_en: v.nameEn,
    code_prefix: v.codePrefix,
    sort_order: (last?.sort_order ?? -1) + 1,
    is_active: true,
  });

  if (error) {
    if (error.code === '23505') {
      return { errors: describeConflict(error.message), message: '入力内容をご確認ください。赤い欄をご覧ください。' };
    }
    return { message: `追加できませんでした: ${error.message}` };
  }

  revalidatePath('/categories');
  revalidatePath('/');
  return { ok: true, message: `「${v.name}」を追加しました。` };
}

export async function updateCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireManager();

  const v = readForm(formData);
  if (!v.id) return { message: 'カテゴリが特定できませんでした' };

  const errors = validate(v, { requireCode: false });
  if (Object.keys(errors).length) return { errors, message: '入力内容をご確認ください。赤い欄をご覧ください。' };

  const supabase = await createClient();

  /*
    識別子 (code) は変更させない。

    施設コード (HTL-0001) は登録時に採番済みで、あとから接頭辞を変えても
    既存の施設コードは変わらない。識別子まで変えられるようにすると、
    どの施設がどのカテゴリだったのか追えなくなる。
  */
  const { error } = await supabase
    .from('categories')
    .update({ name: v.name, code_prefix: v.codePrefix, is_active: v.isActive })
    .eq('id', v.id);

  if (error) {
    if (error.code === '23505') {
      return { errors: describeConflict(error.message), message: '入力内容をご確認ください。赤い欄をご覧ください。' };
    }
    return { message: `保存できませんでした: ${error.message}` };
  }

  revalidatePath('/categories');
  revalidatePath('/');
  return { ok: true, message: `「${v.name}」を保存しました。` };
}

/**
 * 並び順を1つ動かす。
 *
 * アプリの絞り込みチップはこの順に並ぶ。よく使うものを左に置けるようにする。
 * 隣と番号を入れ替える方式で、写真の並べ替えと揃えている。
 */
export async function moveCategory(formData: FormData): Promise<void> {
  await requireManager();

  const id = formData.get('id');
  const direction = formData.get('direction');
  if (typeof id !== 'string') return;
  if (direction !== 'up' && direction !== 'down') return;

  const supabase = await createClient();

  const { data: all } = await supabase
    .from('categories')
    .select('id, sort_order')
    .order('sort_order')
    .order('code');
  if (!all) return;

  const at = all.findIndex((c) => c.id === id);
  const to = direction === 'up' ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= all.length) return;

  // 番号が重複していると入れ替えても並びが変わらないため、先に振り直す
  if (all.some((c, i) => c.sort_order !== i)) {
    for (const [i, c] of all.entries()) {
      await supabase.from('categories').update({ sort_order: i }).eq('id', c.id);
    }
  }

  await supabase.from('categories').update({ sort_order: to }).eq('id', all[at].id);
  await supabase.from('categories').update({ sort_order: at }).eq('id', all[to].id);

  revalidatePath('/categories');
  revalidatePath('/');
}

/**
 * カテゴリを削除する。
 *
 * 施設が1件でも紐づいていれば削除しない。外部キーが on delete restrict の
 * ため DB 側でも弾かれるが、その場合のメッセージは利用者に伝わらない。
 * 先に数えて、何件残っているかを含めて返す。
 *
 * 使わなくなったカテゴリは、削除ではなく「停止」で隠せる。
 * 過去の施設がどのカテゴリだったかを残せるため、通常はそちらを勧める。
 */
export async function deleteCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireManager();

  const id = formData.get('id');
  if (typeof id !== 'string') return { message: 'カテゴリが特定できませんでした' };

  const supabase = await createClient();

  const { count } = await supabase
    .from('facilities')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);

  if ((count ?? 0) > 0) {
    return {
      message:
        `このカテゴリには施設が ${count} 件あります。` +
        '削除するには、先に施設を別のカテゴリへ移してください。' +
        '一覧から隠したいだけであれば「停止」をお使いください。',
    };
  }

  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) return { message: `削除できませんでした: ${error.message}` };

  revalidatePath('/categories');
  revalidatePath('/');
  return { ok: true, message: 'カテゴリを削除しました。' };
}
