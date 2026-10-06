import { approvePurge, declinePurge, dismissNotice } from '@/app/actions/notices';
import { NoticeActions } from '@/components/notice-actions';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { getDictionary, getLocale } from '@/lib/i18n/server';
import { ensurePurgeRequest, fetchHandledNotices, fetchOpenNotices } from '@/lib/notices';

export const dynamic = 'force-dynamic';

/**
 * お知らせの一覧。
 *
 * **ヘッダーのベルを押すと、ここへ来る。**
 *   以前はベルの下に窓を開き、その中に「同意して消す」まで置いていた。
 *   狭い画面では窓が画面の外へはみ出し、文字が読めなかった
 *   （ご報告 2026-09-14）。加えて、戻せない操作を小さな浮き窓の中に
 *   置くのは良くない。**画面を分けた。**
 *   ベルに重ねたときは中身を覗けるだけにし、押すとここへ移る。
 *
 * **管理者だけ。**
 *   履歴の整理も会員のお支払いも、編集者・調査員が判断する立場にない。
 *
 * **対応が済んだものも並べる。**
 *   未対応が0件でも、何をどうしたかを後から辿れるようにする。
 */
export default async function NoticesPage() {
  await requireAdmin();
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const n = t.notices;

  await ensurePurgeRequest();
  const [open, handled] = await Promise.all([fetchOpenNotices(), fetchHandledNotices()]);

  const day = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'ja-JP', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'Asia/Tokyo',
        })
      : '—';

  const fill = (template: string, values: Record<string, string | number>) => {
    let out = template;
    for (const [k, v] of Object.entries(values)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };

  const planLabel = (plan?: keyof typeof n.planNames) => (plan ? n.planNames[plan] : '—');

  return (
    <div className="space-y-6">
      <PageHeader title={n.pageTitle} description={n.pageDescription} />

      <Card className="!p-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-text-muted">{n.openTitle}</h2>
          {(open ?? []).length > 0 && (
            <span className="text-xs text-text-faint">
              {fill(n.unread, { n: (open ?? []).length })}
            </span>
          )}
        </div>

        {!open || open.length === 0 ? (
          <div className="p-5">
            <EmptyState title={n.empty} />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {open.map((it) => (
              <li key={it.id} className="px-5 py-4">
                {it.kind === 'purge_request' ? (
                  <>
                    <p className="text-sm font-semibold text-text">{n.purgeTitle}</p>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">
                      {fill(n.purgeBody, { date: day(it.cutoff), count: it.count ?? 0 })}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-text-faint">{n.purgeNote}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-text">{n.paymentTitle}</p>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">
                      {fill(n.paymentBody, {
                        no: it.memberNo ?? '—',
                        plan: planLabel(it.plan),
                      })}
                    </p>
                  </>
                )}

                <NoticeActions
                  id={it.id}
                  kind={it.kind}
                  labels={{
                    purgeApprove: n.purgeApprove,
                    purgeDecline: n.purgeDecline,
                    paymentGo: n.paymentGo,
                    dismiss: n.dismiss,
                  }}
                  approve={approvePurge}
                  decline={declinePurge}
                  dismiss={dismissNotice}
                />

                <p className="mt-2 text-xs text-text-faint">{day(it.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="!p-0">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-text-muted">{n.doneTitle}</h2>
        </div>

        {handled.length === 0 ? (
          <p className="px-5 py-5 text-sm text-text-faint">{n.doneEmpty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {handled.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <Badge tone={it.state === 'done' ? 'accent' : 'default'}>
                  {it.state === 'done' ? n.stateDone : n.stateDismissed}
                </Badge>
                <span className="text-sm text-text">
                  {it.kind === 'purge_request' ? n.purgeTitle : n.paymentTitle}
                </span>
                <span className="text-xs text-text-muted">
                  {it.kind === 'purge_request'
                    ? it.removed !== undefined
                      ? fill(n.purgeRemoved, { n: it.removed })
                      : ''
                    : fill(n.paymentBody, {
                        no: it.memberNo ?? '—',
                        plan: planLabel(it.plan),
                      })}
                </span>
                <span className="ml-auto text-xs text-text-faint">
                  {fill(n.handledAt, { date: day(it.decidedAt ?? it.createdAt) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
