import { saveSiteSettings } from '@/app/actions/site';
import { SiteSettingsForm } from '@/components/site-settings-form';
import { Alert, PageHeader } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * サイト設定。
 *
 * **管理者だけが開ける。** 問い合わせ先を書き換えられると、利用者が
 * 別の宛先へ誘導される。
 *
 * ここで入れたものが、アプリのマイページ「このアプリについて」に出る。
 */
export default async function SitePage() {
  await requireAdmin();
  const t = await getDictionary();
  const s = t.site;

  const admin = createAdminClient();
  const { data } = await admin.from('site_settings').select('*').eq('id', 1).maybeSingle();

  return (
    <div className="space-y-6">
      <PageHeader title={s.title} description={s.description} />

      {/*
        なぜ要るのかを、ここに書いておく。

        「入れてください」だけでは後回しになる。放っておくと、
        お金を受け取り始めてから足りないことに気づく。
      */}
      <Alert tone="warn" title={s.whyTitle}>
        <p className="leading-relaxed">{s.whyBody}</p>
      </Alert>

      <SiteSettingsForm
        action={saveSiteSettings}
        t={t}
        initial={{
          operator_name: data?.operator_name ?? null,
          contact_email: data?.contact_email ?? null,
          terms_url: data?.terms_url ?? null,
          privacy_url: data?.privacy_url ?? null,
          law_url: data?.law_url ?? null,
          /* データベースを更新する前は列が無い。既定の30日を出しておく */
          offline_grace_days: (data as { offline_grace_days?: number } | null)?.offline_grace_days ?? 30,
          /* 翌月無料（2026-10-06）。更新前は列が無いので既定を出す */
          free_top_count: (data as { free_top_count?: number } | null)?.free_top_count ?? 20,
          free_min_accepted: (data as { free_min_accepted?: number } | null)?.free_min_accepted ?? 3,
          /* 試験提供の期間（2026-10-07）。更新前は列が無い。いまは期間中なので入っている扱い */
          trial_open: (data as { trial_open?: boolean } | null)?.trial_open ?? true,
          /* チャットの気をつける言葉（2026-10-08）。更新前は列が無いので空 */
          chat_flag_words: (data as { chat_flag_words?: string[] } | null)?.chat_flag_words ?? [],
        }}
      />
    </div>
  );
}
