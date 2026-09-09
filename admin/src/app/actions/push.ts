'use server';

import { revalidatePath } from 'next/cache';
import webpush from 'web-push';

import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import type { ActionState } from './facilities';

/**
 * プッシュ通知の配信。
 *
 * **管理者だけ。** 全ドライバーの端末が鳴る操作で、取り消せない。
 * 編集者・調査員には渡さない。
 *
 * **鍵はここで作り、データベースへ置く**
 *   環境変数に置くと、両方の配布先へ設定を足して配り直すことになる。
 *   作った時点から使えるほうが手数が少ない。秘密鍵は列ごとの権限で
 *   会員に渡していない（supabase/migrations/20260909000003）。
 *
 * **届かなくなった宛先は、その場で片付ける**
 *   アプリを消した端末や、購読を切った端末は「もう無い」と返る。
 *   放っておくと、送るたびに同じ数だけ無駄に叩くことになる。
 */

/** 配信元の連絡先。決まりで required。届かないアドレスは使わない。 */
const DEFAULT_SUBJECT = 'mailto:osa603mu@yahoo.co.jp';

interface Settings {
  public_key: string | null;
  private_key: string | null;
  subject: string | null;
}

/** 鍵の組を作る。既にあれば作り直さない（購読が全部無効になるため）。 */
export async function createPushKeys(): Promise<ActionState> {
  await requireAdmin();

  const admin = createAdminClient();
  const { data: before } = await admin
    .from('push_settings')
    .select('public_key')
    .eq('id', 1)
    .maybeSingle();

  if (before?.public_key) {
    return { message: '鍵は既にあります。作り直すと、いまの購読がすべて無効になります。' };
  }

  const keys = webpush.generateVAPIDKeys();
  const { error } = await admin
    .from('push_settings')
    .update({
      public_key: keys.publicKey,
      private_key: keys.privateKey,
      subject: DEFAULT_SUBJECT,
    })
    .eq('id', 1);

  if (error) return { message: `作れませんでした: ${error.message}` };

  revalidatePath('/push');
  return { ok: true, message: '配信の鍵を作りました' };
}

/**
 * 知らせを送る。
 *
 * **宛先が0件でも成功にしない。** 送ったつもりで誰にも届いていない、
 * という状態を「成功」と出すと、次に本当に届かなくなったときに
 * 気づけない。
 */
export async function sendPush(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  const title = get('title');
  const body = get('body');
  const url = get('url') || '/notices';

  const errors: Record<string, string> = {};
  if (!title) errors.title = '件名を入力してください';
  else if (title.length > 40) errors.title = '40文字以内で入力してください';
  if (body.length > 120) errors.body = '120文字以内で入力してください';
  if (Object.keys(errors).length > 0) return { errors };

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from('push_settings')
    .select('public_key, private_key, subject')
    .eq('id', 1)
    .maybeSingle();

  const s = settings as Settings | null;
  if (!s?.public_key || !s?.private_key) {
    return { message: '先に配信の鍵を作ってください' };
  }

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');

  if (!subs || subs.length === 0) {
    return { message: '送る先がありません。通知を受け取る設定にした方がまだいません。' };
  }

  webpush.setVapidDetails(s.subject || DEFAULT_SUBJECT, s.public_key, s.private_key);
  const payload = JSON.stringify({ title, body, url, tag: 'kurumayose-notice' });

  let sent = 0;
  const gone: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
        sent++;
      } catch (e) {
        /*
          404 / 410 は「その宛先はもう無い」。片付ける。
          それ以外（電波・配信元の不調）は残す。次に届くかもしれない。
        */
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(sub.id);
      }
    }),
  );

  if (gone.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', gone);
  }

  revalidatePath('/push');

  if (sent === 0) {
    return { message: `どの端末にも届きませんでした（${gone.length} 件の宛先を片付けました）` };
  }
  return {
    ok: true,
    message:
      gone.length > 0
        ? `${sent} 台へ送りました（届かなくなった ${gone.length} 件は片付けました）`
        : `${sent} 台へ送りました`,
  };
}
