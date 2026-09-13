'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth';
import { purgeCutoff } from '@/lib/notices';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * お知らせへの返事。
 *
 * **管理者だけ。** 履歴の整理は戻せない操作で、編集者・調査員が
 * 判断する立場にない。会員のお支払いも同じ。
 */

/** 押された知らせの id を取り出す。 */
function noticeId(formData: FormData): number {
  const raw = formData.get('id');
  const id = Number(typeof raw === 'string' ? raw : '');
  if (!Number.isFinite(id) || id <= 0) throw new Error('お知らせが指定されていません');
  return id;
}

/**
 * 操作履歴の整理に同意した。
 *
 * **ここで初めて消える。** お伺いの知らせを作る側（ensurePurgeRequest）は
 * 一切消さない。
 *
 * **数え直してから消す。**
 *   お伺いを作った時点の件数は、その後の操作で増えている。知らせに
 *   書いてある数をそのまま記録すると、実際に消した数と食い違う。
 *
 * **消した事実は残す。**
 *   整理そのものも操作のひとつ。消したあとに1行書き足す。この行は
 *   半年より新しいので、次の整理まで残る。「いつ、誰が、何件消したか」が
 *   辿れないと、記録が減っていることの説明が付かない。
 */
export async function approvePurge(formData: FormData): Promise<void> {
  const staff = await requireAdmin();
  const id = noticeId(formData);
  const admin = createAdminClient();

  const { data: notice } = await admin
    .from('admin_notices')
    .select('*')
    .eq('id', id)
    .eq('kind', 'purge_request')
    .eq('state', 'open')
    .maybeSingle();

  // すでに誰かが返事をしている。二重に消さない。
  if (!notice) {
    revalidatePath('/history');
    return;
  }

  const detail = (notice.detail ?? {}) as Record<string, unknown>;
  const cutoff =
    typeof detail.cutoff === 'string' ? detail.cutoff : purgeCutoff().toISOString();

  /*
    件数だけを受け取る。

    .select('id') にすると消した行の id が全部返る。半年ぶんが数万行に
    なると、その配列をそのまま受け取ることになる。数えたいだけなので
    count で受ける。
  */
  const { count: removed } = await admin
    .from('audit_logs')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);

  const gone = removed ?? 0;

  await admin
    .from('admin_notices')
    .update({
      state: 'done',
      decided_at: new Date().toISOString(),
      decided_by: staff.userId,
      detail: { ...detail, removed: gone },
    })
    .eq('id', id);

  await admin.from('audit_logs').insert({
    actor_id: staff.userId,
    action: 'delete',
    table_name: 'audit_logs',
    diff: { purged: gone, older_than: cutoff },
  });

  revalidatePath('/history');
  revalidatePath('/', 'layout');
}

/**
 * 今回は整理しない。
 *
 * 記録はそのまま残る。次のお伺いは半年後になる。
 */
export async function declinePurge(formData: FormData): Promise<void> {
  const staff = await requireAdmin();
  const id = noticeId(formData);
  const admin = createAdminClient();

  await admin
    .from('admin_notices')
    .update({
      state: 'dismissed',
      decided_at: new Date().toISOString(),
      decided_by: staff.userId,
    })
    .eq('id', id)
    .eq('state', 'open');

  revalidatePath('/', 'layout');
}

/**
 * 知らせを取り下げる。
 *
 * お支払いの報告に使う。入金が確かめられない、行き違いだった、
 * といった場合に窓から外す。会員の状態は変えない。
 * （入金を確認したときは、会員の画面で「入金を確認した」を押す。
 *   そちらが押されれば、この知らせは自動で片付く。）
 */
export async function dismissNotice(formData: FormData): Promise<void> {
  const staff = await requireAdmin();
  const id = noticeId(formData);
  const admin = createAdminClient();

  await admin
    .from('admin_notices')
    .update({
      state: 'dismissed',
      decided_at: new Date().toISOString(),
      decided_by: staff.userId,
    })
    .eq('id', id)
    .eq('state', 'open');

  revalidatePath('/', 'layout');
}
