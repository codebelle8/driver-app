import { createPushKeys, sendPush } from '@/app/actions/push';
import { PushForm } from '@/components/push-form';
import { Alert, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * プッシュ通知の配信。
 *
 * **管理者だけが開ける。** 押せば全ドライバーの端末が鳴る。
 *
 * **鍵を作るのは一度だけ**
 *   作り直すと、いま受け取っている端末の購読がすべて無効になる。
 *   既にあるときは作り直させない。
 *
 * **誰に届くかを先に出す**
 *   受け取る設定にしている端末の数を、送る欄の上に出す。
 *   0台のまま送っても何も起きない。押す前に分かるようにする。
 */
export default async function PushPage() {
  await requireAdmin();
  const t = await getDictionary();
  const p = t.push;

  const admin = createAdminClient();

  const { data: settings } = await admin
    .from('push_settings')
    .select('public_key, subject')
    .eq('id', 1)
    .maybeSingle();

  const { count } = await admin
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true });

  const ready = Boolean(settings?.public_key);
  const targets = count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title={p.title} description={p.description} />

      {!ready ? (
        <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-text-muted">{p.keysTitle}</h2>
          <Alert tone="info">{p.keysBody}</Alert>
          {/*
            form の action は値を返さない約束になっている。
            結果は revalidate 後の画面（鍵の有無）で分かる。
          */}
          <form
            action={async () => {
              'use server';
              await createPushKeys();
            }}
          >
            <Button type="submit">{p.keysMake}</Button>
          </form>
        </Card>
      ) : (
        <>
          <Card className="space-y-2">
            <h2 className="text-sm font-semibold text-text-muted">{p.keysTitle}</h2>
            <p className="text-sm text-text">{p.keysReady}</p>
            {/*
              作り直させない。作り直すと、いま受け取っている端末の
              購読がすべて無効になる。
            */}
            <p className="text-xs text-text-faint">{p.keysWarn}</p>
          </Card>

          <PushForm action={sendPush} t={t} targets={targets} />
        </>
      )}

      <Card className="!p-0">
        <h2 className="border-b border-border px-5 py-3 text-sm font-semibold text-text-muted">
          {p.targetsTitle}
        </h2>
        <div className="p-5">
          {targets === 0 ? (
            <EmptyState title={p.noTargets} description={p.noTargetsBody} />
          ) : (
            <p className="text-sm text-text">{p.targetsCount.replace('{n}', String(targets))}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
