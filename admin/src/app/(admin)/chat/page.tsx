import Link from 'next/link';

import {
  clearChatFlag,
  hideChatMessage,
  markChatChecked,
  resolveChatReports,
  setChatMuted,
} from '@/app/actions/chat';
import { LiveRefresh } from '@/components/live-refresh';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireManager } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import type { ChatFlag, ChatMessage, ChatReport } from '@/lib/supabase/database.types';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** すべての書き込みの一覧に出す件数（新しい順） */
const RECENT = 50;

/** 要確認・未確認で一度に出す件数（古い順）。残りは、片付けると次が出る */
const BATCH = 100;

/** 添えられた画像の期限つき URL の長さ（秒）。画像は非公開の置き場所にある */
const SIGNED_SECONDS = 3600;

type Tab = 'reports' | 'flags' | 'new' | 'all';

/**
 * チャットの見張り（2026-10-05）。管理者と編集者が開ける。
 *
 *   通報（未対応）       … 通報のあった書き込みを、書き込みごとにまとめて古い順に
 *   要確認（自動の旗）   … 電話番号・メールアドレス・URL・車の番号らしきもの・
 *                          気をつける言葉を含む書き込み（2026-10-08）。古い順に
 *   未確認               … 「ここまで確認した」より新しい書き込み（2026-10-08）。
 *                          古い順に読み、読み終えたら「ここまで確認した」を押す
 *   すべての書き込み     … 新しい順に50件（非表示にしたものも出す）
 *
 * **会員が増えても、見るのは「新しく来た分」と「旗の立った分」だけで済む**
 * ようにした（ご指示 2026-10-08）。「ここまで確認した」の印は職員で共有する。
 *
 * **誰が通報したかは出さない。** 件数と理由だけ。通報した会員が分かると、
 * 職員を通じて伝わる恐れがある。
 *
 * service_role で読む（会員の表示名・会員番号、非表示の書き込みを読むため）。
 * 書き込み（非表示・片付け・旗を下ろす・確認した）は職員の鍵で行う（actions/chat.ts）。
 */
export default async function ChatAdminPage({ searchParams }: PageProps<'/chat'>) {
  await requireManager();
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'all' ? 'all' : sp.tab === 'flags' ? 'flags' : sp.tab === 'new' ? 'new' : 'reports';
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

  /*
    要確認（旗が立っていて、下ろしておらず、隠してもいない）と、未確認（印より新しく、
    隠していない）。データベースを更新する前（列や表が無い）は 0 件として出す。
  */
  const flagged = () =>
    admin
      .from('chat_messages')
      .select('*', { count: 'exact' })
      .filter('flags', 'neq', '{}')
      .is('flag_cleared_at', null)
      .is('hidden_at', null);
  const { data: review } = await admin.from('chat_review_state').select('checked_until').eq('id', 1).maybeSingle();
  const checkedUntil = (review as { checked_until?: string | null } | null)?.checked_until ?? null;
  const unchecked = () => {
    const q = admin.from('chat_messages').select('*', { count: 'exact' }).is('hidden_at', null);
    return checkedUntil ? q.gt('created_at', checkedUntil) : q;
  };
  const [flagCount, newCount] = await Promise.all([
    flagged()
      .limit(1)
      .then((r) => (r.error ? 0 : (r.count ?? 0))),
    unchecked()
      .limit(1)
      .then((r) => (r.error ? 0 : (r.count ?? 0))),
  ]);

  let messages: ChatMessage[] = [];
  if (tab === 'reports') {
    const ids = [...reportsByMessage.keys()];
    if (ids.length) {
      const { data } = await admin.from('chat_messages').select('*').in('id', ids);
      const byId = new Map(((data ?? []) as ChatMessage[]).map((m) => [m.id, m]));
      messages = ids.map((id) => byId.get(id)).filter((m): m is ChatMessage => !!m);
    }
  } else if (tab === 'flags') {
    const { data } = await flagged().order('created_at', { ascending: true }).limit(BATCH);
    messages = (data ?? []) as ChatMessage[];
  } else if (tab === 'new') {
    const { data } = await unchecked().order('created_at', { ascending: true }).limit(BATCH);
    messages = (data ?? []) as ChatMessage[];
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

  /* 添えられた画像（2026-11-08）。隠した書き込みの画像も、職員には出す */
  const imagePaths = messages.flatMap((m) => (m.image_path ? [m.image_path] : []));
  const signed = imagePaths.length
    ? await admin.storage.from('chat-images').createSignedUrls(imagePaths, SIGNED_SECONDS)
    : { data: [] as { path: string | null; signedUrl: string | null }[] };
  const imageUrl = new Map(
    (signed.data ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl as string]),
  );

  const when = (iso: string) =>
    new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' });
  const code = (n: number) => (n < 10000 ? String(n).padStart(4, '0') : String(n));
  const fill = (template: string, n: number) => template.replace('{n}', String(n));

  /* 未確認：いま出しているいちばん新しい書き込みの時刻まで、確認済みにする */
  const newestShown = tab === 'new' ? messages[messages.length - 1]?.created_at : undefined;

  const tabs: [Tab, string, number | null][] = [
    ['reports', s.tabReports, reportsByMessage.size],
    ['flags', s.tabFlags, flagCount],
    ['new', s.tabNew, newCount],
    ['all', s.tabAll, null],
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={s.title} description={s.description} />
      {/* 新しい書き込み・通報を、読み直さなくても出す（2026-10-08） */}
      <LiveRefresh table="chat_messages" />

      <nav className="flex flex-wrap gap-2" aria-label={s.title}>
        {tabs.map(([k, label, n]) => {
          const on = k === tab;
          return (
            <Link
              key={k}
              href={k === 'reports' ? '/chat' : `/chat?tab=${k}`}
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

      {tab === 'flags' && <p className="text-sm text-text-muted">{s.flagsHint}</p>}
      {tab === 'new' && <p className="text-sm text-text-muted">{s.newHint}</p>}

      {messages.length === 0 ? (
        <Card>
          <EmptyState
            title={
              tab === 'reports' ? s.noReports : tab === 'flags' ? s.noFlags : tab === 'new' ? s.noNew : s.noMessages
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => {
            const p = who.get(m.user_id);
            const reps = reportsByMessage.get(m.id) ?? [];
            const reasons = reps.map((r) => r.reason).filter((x): x is string => !!x);
            /* まだ下ろしていない旗 */
            const flags = !m.flag_cleared_at ? (m.flags ?? []) : [];
            return (
              <div key={m.id} data-testid="admin-chat-message">
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-faint">
                  <span className="font-semibold text-text">
                    {p ? (p.display_name?.trim() || s.noName) : s.memberGone}
                  </span>
                  {p && <span>{s.member.replace('{no}', code(p.member_no))}</span>}
                  <span>{s.postedAt.replace('{date}', when(m.created_at))}</span>
                  {m.hidden_at && <Badge tone="warn">{s.hidden}</Badge>}
                  {p?.chat_muted && <Badge tone="warn">{s.muted}</Badge>}
                  {reps.length > 0 && <Badge tone="warn">{s.reportCount.replace('{n}', String(reps.length))}</Badge>}
                  {flags.map((f) => (
                    <Badge key={f} tone="warn">
                      {s.flag[f as ChatFlag] ?? f}
                    </Badge>
                  ))}
                </div>
                {m.image_path &&
                  (imageUrl.get(m.image_path) ? (
                    <a
                      href={imageUrl.get(m.image_path)}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-fit"
                      data-testid="admin-chat-image"
                    >
                      {/* 期限付きの鍵の URL。next/image の最適化を通すと鍵が切れる */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl.get(m.image_path)}
                        alt={s.imageAlt}
                        width={m.image_width ?? undefined}
                        height={m.image_height ?? undefined}
                        className={`h-auto max-h-60 w-auto max-w-full rounded-lg border border-border ${m.hidden_at ? 'opacity-50' : ''}`}
                      />
                    </a>
                  ) : (
                    <p className="text-xs text-text-faint">{s.imageGone}</p>
                  ))}
                {m.body.trim() !== '' && (
                  <p className={`whitespace-pre-wrap text-sm leading-relaxed ${m.hidden_at ? 'text-text-faint line-through' : ''}`}>
                    {m.body}
                  </p>
                )}
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
                  {flags.length > 0 && !m.hidden_at && (
                    <form action={clearChatFlag}>
                      <input type="hidden" name="id" value={m.id} />
                      <Button type="submit" variant="secondary">
                        {s.clearFlag}
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
              </div>
            );
          })}

          {/*
            未確認：読み終えたら押す。いま出している分（いちばん新しい書き込みの時刻）
            までを確認済みにする。押した時刻までにはしない（そのあいだに来た分を、
            読まずに確認済みにしないため）。
          */}
          {tab === 'new' && newestShown && (
            <Card className="space-y-2">
              <form action={markChatChecked}>
                <input type="hidden" name="until" value={newestShown} />
                <Button type="submit">{fill(s.markChecked, messages.length)}</Button>
              </form>
              <p className="text-xs text-text-faint">
                {newCount > messages.length ? fill(s.moreNew, newCount - messages.length) : s.markCheckedHint}
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
