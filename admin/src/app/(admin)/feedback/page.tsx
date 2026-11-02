import Link from 'next/link';

import { handleFeedback } from '@/app/actions/feedback';
import { PageLink } from '@/components/page-link';
import { Alert, Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import type { Feedback, FeedbackStatus } from '@/lib/supabase/database.types';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** 1ページに出す件数 */
const PAGE_SIZE = 10;

const TABS: readonly FeedbackStatus[] = ['new', 'considering', 'done', 'declined'];

/**
 * ご意見（ご意見箱。2026-11-02）。
 *
 * 会員がアプリの「探す」画面の右下の絵から送った、アプリへのご意見・ご要望。
 *
 * **管理者だけが開ける。** アプリへの声にどう応えるかは運営が決める。
 * 会員のメールアドレスも出す（会員の一覧と同じく、管理者だけが見る画面のため）。
 *
 * **未対応は古い順。** 先に届いたものから読む。ほかの区分は、新しく
 * 切り替えた順。
 *
 * **表がまだ無いとき**（データベースを更新する前）は、その旨だけを出す。
 */
export default async function FeedbackPage({ searchParams }: PageProps<'/feedback'>) {
  await requireAdmin();
  const sp = await searchParams;
  const tab: FeedbackStatus = TABS.includes(sp.status as FeedbackStatus) ? (sp.status as FeedbackStatus) : 'new';
  const page = Math.max(1, Number(sp.page) || 1);
  const t = await getDictionary();
  const f = t.feedback;
  const admin = createAdminClient();

  /* 区分ごとの件数（札に出す）。表が無ければ、ここで分かる */
  const countRows = await Promise.all(
    TABS.map(async (k) => {
      const { count, error } = await admin
        .from('feedback')
        .select('id', { count: 'exact', head: true })
        .eq('status', k);
      return [k, count ?? 0, error] as const;
    }),
  );
  if (countRows.some(([, , error]) => error)) {
    return (
      <div className="space-y-6">
        <PageHeader title={f.title} description={f.description} />
        <Alert tone="warn">{f.missing}</Alert>
      </div>
    );
  }
  const counts = Object.fromEntries(countRows.map(([k, n]) => [k, n])) as Record<FeedbackStatus, number>;

  const total = counts[tab];
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = (Math.min(page, lastPage) - 1) * PAGE_SIZE;

  let query = admin.from('feedback').select('*').eq('status', tab);
  query =
    tab === 'new'
      ? query.order('created_at', { ascending: true })
      : query.order('handled_at', { ascending: false });
  const { data } = await query.range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as Feedback[];

  /* 会員の番号・表示名・メールアドレス */
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const [{ data: members }, { data: authUsers }] = await Promise.all([
    userIds.length
      ? admin.from('driver_profiles').select('user_id, member_no, display_name').in('user_id', userIds)
      : Promise.resolve({ data: [] as { user_id: string; member_no: number; display_name: string | null }[] }),
    userIds.length
      ? admin.auth.admin.listUsers({ perPage: 200 })
      : Promise.resolve({ data: { users: [] as { id: string; email?: string }[] } }),
  ]);
  const memberById = new Map((members ?? []).map((m) => [m.user_id, m]));
  const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const when = (iso: string) =>
    new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' });
  const code = (n: number) => (n < 10000 ? String(n).padStart(4, '0') : String(n));
  const href = (k: FeedbackStatus, p = 1) =>
    `/feedback${k === 'new' && p === 1 ? '' : `?status=${k}${p > 1 ? `&page=${p}` : ''}`}`;

  return (
    <div className="space-y-6">
      <PageHeader title={f.title} description={f.description} />

      {/* 区分の切り替え */}
      <nav className="flex flex-wrap gap-2" aria-label={f.title}>
        {TABS.map((k) => {
          const on = k === tab;
          return (
            <Link
              key={k}
              href={href(k)}
              prefetch
              aria-current={on ? 'page' : undefined}
              className={
                'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ' +
                (on
                  ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
                  : 'border-border text-text-muted hover:border-border-strong hover:text-text')
              }
            >
              {f.tabs[k]}
              <span className="tabular text-xs">{counts[k]}</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title={tab === 'new' ? f.emptyNew : f.empty} />
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const member = memberById.get(r.user_id);
            const email = emailById.get(r.user_id);
            return (
              <Card key={r.id} className="space-y-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.kind === 'trouble' ? 'warn' : 'accent'}>{f.kinds[r.kind]}</Badge>
                    <span className="text-sm font-semibold">
                      {member
                        ? `${f.member.replace('{no}', code(member.member_no))}${member.display_name ? `（${member.display_name}）` : ''}`
                        : f.memberGone}
                    </span>
                    {email && (
                      <a
                        href={`mailto:${email}`}
                        className="text-sm text-text-muted underline decoration-border underline-offset-2 hover:text-text"
                      >
                        {email}
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-text-faint">
                    {f.sentAt.replace('{date}', when(r.created_at))}
                    {r.handled_at && `　${f.handledAt.replace('{date}', when(r.handled_at))}`}
                  </p>
                </div>

                <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>

                {/* 状態の切り替え。覚え書きと一緒に送る */}
                <form action={handleFeedback} className="space-y-2 border-t border-border pt-4">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="block text-xs text-text-muted" htmlFor={`note-${r.id}`}>
                    {f.note}
                  </label>
                  <textarea
                    id={`note-${r.id}`}
                    name="staff_note"
                    defaultValue={r.staff_note ?? ''}
                    maxLength={500}
                    rows={2}
                    placeholder={f.notePlaceholder}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    {r.status !== 'considering' && (
                      <Button type="submit" name="status" value="considering" variant="secondary">
                        {f.toConsidering}
                      </Button>
                    )}
                    {r.status !== 'done' && (
                      <Button type="submit" name="status" value="done">
                        {f.toDone}
                      </Button>
                    )}
                    {r.status !== 'declined' && (
                      <Button type="submit" name="status" value="declined" variant="secondary">
                        {f.toDeclined}
                      </Button>
                    )}
                    {r.status !== 'new' && (
                      <Button type="submit" name="status" value="new" variant="ghost">
                        {f.reopen}
                      </Button>
                    )}
                    <Button type="submit" variant="ghost">
                      {f.saveNote}
                    </Button>
                  </div>
                </form>
              </Card>
            );
          })}
        </div>
      )}

      {lastPage > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label={t.common.pagination}>
          <PageLink href={href(tab, page - 1)} disabled={page <= 1}>
            {t.common.prev}
          </PageLink>
          <span className="tabular px-3 text-sm text-text-muted">
            {Math.min(page, lastPage)} / {lastPage}
          </span>
          <PageLink href={href(tab, page + 1)} disabled={page >= lastPage}>
            {t.common.next}
          </PageLink>
        </nav>
      )}
    </div>
  );
}
