import Link from 'next/link';

import { hideChatMessage, resolveChatReports, setChatMuted } from '@/app/actions/chat';
import { LiveRefresh } from '@/components/live-refresh';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireManager } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import type { ChatMessage, ChatReport } from '@/lib/supabase/database.types';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** すべての書き込みの一覧に出す件数（新しい順） */
const RECENT = 50;

/**
 * チャットの見張り（2026-10-05）。管理者と編集者が開ける。
 *
 *   通報（未対応） … 通報のあった書き込みを、書き込みごとにまとめて古い順に
 *   すべての書き込み … 新しい順に50件（非表示にしたものも出す）
 *
 * **誰が通報したかは出さない。** 件数と理由だけ。通報した会員が分かると、
 * 職員を通じて伝わる恐れがある。
 *
 * service_role で読む（会員の表示名・会員番号、非表示の書き込みを読むため）。
 * 書き込み（非表示・片付け）は職員の鍵で行う（actions/chat.ts）。
 */
export default async function ChatAdminPage({ searchParams }: PageProps<'/chat'>) {
  await requireManager();
  const sp = await searchParams;
  const tab = sp.tab === 'all' ? 'all' : 'reports';
  const t = await getDictionary();
  const s = t.chatAdmin;
  const admin = createAdminClient();

  const { data: openReports } = await admin
    .from('chat_reports')
    .select('*')
    .eq('state', 'open')
    .order('created_at', { ascending: true });
  const reports = (openReports ?? []) as ChatReport[];
  const reportsByMessage = new Map<string, ChatReport[]>();
  for (const r of reports) reportsByMessage.set(r.message_id, [...(reportsByMessage.get(r.message_id) ?? []), r]);

  let messages: ChatMessage[] = [];
  if (tab === 'reports') {
    const ids = [...reportsByMessage.keys()];
    if (ids.length) {
      const { data } = await admin.from('chat_messages').select('*').in('id', ids);
      const byId = new Map(((data ?? []) as ChatMessage[]).map((m) => [m.id, m]));
      messages = ids.map((id) => byId.get(id)).filter((m): m is ChatMessage => !!m);
    }
  } else {
    const { data } = await admin
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(RECENT);
    messages = (data ?? []) as ChatMessage[];
  }

  const userIds = [...new Set(messages.map((m) => m.user_id))];
  const { data: profiles } = userIds.length
    ? await admin
        .from('driver_profiles')
        .select('user_id, member_no, display_name, chat_muted')
        .in('user_id', userIds)
    : { data: [] as { user_id: string; member_no: number; display_name: string | null; chat_muted?: boolean }[] };
  const who = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  const when = (iso: string) =>
    new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' });
  const code = (n: number) => (n < 10000 ? String(n).padStart(4, '0') : String(n));

  return (
    <div className="space-y-6">
      <PageHeader title={s.title} description={s.description} />
      {/* 新しい書き込み・通報を、読み直さなくても出す（2026-10-08） */}
      <LiveRefresh table="chat_messages" />

      <nav className="flex flex-wrap gap-2" aria-label={s.title}>
        {(
          [
            ['reports', s.tabReports, reportsByMessage.size],
            ['all', s.tabAll, null],
          ] as const
        ).map(([k, label, n]) => {
          const on = k === tab;
          return (
            <Link
              key={k}
              href={k === 'reports' ? '/chat' : '/chat?tab=all'}
              prefetch
              aria-current={on ? 'page' : undefined}
              className={
                'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ' +
                (on
                  ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
                  : 'border-border text-text-muted hover:border-border-strong hover:text-text')
              }
            >
              {label}
              {n !== null && <span className="tabular text-xs">{n}</span>}
            </Link>
          );
        })}
      </nav>

      {messages.length === 0 ? (
        <Card>
          <EmptyState title={tab === 'reports' ? s.noReports : s.noMessages} />
        </Card>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => {
            const p = who.get(m.user_id);
            const reps = reportsByMessage.get(m.id) ?? [];
            const reasons = reps.map((r) => r.reason).filter((x): x is string => !!x);
            return (
              <Card key={m.id} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-faint">
                  <span className="font-semibold text-text">
                    {p ? (p.display_name?.trim() || s.noName) : s.memberGone}
                  </span>
                  {p && <span>{s.member.replace('{no}', code(p.member_no))}</span>}
                  <span>{s.postedAt.replace('{date}', when(m.created_at))}</span>
                  {m.hidden_at && <Badge tone="warn">{s.hidden}</Badge>}
                  {p?.chat_muted && <Badge tone="warn">{s.muted}</Badge>}
                  {reps.length > 0 && <Badge tone="warn">{s.reportCount.replace('{n}', String(reps.length))}</Badge>}
                </div>
                <p className={`whitespace-pre-wrap text-sm leading-relaxed ${m.hidden_at ? 'text-text-faint line-through' : ''}`}>
                  {m.body}
                </p>
                {reasons.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-text-muted">
                    {reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <form action={hideChatMessage}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="hide" value={m.hidden_at ? 'false' : 'true'} />
                    <Button type="submit" variant={m.hidden_at ? 'ghost' : 'primary'}>
                      {m.hidden_at ? s.unhide : s.hide}
                    </Button>
                  </form>
                  {reps.length > 0 && !m.hidden_at && (
                    <form action={resolveChatReports}>
                      <input type="hidden" name="message_id" value={m.id} />
                      <Button type="submit" variant="secondary">
                        {s.resolve}
                      </Button>
                    </form>
                  )}
                  {p && (
                    <form action={setChatMuted}>
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <input type="hidden" name="muted" value={p.chat_muted ? 'false' : 'true'} />
                      <Button type="submit" variant="ghost">
                        {p.chat_muted ? s.unmute : s.mute}
                      </Button>
                    </form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
