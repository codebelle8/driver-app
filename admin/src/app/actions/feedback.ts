'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth';
import type { FeedbackStatus } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

/**
 * ご意見（ご意見箱。2026-11-02）の状態の切り替えと覚え書き。
 *
 * **管理者だけ。** アプリそのものへの声で、どう応えるかを決めるのは運営。
 * 施設の情報を扱う編集者・調査員の持ち場ではない。
 *
 * **ログイン中の管理者の鍵で書く**（情報提供の審査と同じ）。書けるのは管理者
 * だけ、という決まりをデータベース（RLS）にも効かせ、操作履歴に誰が変えたかを残す。
 * 変えた日時と人は、データベースが入れる。
 */

const STATUSES: readonly FeedbackStatus[] = ['new', 'considering', 'done', 'declined'];

/** 覚え書きの上限（データベースの制約と同じ） */
const NOTE_MAX = 500;

export async function handleFeedback(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '') as FeedbackStatus;
  const noteRaw = formData.get('staff_note');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const patch: { status?: FeedbackStatus; staff_note?: string | null } = {};
  if (STATUSES.includes(status)) patch.status = status;
  /* 覚え書きの欄が送られてきたときだけ書く（空なら消す） */
  if (noteRaw !== null) {
    const note = String(noteRaw).trim().slice(0, NOTE_MAX);
    patch.staff_note = note.length > 0 ? note : null;
  }
  if (Object.keys(patch).length === 0) return;

  const supabase = await createClient();
  await supabase.from('feedback').update(patch).eq('id', id);

  revalidatePath('/feedback');
  /* 左の柱の「未対応」の数 */
  revalidatePath('/', 'layout');
}
