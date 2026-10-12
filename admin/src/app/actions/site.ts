'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import type { ActionState } from './facilities';

/**
 * 運営者の情報と、規約類の掲載先。
 *
 * **管理者だけ。** 問い合わせ先を書き換えられると、利用者が別の宛先へ
 * 誘導される。編集者・調査員には渡さない。
 *
 * **文面は持たない。掲載先だけを持つ。**
 *   文面をこちらで抱えると、直すたびに配り直しになる。外に置いて
 *   いただき、アプリは指すだけ。
 */

/** https で始まる URL だけを通す。http は経路上で書き換えられうる。 */
const URL_PATTERN = /^https:\/\/[^\s]+$/;
/** メールアドレスの形。細かく見ない（見すぎると正しいものを弾く）。 */
const MAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveSiteSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };

  /*
    **「https://」の付け忘れは、こちらで補う。**

    ブラウザのアドレス欄から写すと、頭の「https://」が落ちることがある。
    そのたびに弾いていては、打ち直しになるだけで誰の得にもならない。
    形が URL らしければ、こちらで付ける。

    「http://」はそのままにしない。**この画面から出す先は、規約や
    連絡先といった読ませるための頁**で、鍵の掛かっていない経路では
    途中で書き換えられうる。付け替えて通すのではなく、理由を伝えて
    直していただく（相手の頁が https に対応しているとは限らないため、
    こちらの判断で差し替えない）。
  */
  const fixUrl = (raw: string): string => {
    const t = raw.trim();
    if (!t) return '';
    if (t.startsWith('http://') || t.startsWith('https://')) return t;
    return `https://${t}`;
  };

  const v = {
    operatorName: get('operator_name'),
    contactEmail: get('contact_email'),
    termsUrl: fixUrl(get('terms_url')),
    privacyUrl: fixUrl(get('privacy_url')),
    lawUrl: fixUrl(get('law_url')),
  };

  const errors: Record<string, string> = {};
  for (const [key, value] of [
    ['terms_url', v.termsUrl],
    ['privacy_url', v.privacyUrl],
    ['law_url', v.lawUrl],
  ] as const) {
    if (!value) continue;
    if (value.startsWith('http://')) {
      errors[key] = 'http:// ではなく https:// のURLをご指定ください';
    } else if (!URL_PATTERN.test(value)) {
      errors[key] = 'URLの形が正しくありません（例: https://example.com/terms）';
    }
  }
  if (v.contactEmail && !MAIL_PATTERN.test(v.contactEmail)) {
    errors.contact_email = 'メールアドレスの形が正しくありません（例: info@example.com）';
  }

  /*
    圏外で使える日数。全角の数字も受け付ける（日本語の入力のまま打たれる）。
    空欄は既定の30日に戻す。
  */
  const rawDays = get('offline_grace_days').replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
  const graceDays = rawDays === '' ? 30 : Number(rawDays);
  if (!Number.isInteger(graceDays) || graceDays < 1 || graceDays > 365) {
    errors.offline_grace_days = '1〜365 の整数でご指定ください';
  }

  /*
    翌月無料の人数と最低件数（2026-10-06）。空欄は既定（20名・3件）。
    変えたあとに締める月から効く（締めた月の判断は変わらない）。
  */
  const num = (k: string, fallback: number) => {
    const raw = get(k).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    return raw === '' ? fallback : Number(raw);
  };
  const topCount = num('free_top_count', 20);
  const minAccepted = num('free_min_accepted', 3);
  /* 試験提供の期間（2026-10-07）。欄に印があれば期間中 */
  const trialOpen = formData.get('trial_open') === 'on';

  /*
    チャットの気をつける言葉（2026-10-08）。1行に1つ（読点・カンマで区切ってもよい）。
    空の行と重なりは除く。多すぎる・長すぎるものは弾く（書き込みのたびに照らすため）。
  */
  const flagWords = [
    ...new Set(
      get('chat_flag_words')
        .split(/\r?\n|、|,/)
        .map((w) => w.trim())
        .filter(Boolean),
    ),
  ];
  if (flagWords.length > 200) {
    errors.chat_flag_words = '200 語までにしてください';
  } else if (flagWords.some((w) => w.length > 30)) {
    errors.chat_flag_words = '1語は30文字までにしてください';
  }
  if (!Number.isInteger(topCount) || topCount < 1 || topCount > 200) {
    errors.free_top_count = '1〜200 の整数でご指定ください';
  }
  if (!Number.isInteger(minAccepted) || minAccepted < 1 || minAccepted > 100) {
    errors.free_min_accepted = '1〜100 の整数でご指定ください';
  }

  /*
    **欄の下だけでなく、上にもまとめて出す。**

    欄が画面の外にあると、赤い文字に気づけない。保存を押したのに
    何も起きていないように見える。
  */
  if (Object.keys(errors).length > 0) {
    return { errors, message: '入力を確かめてください。赤い欄をご覧ください。' };
  }

  const admin = createAdminClient();
  /* 試験提供の期間を切り替えるかどうか（いまの値と比べる） */
  const { data: current } = await admin.from('site_settings').select('trial_open').eq('id', 1).maybeSingle();
  const trialBefore = (current as { trial_open?: boolean } | null)?.trial_open ?? true;
  const links = {
    // 空欄は null。空文字を入れると、アプリが「入っている」と見て空の行を出す。
    operator_name: v.operatorName || null,
    contact_email: v.contactEmail || null,
    terms_url: v.termsUrl || null,
    privacy_url: v.privacyUrl || null,
    law_url: v.lawUrl || null,
  };
  const { error } = await admin
    .from('site_settings')
    .update({
      ...links,
      offline_grace_days: graceDays,
      free_top_count: topCount,
      free_min_accepted: minAccepted,
    })
    .eq('id', 1);

  if (error) {
    /*
      **データベースを更新する前（列がまだ無い）。** 日数だけを外して保存し、
      ほかの項目は失わない。日数は既定の30日で動く。
    */
    if (/free_top_count|free_min_accepted/.test(error.message)) {
      /* 翌月無料の列がまだ無い（20261006000001_free_month.sql の前）。日数までは保存する */
      const retry = await admin
        .from('site_settings')
        .update({ ...links, offline_grace_days: graceDays })
        .eq('id', 1);
      if (retry.error) return { message: `保存できませんでした: ${retry.error.message}` };
      revalidatePath('/site');
      return {
        ok: true,
        message:
          '保存しました。ただし「翌月無料」の人数と件数は、データベースの更新（20261006000001_free_month.sql）の後から保存できます。それまでは20名・3件で動きます。',
      };
    }
    if (error.code === '42703' || /offline_grace_days/.test(error.message)) {
      const retry = await admin.from('site_settings').update(links).eq('id', 1);
      if (retry.error) return { message: `保存できませんでした: ${retry.error.message}` };
      revalidatePath('/site');
      return {
        ok: true,
        message:
          '保存しました。ただし「圏外で使える日数」は、データベースの更新（20260926000001_offline_grace.sql）の後から保存できます。それまでは30日で動きます。',
      };
    }
    return { message: `保存できませんでした: ${error.message}` };
  }

  /*
    気をつける言葉は別に保存する（列が無い＝データベースの更新前でも、ほかの
    項目の保存を失わないため）。
  */
  const words = await admin.from('site_settings').update({ chat_flag_words: flagWords }).eq('id', 1);

  /*
    試験提供の期間の切り替え（2026-10-12）。

    **職員の鍵で切り替える。** 外したときは、データベースが無料期間を過ぎている
    方に1か月の無料期間を付け、操作履歴に「何名に付けたか」を残す
    （20261012000001_trial_end_grant.sql）。職員の鍵なら、その履歴に「誰が外したか」も
    残る。鍵で切り替えられなかったとき（権限の誤りなど）は、service_role で切り替える
    （付ける処理は同じに効く。履歴の「操作した人」だけ空になる）。
  */
  let trialNote = '';
  if (trialOpen !== trialBefore) {
    const supabase = await createClient();
    const mine = await supabase.from('site_settings').update({ trial_open: trialOpen }).eq('id', 1).select('id');
    if (mine.error || !mine.data?.length) {
      const retry = await admin.from('site_settings').update({ trial_open: trialOpen }).eq('id', 1);
      if (retry.error) return { message: `保存できませんでした: ${retry.error.message}` };
    }
    if (!trialOpen) {
      const { data: log } = await admin
        .from('audit_logs')
        .select('diff')
        .eq('table_name', 'site_settings')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      const granted = (log?.diff as { trial_end_grant?: { members?: number } } | null)?.trial_end_grant?.members;
      trialNote =
        typeof granted === 'number'
          ? `試験提供を終えました。無料期間を過ぎていた ${granted} 名に、今日から1か月の無料期間を付けました（利用規約 第4条第7項）。`
          : '試験提供を終えました。';
    } else {
      trialNote = '試験提供の期間中に戻しました。';
    }
  }

  revalidatePath('/site');
  revalidatePath('/members');
  const saved = trialNote ? `保存しました。${trialNote}` : '保存しました';
  if (words.error) {
    return {
      ok: true,
      message: `${saved} ただし「チャットの気をつける言葉」は、データベースの更新（20261008000001_chat_review_and_retention.sql）の後から保存できます。`,
    };
  }
  return { ok: true, message: saved };
}
