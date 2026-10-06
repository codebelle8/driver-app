import Link from 'next/link';

import { reviewSubmission } from '@/app/actions/submissions';
import { PageLink } from '@/components/page-link';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireManager } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import type { FreeGrant, FreeMonth, Submission, SubmissionStatus } from '@/lib/supabase/database.types';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** 1ページに出す件数。写真が並ぶので、会員の一覧と同じく抑える */
const PAGE_SIZE = 10;

/** 写真を見せる鍵の有効時間（秒）。開いたまま席を外しても、1時間で切れる */
const SIGNED_SECONDS = 3600;

const TABS: readonly SubmissionStatus[] = ['pending', 'accepted', 'rejected'];

/**
 * 情報提供の審査（2026-10-05）。
 *
 * **管理者と編集者が開ける。** 調査員は審査しない（発注元への提案 2026-10-05）。
 *
 * **審査待ちは古い順。** 先に届いたものから片付ける。採用・不採用の
 * 一覧は、新しく審査した順。
 *
 * **会員のメールアドレスは出さない。** 編集者も開く画面のため。誰からかは
 * 会員番号と表示名で分かる（会員の一覧は管理者だけが開ける）。
 *
 * **service_role で読む理由**
 *   写真は非公開の置き場所にあり、見せるには期限付きの鍵が要る。会員の
 *   表示名・会員番号も、職員の鍵では読めない（本人と管理者だけ）。
 *   書き込み（審査）は職員の鍵で行う（actions/submissions.ts）。
 */
export default async function SubmissionsPage({ searchParams }: PageProps<'/submissions'>) {
  await requireManager();
  const sp = await searchParams;
  const tab: SubmissionStatus = TABS.includes(sp.status as SubmissionStatus)
    ? (sp.status as SubmissionStatus)
    : 'pending';
  const page = Math.max(1, Number(sp.page) || 1);
  const t = await getDictionary();
  const s = t.submissions;
  const admin = createAdminClient();

  /* 区分ごとの件数（札に出す） */
  const counts = Object.fromEntries(
    await Promise.all(
      TABS.map(async (k) => {
        const { count } = await admin
          .from('submissions')
          .select('id', { count: 'exact', head: true })
          .eq('status', k);
        return [k, count ?? 0] as const;
      }),
    ),
  ) as Record<SubmissionStatus, number>;

  const total = counts[tab];
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = (Math.min(page, lastPage) - 1) * PAGE_SIZE;

  let query = admin.from('submissions').select('*').eq('status', tab);
  query =
    tab === 'pending'
      ? query.order('created_at', { ascending: true })
      : query.order('reviewed_at', { ascending: false });
  const { data } = await query.range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as Submission[];

  /* 施設・入口・会員の名前をまとめて引く */
  const facilityIds = [...new Set(rows.map((r) => r.facility_id).filter((v): v is string => !!v))];
  const entryIds = [...new Set(rows.map((r) => r.entry_point_id).filter((v): v is string => !!v))];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const photoPaths = rows.flatMap((r) => r.photo_paths);

  const [{ data: facilities }, { data: entries }, { data: members }, signed] = await Promise.all([
    facilityIds.length
      ? admin.from('facilities').select('id, name, code').in('id', facilityIds)
      : Promise.resolve({ data: [] as { id: string; name: string; code: string }[] }),
    entryIds.length
      ? admin.from('entry_points').select('id, code, name').in('id', entryIds)
      : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
    userIds.length
      ? admin.from('driver_profiles').select('user_id, member_no, display_name').in('user_id', userIds)
      : Promise.resolve({ data: [] as { user_id: string; member_no: number; display_name: string | null }[] }),
    photoPaths.length
      ? admin.storage.from('submissions').createSignedUrls(photoPaths, SIGNED_SECONDS)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
  ]);

  const facilityById = new Map((facilities ?? []).map((f) => [f.id, f]));
  const entryById = new Map((entries ?? []).map((e) => [e.id, e]));
  const memberById = new Map((members ?? []).map((m) => [m.user_id, m]));
  const urlByPath = new Map(
    (signed.data ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl]),
  );

  /*
    毎月の上位（翌月無料。2026-10-06）。新しい2か月分。表が無ければ（更新前）出さない。
  */
  const { data: monthRows, error: monthErr } = await admin
    .from('free_months')
    .select('*')
    .order('month', { ascending: false })
    .limit(2);
  const months = (monthRows ?? []) as FreeMonth[];
  const { data: grantRows } = months.length
    ? await admin.from('free_grants').select('*').in('month', months.map((m) => m.month)).order('rank')
    : { data: [] as FreeGrant[] };
  const grants = (grantRows ?? []) as FreeGrant[];
  const grantIds = [...new Set(grants.map((g) => g.user_id))];
  const { data: grantPeople } = grantIds.length
    ? await admin.from('driver_profiles').select('user_id, member_no, display_name').in('user_id', grantIds)
    : { data: [] as { user_id: string; member_no: number; display_name: string | null }[] };
  const person = new Map((grantPeople ?? []).map((p) => [p.user_id, p]));

  const when = (iso: string) =>
    new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' });
  const code = (n: number) => (n < 10000 ? String(n).padStart(4, '0') : String(n));
  const tabLabel = { pending: s.tabPending, accepted: s.tabAccepted, rejected: s.tabRejected };
  const href = (k: SubmissionStatus, p = 1) =>
    `/submissions${k === 'pending' && p === 1 ? '' : `?status=${k}${p > 1 ? `&page=${p}` : ''}`}`;

  return (
    <div className="space-y-6">
      <PageHeader title={s.title} description={s.description} />

      {/* 毎月の上位（翌月無料） */}
      {!monthErr && (
        <Card className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">{s.monthlyTitle}</h2>
            <p className="mt-0.5 text-xs text-text-faint">{s.monthlyHint}</p>
          </div>
          {months.length === 0 ? (
            <p className="text-sm text-text-muted">{s.monthlyNone}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {months.map((mo) => {
                const [y, mm] = mo.month.split('-');
                const next = (Number(mm) % 12) + 1;
                const list = grants.filter((g) => g.month === mo.month);
                return (
                  <div key={mo.month} className="space-y-1.5 rounded-lg border border-border p-3">
                    <p className="text-sm font-semibold">
                      {s.monthlyHead
                        .replace('{y}', y)
                        .replace('{m}', String(Number(mm)))
                        .replace('{n}', String(mo.winners))
                        .replace('{next}', String(next))}
                    </p>
                    <p className="text-xs text-text-faint">
                      {s.monthlyRule.replace('{top}', String(mo.top_count)).replace('{min}', String(mo.min_accepted))}
                    </p>
                    {list.length === 0 ? (
                      <p className="text-xs text-text-muted">{s.monthlyEmpty}</p>
                    ) : (
                      <ul className="space-y-0.5 text-sm">
                        {list.map((g) => {
                          const pp = person.get(g.user_id);
                          const name = pp
                            ? `${pp.display_name?.trim() || s.member.replace('{no}', code(pp.member_no))}（${code(pp.member_no)}）`
                            : s.memberGone;
                          return (
                            <li key={g.user_id} className="tabular">
                              {s.monthlyRow
                                .replace('{rank}', String(g.rank))
                                .replace('{name}', name)
                                .replace('{n}', String(g.accepted))}
                              {g.extended_paid && (
                                <span className="ml-2 text-xs text-text-faint">{s.monthlyExtended}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* 区分の切り替え */}
      <nav className="flex flex-wrap gap-2" aria-label={s.title}>
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
              {tabLabel[k]}
              <span className="tabular text-xs">{counts[k]}</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title={tab === 'pending' ? s.emptyPending : s.empty} />
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const facility = r.facility_id ? facilityById.get(r.facility_id) : undefined;
            const entry = r.entry_point_id ? entryById.get(r.entry_point_id) : undefined;
            const member = memberById.get(r.user_id);
            return (
              <Card key={r.id} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.kind === 'wrong_place' || r.kind === 'new_entry' ? 'warn' : 'accent'}>
                        {s.kinds[r.kind]}
                      </Badge>
                      {facility ? (
                        <Link
                          href={`/facilities/${facility.id}`}
                          title={s.openFacility}
                          className="font-semibold underline decoration-border underline-offset-2 hover:text-accent-ink"
                        >
                          {facility.name}
                        </Link>
                      ) : (
                        <span className="text-text-muted">{s.facilityGone}</span>
                      )}
                      <span className="text-sm text-text-muted">
                        {entry ? `${entry.code}　${entry.name}` : s.anyEntry}
                      </span>
                    </div>
                    <p className="text-xs text-text-faint">
                      {member
                        ? `${s.member.replace('{no}', code(member.member_no))}${member.display_name ? `（${member.display_name}）` : ''}`
                        : s.memberGone}
                      {'　'}
                      {s.sentAt.replace('{date}', when(r.created_at))}
                      {r.reviewed_at && `　${s.reviewedAt.replace('{date}', when(r.reviewed_at))}`}
                    </p>
                  </div>
                </div>

                <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>

                {r.photo_paths.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {r.photo_paths.map((p, i) => {
                      const url = urlByPath.get(p);
                      if (!url) return null;
                      return (
                        <a key={p} href={url} target="_blank" rel="noreferrer" className="block">
                          {/* 期限付きの鍵の URL。next/image の最適化を通すと鍵が切れる */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={s.photoAlt.replace('{n}', String(i + 1))}
                            className="h-28 w-28 rounded-lg border border-border object-cover"
                          />
                        </a>
                      );
                    })}
                  </div>
                )}

                <p className="text-sm">
                  {r.lat !== null && r.lng !== null ? (
                    <a
                      href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent-ink underline underline-offset-2"
                    >
                      {s.location}
                    </a>
                  ) : (
                    <span className="text-text-faint">{s.noLocation}</span>
                  )}
                </p>

                {/* 審査。覚え書きと一緒に送る */}
                <form action={reviewSubmission} className="space-y-2 border-t border-border pt-4">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="block text-xs text-text-muted" htmlFor={`note-${r.id}`}>
                    {s.note}
                  </label>
                  <textarea
                    id={`note-${r.id}`}
                    name="review_note"
                    defaultValue={r.review_note ?? ''}
                    maxLength={500}
                    rows={2}
                    placeholder={s.notePlaceholder}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    {r.status !== 'accepted' && (
                      <Button type="submit" name="status" value="accepted">
                        {s.accept}
                      </Button>
                    )}
                    {r.status !== 'rejected' && (
                      <Button type="submit" name="status" value="rejected" variant="secondary">
                        {s.reject}
                      </Button>
                    )}
                    {r.status !== 'pending' && (
                      <Button type="submit" name="status" value="pending" variant="ghost">
                        {s.reopen}
                      </Button>
                    )}
                    <Button type="submit" variant="ghost">
                      {s.saveNote}
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
