'use server';

import { revalidatePath } from 'next/cache';

import { requireManager } from '@/lib/auth';
import { createAdminClient, createClient } from '@/lib/supabase/server';

/**
 * チャットの見張り（2026-10-05）。
 *
 * **非表示と通報の片付けは、ログイン中の職員の鍵で書く**（service_role ではない）。
 *   書けるのは管理者・編集者だけ、という決まりをデータベース（RLS）にも
 *   効かせ、操作履歴に「誰が非表示にしたか」を残すため。
 *
 * **書き込みの停止だけは service_role で書く。** 会員の名簿（driver_profiles）は
 * 職員の鍵では書き換えられない作りのため。誰がいつ止めたかは、ここで
 * 操作履歴に入れる（会員の入金の確認と同じ形）。
 */

function done() {
  revalidatePath('/chat');
  /* 左の柱の「未対応の通報」の数 */
  revalidatePath('/', 'layout');
}

/** 非表示にする／表示に戻す。非表示にしたら、その書き込みの通報も片付ける */
export async function hideChatMessage(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  const hide = formData.get('hide') === 'true';
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from('chat_messages')
    .update({ hidden_at: hide ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) return;
  if (hide) {
    await supabase.from('chat_reports').update({ state: 'done' }).eq('message_id', id).eq('state', 'open');
  }
  done();
}

/** 問題なしとして、その書き込みの通報を片付ける */
export async function resolveChatReports(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get('message_id') ?? '');
  if (!id) return;
  const supabase = await createClient();
  await supabase.from('chat_reports').update({ state: 'done' }).eq('message_id', id).eq('state', 'open');
  done();
}

/** 会員の書き込みを止める／止めるのをやめる（アプリは使えるまま） */
export async function setChatMuted(formData: FormData): Promise<void> {
  const me = await requireManager();
  const userId = String(formData.get('user_id') ?? '');
  const muted = formData.get('muted') === 'true';
  if (!userId) return;

  const admin = createAdminClient();
  const { data: before } = await admin
    .from('driver_profiles')
    .select('chat_muted')
    .eq('user_id', userId)
    .maybeSingle();
  const { error } = await admin.from('driver_profiles').update({ chat_muted: muted }).eq('user_id', userId);
  if (error) return;

  await admin.from('audit_logs').insert({
    actor_id: me.userId,
    action: 'update',
    table_name: 'driver_profiles',
    record_id: userId,
    diff: { chat_muted: { from: before?.chat_muted ?? false, to: muted } },
  });
  done();
}
