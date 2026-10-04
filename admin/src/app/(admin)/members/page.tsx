import { savePaymentSettings, setMemberActive, setMemberBlocked } from '@/app/actions/members';
import { PaymentSettingsForm } from '@/components/payment-settings-form';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { PageLink } from '@/components/page-link';
import { requireAdmin } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import { remainingSpan } from '@/lib/plans';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * 1ページに出す人数。ご指示 2026-09-14。
 *
 * 通帳と見比べながら1人ずつ手を打つ画面なので、一度に並べる数を
 * 抑える。多く並べても、上から順に処理する使い方は変わらない。
 */
const PAGE_SIZE = 10;

/**
 * 会員（ドライバー）と、お支払い。
 *
 * **管理者だけが開ける。** 会員のメールアドレスとお支払いの状況が並ぶ。
 * 編集者・調査員が見る理由が無い。
 *
 * **入金の確認は人が行う。**
 *   振込は名義しか届かず、金額も手数料でずれる。自動では決められない。
 *   ここは通帳を見て決めた結果を書き留める場所。
 *
 * **service_role で読んでいる理由**
 *   会員の名簿は本人と管理者しか読めないよう RLS を敷いてあるが、
 *   メールアドレスは auth 側にあり、そちらは service_role でしか
 *   引けない。同じ鍵で揃えたほうが、二種類の経路を持たずに済む。
 */
export default async function MembersPage({ searchParams }: PageProps<'/members'>) {
  await requireAdmin();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const t = await getDictionary();
  const m = t.members;

  const admin = createAdminClient();

  const { data: settings } = await admin
    .from('payment_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  const { data: rows } = await admin.from('driver_profiles').select('*');

  /*
    無料でお使いいただいている方（2026-10-05）。管理画面で「調査員」として
    有効な方は、アプリを無料で使える（データベースの my_free_access と同じ
    基準）。期限も入金の確認も要らないので、催促の対象から外す。
  */
  const { data: surveyorRows } = await admin
    .from('admin_profiles')
    .select('user_id')
    .eq('role', 'surveyor')
    .eq('is_active', true);
  const free = new Set((surveyorRows ?? []).map((r) => r.user_id));

  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 200 });
  const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('ja-JP', { dateStyle: 'medium' }) : '—';

  const code = (n: number) => (n < 10000 ? String(n).padStart(4, '0') : String(n));

  /* 文言の {n} を差し替える。この画面でしか使わないので、ここに置く。 */
  const fill = (template: string, n: number | string) => template.replace('{n}', String(n));

  /*
    残りの長さ。**月だけで丸めない**（ご指摘 2026-09-15）。
    「あと11か月」では、ちょうどなのか端数があるのかが分からない。
  */
  const span = (endIso: string | null) => {
    const { months, days } = remainingSpan(endIso, new Date(now));
    if (months <= 0) return m.spanDays.replace('{d}', String(days));
    if (days <= 0) return m.spanMonths.replace('{m}', String(months));
    return m.spanMonthsDays.replace('{m}', String(months)).replace('{d}', String(days));
  };

  /*
    残り日数。切り上げる。

    あと数時間でも「あと1日」と出したい。「あと0日」では、今日中に
    切れるのか既に切れているのかが読み取れない。
  */
  const now = Date.now();
  const daysTo = (iso: string) => Math.ceil((new Date(iso).getTime() - now) / 86_400_000);

  /*
    並びは「手を打つ必要がある順」。

    会員番号順だと、期限切れの方が下に埋もれる。番号は振込の
    突き合わせに使うもので、眺める順ではない。

      1. 期限切れ（放っておくと未収になる）
      2. 無料期間（期限の近い順）
      3. ご利用中
      4. 停止中
  */
  /*
    見ている期間の終わり。**お支払い済みならその期間の終わり**（2026-09-15）。

    null は期限なし。この欄を設ける前から「ご利用中」だった方が当てはまる。
    勝手に期限を決めず、次に「入金を確認した」を押した時点で入る。
  */
  type Row = { user_id: string; status: string; trial_ends_at: string; paid_until?: string | null };
  const endOf = (p: Row): string | null =>
    free.has(p.user_id) ? null : p.status === 'active' ? (p.paid_until ?? null) : p.trial_ends_at;

  const isOver = (p: Row): boolean => {
    const at = endOf(p);
    return !!at && daysTo(at) <= 0;
  };

  const rank = (p: Row) => {
    if (p.status === 'blocked') return 3;
    /* お支払い済みでも、期間が過ぎていれば先頭に出す。未収になる。 */
    if (isOver(p)) return 0;
    /* 無料の方（調査員）は、ご利用中と同じ並びへ */
    if (p.status === 'active' || free.has(p.user_id)) return 2;
    return 1;
  };

  /* 並べ替えに使う日付。期限なしの方は、いちばん後ろへ。 */
  const sortKey = (p: Row) => {
    const at = endOf(p);
    return at ? new Date(at).getTime() : Number.MAX_SAFE_INTEGER;
  };

  const members = [...(rows ?? [])].sort(
    (a, b) => rank(a) - rank(b) || sortKey(a) - sortKey(b) || a.member_no - b.member_no,
  );

  const count = (want: number) => members.filter((p) => rank(p) === want).length;

  /*
    切り出しは**並べ替えたあと**に行う。

    並びは「手を打つ必要がある順」で、期限切れが先頭に来る。先に
    切り出すと、その順番が崩れて期限切れが後ろのページへ散らばる。

    内訳（期限切れ◯名…）は全体の数のまま出す。ページごとの数を
    出しても、何人に手を打つ必要があるかが分からなくなる。
  */
  const lastPage = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
  const from = Math.min(page, lastPage) - 1;
  const shown = members.slice(from * PAGE_SIZE, from * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader title={m.title} description={m.description} />

      <PaymentSettingsForm
        action={savePaymentSettings}
        t={t}
        initial={{
          bank_name: settings?.bank_name ?? null,
          branch_name: settings?.branch_name ?? null,
          account_type: settings?.account_type ?? null,
          account_number: settings?.account_number ?? null,
          account_holder: settings?.account_holder ?? null,
          account_holder_kana: settings?.account_holder_kana ?? null,
          note: settings?.note ?? null,
        }}
      />

      <Card className="!p-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-text-muted">{m.listTitle}</h2>
          {/*
            内訳。表を数えなくても、手を打つ相手が何人いるか分かるように。
          */}
          {members.length > 0 && (
            <span className="text-xs text-text-faint">
              {[
                count(0) > 0 && fill(m.countExpired, count(0)),
                count(1) > 0 && fill(m.countTrial, count(1)),
                count(2) > 0 && fill(m.countPaid, count(2)),
                count(3) > 0 && fill(m.countBlocked, count(3)),
              ]
                .filter(Boolean)
                .join('　')}
            </span>
          )}
        </div>

        {members.length === 0 ? (
          <div className="p-5">
            <EmptyState title={m.empty} description={m.emptyBody} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-muted">
                  <th className="px-5 py-3 font-medium">{m.colNo}</th>
                  <th className="px-5 py-3 font-medium">{m.colEmail}</th>
                  <th className="px-5 py-3 font-medium">{m.colState}</th>
                  <th className="px-5 py-3 font-medium">{m.colTrial}</th>
                  <th className="px-5 py-3 font-medium">{m.colPlan}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((p) => {
                  const paid = p.status === 'active';
                  const blocked = p.status === 'blocked';
                  const isFree = !blocked && free.has(p.user_id);
                  const endIso = endOf(p);
                  const left = endIso ? daysTo(endIso) : 0;
                  const expired = !blocked && !!endIso && left <= 0;
                  return (
                    <tr key={p.user_id}>
                      {/*
                        会員番号。振込名義に添えていただく番号と同じもの。
                        通帳と見比べるため、等幅で出す。
                      */}
                      <td className="px-5 py-3">
                        <code className="tabular font-semibold">{code(p.member_no)}</code>
                      </td>
                      <td className="px-5 py-3 text-text-muted">
                        {/*
                          そのまま連絡できるようにする。入金の催促も、
                          停止のお知らせも、ここから始まる。
                        */}
                        {emailById.get(p.user_id) ? (
                          <a
                            href={`mailto:${emailById.get(p.user_id)}`}
                            title={m.mailTo}
                            className="underline decoration-border underline-offset-2 hover:text-text"
                          >
                            {emailById.get(p.user_id)}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={blocked || expired ? 'warn' : paid || isFree ? 'accent' : 'default'}>
                          {blocked
                            ? m.stateBlocked
                            : isFree
                              ? m.stateFree
                              : expired
                              ? m.stateExpired
                              : paid
                                ? m.statePaid
                                : m.stateTrial}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 tabular text-text-muted">
                        {endIso ? day(endIso) : <span className="text-text-faint">{m.noEnd}</span>}
                        {!blocked && !!endIso && (
                          <span className={`ml-2 text-xs ${expired ? 'text-warn' : 'text-text-faint'}`}>
                            {expired ? fill(m.overdue, -left) : fill(m.daysLeft, span(endIso))}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {p.plan ? m.planNames[p.plan] : '—'}
                        {p.plan_chosen_at && (
                          <span className="ml-2 text-xs text-text-faint">
                            {day(p.plan_chosen_at)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          {/*
                            停止中の方に入金の操作は出さない。
                            先に停止を解いてから、あらためて判断していただく。
                          */}
                          {!blocked && !isFree && (
                            <form action={setMemberActive}>
                              <input type="hidden" name="user_id" value={p.user_id} />
                              <input type="hidden" name="active" value={paid ? 'false' : 'true'} />
                              <Button type="submit" variant={paid ? 'ghost' : 'primary'}>
                                {paid ? m.undoPaid : m.markPaid}
                              </Button>
                            </form>
                          )}
                          <form action={setMemberBlocked}>
                            <input type="hidden" name="user_id" value={p.user_id} />
                            <input type="hidden" name="active" value={blocked ? 'false' : 'true'} />
                            <Button type="submit" variant="ghost">
                              {blocked ? m.unblock : m.block}
                            </Button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {lastPage > 1 && (
          <nav
            className="flex items-center justify-center gap-2 border-t border-border px-5 py-3"
            aria-label={t.common.pagination}
          >
            <PageLink
              href={page > 2 ? `/members?page=${page - 1}` : '/members'}
              disabled={page <= 1}
            >
              {t.common.prev}
            </PageLink>
            <span className="tabular px-3 text-sm text-text-muted">
              {Math.min(page, lastPage)} / {lastPage}
            </span>
            <PageLink href={`/members?page=${page + 1}`} disabled={page >= lastPage}>
              {t.common.next}
            </PageLink>
          </nav>
        )}
      </Card>
    </div>
  );
}
