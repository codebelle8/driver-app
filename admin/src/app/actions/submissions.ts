'use server';

import { revalidatePath } from 'next/cache';

import { requireManager } from '@/lib/auth';
import type { SubmissionStatus } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

/**
 * 情報提供の審査（採用・不採用・審査待ちに戻す）と覚え書き。
 *
 * **ログイン中の職員の鍵で書く**（service_role ではない）。
 *   * 書けるのは管理者・編集者だけ、という決まりをデータベース（RLS）にも
 *     効かせるため
 *   * 操作履歴に「誰が審査したか」を残すため。service_role で書くと、
 *     操作した人が空になる
 *
 * 審査した日時と人は、データベースが入れる（画面からは渡さない）。
 */

const STATUSES: readonly SubmissionStatus[] = ['pending', 'accepted', 'rejected'];

/** 覚え書きの上限（データベースの制約と同じ） */
const NOTE_MAX = 500;

export async function reviewSubmission(formData: FormData): Promise<void> {
  await requireManager();

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '') as SubmissionStatus;
  const noteRaw = formData.get('review_note');
  if (!id) return;

  const patch: { status?: SubmissionStatus; review_note?: string | null } = {};
  if (STATUSES.includes(status)) patch.status = status;
  /* 覚え書きの欄が送られてきたときだけ書く（空なら消す） */
  if (noteRaw !== null) {
    const note = String(noteRaw).trim().slice(0, NOTE_MAX);
    patch.review_note = note.length > 0 ? note : null;
  }
  if (Object.keys(patch).length === 0) return;

  const supabase = await createClient();
  await supabase.from('submissions').update(patch).eq('id', id);

  revalidatePath('/submissions');
  /* 左の柱の「審査待ち」の数 */
  revalidatePath('/', 'layout');
}
