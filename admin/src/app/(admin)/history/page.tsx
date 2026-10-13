import Link from 'next/link';

import { PageLink } from '@/components/page-link';

import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { getDictionary, getLocale } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import type { AuditLog } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

/** 1ページに出す件数。施設一覧・カテゴリ一覧と揃える。 */
const PAGE_SIZE = 15;

/**
 * 記録から「どれのことか」を1行で示す。
 *
 * 識別子 (UUID) を並べても人には読めないため、記録した内容の中から
 * 名前にあたる値を拾う。追加・削除は行全体が入っているのでそこから、
 * 変更は変わった列しか入っていないので、無ければ件数で代替する。
 */
function describe(log: AuditLog): string {
  const diff = log.diff as Record<string, unknown> | null;
  if (!diff) return '—';

  const pick = (key: string): string | null => {
    const value = diff[key];
    if (typeof value === 'string') return value;
    // 変更の記録は { before, after } の形で入っている
    if (value && typeof value === 'object' && 'after' in value) {
      const after = (value as { after: unknown }).after;
      if (typeof after === 'string') return after;
    }
    return null;
  };

  return pick('name') ?? pick('display_name') ?? pick('body') ?? pick('caption') ?? '—';
}

/** 「内容」に出す長さの上限（文字数）。超えた分は「…」で略す */
const SUMMARY_MAX = 30;

/**
 * 長い文を「…」で略す（ご指摘 2026-10-13「細かいところまで全部は要らない」）。
 *
 * 写真の説明などは1文が長く、表の幅を取って、ほかの列（「変更」など）が
 * 縦に折れていた。上限の手前に「、」「。」があれば、そこで切って読みやすくする。
 * 全文は、文字にマウスを重ねると出る。
 */
function abbreviate(text: string): string {
  const line = text.split(/\r?\n/)[0].trim();
  const chars = Array.from(line);
  if (chars.length <= SUMMARY_MAX && line === text.trim()) return line;
  const head = chars.slice(0, SUMMARY_MAX).join('');
  const cut = Math.max(head.lastIndexOf('、'), head.lastIndexOf('。'), head.lastIndexOf('，'));
  const short = cut >= SUMMARY_MAX / 2 ? head.slice(0, cut) : head;
  return `${short}…`;
}

/** 変更の場合、どの項目が変わったかを列挙する */
function changedKeys(log: AuditLog): string[] {
  const diff = log.diff as Record<string, unknown> | null;
  if (!diff || log.action === 'insert' || log.action === 'delete') return [];
  return Object.keys(diff);
}

export default async function HistoryPage({ searchParams }: PageProps<'/history'>) {
  await requireAdmin();
  const [params, t, locale] = await Promise.all([
    searchParams,
    getDictionary(),
    getLocale(),
  ]);
  const page = Math.max(1, Number(params.page) || 1);
  const h = t.audit;

  const supabase = await createClient();

  const from = (page - 1) * PAGE_SIZE;
  const { data: logs, count } = await supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: profiles } = await supabase
    .from('admin_profiles')
    .select('user_id, display_name');

  const nameById = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name]));

  // 日時の並びも言語に合わせる（英語では日/月の順になる）
  // **日本時間で出す**（2026-10-07）。指定しないと、表示を組み立てるサーバー
  // （Vercel）の時刻＝協定世界時になり、9時間ずれていた。
  const formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });

  return (
    <div className="space-y-6">
      <PageHeader title={h.title} description={h.description} />

      <Card className="!p-0">
        {(logs ?? []).length === 0 ? (
          <div className="p-5">
            <EmptyState title={h.empty} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="whitespace-nowrap border-b border-border text-left text-xs text-text-muted">
                  <th className="px-5 py-3 font-medium">{h.colWhen}</th>
                  <th className="px-5 py-3 font-medium">{h.colWho}</th>
                  <th className="px-5 py-3 font-medium">{h.colWhat}</th>
                  <th className="px-5 py-3 font-medium">{h.colAction}</th>
                  <th className="px-5 py-3 font-medium">{h.colDetail}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(logs ?? []).map((log) => {
                  const keys = changedKeys(log);
                  const summary = describe(log);
                  return (
                    <tr key={log.id}>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-text-muted">
                        {formatter.format(new Date(log.created_at))}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        {log.actor_id
                          ? (nameById.get(log.actor_id) ?? h.unknownUser)
                          : h.unknownUser}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-text-muted">
                        {t.auditTable[log.table_name as keyof typeof t.auditTable] ?? log.table_name}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <Badge tone={log.action === 'publish' ? 'accent' : undefined}>
                          {t.auditAction[log.action as keyof typeof t.auditAction] ?? log.action}
                        </Badge>
                      </td>
                      {/* 名前が無い変更は「—」を出さず、件数だけにする */}
                      <td className="whitespace-nowrap px-5 py-3">
                        {(summary !== '—' || keys.length === 0) && (
                          <span className="font-medium" title={summary !== '—' ? summary : undefined}>
                            {summary === '—' ? summary : abbreviate(summary)}
                          </span>
                        )}
                        {keys.length > 0 && (
                          <span className={`text-xs text-text-muted${summary !== '—' ? ' ml-2' : ''}`}>
                            {keys.length} {h.changedFields}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {lastPage > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label={t.common.pagination}>
          <PageLink href={page > 2 ? `/history?page=${page - 1}` : '/history'} disabled={page <= 1}>
            {t.common.prev}
          </PageLink>
          <span className="tabular px-3 text-sm text-text-muted">
            {page} / {lastPage}
          </span>
          <PageLink href={`/history?page=${page + 1}`} disabled={page >= lastPage}>
            {t.common.next}
          </PageLink>
        </nav>
      )}

      <Card>
        <p className="text-sm leading-relaxed text-text-muted">{h.note}</p>
      </Card>
    </div>
  );
}

