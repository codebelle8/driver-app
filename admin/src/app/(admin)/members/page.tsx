import { savePaymentSettings, setMemberActive, setMemberBlocked } from '@/app/actions/members';
import { PaymentSettingsForm } from '@/components/payment-settings-form';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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
export default async function MembersPage() {
  await requireAdmin();
  const t = await getDictionary();
  const m = t.members;

  const admin = createAdminClient();

  const { data: settings } = await admin
    .from('payment_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  const { data: members } = await admin
    .from('driver_profiles')
    .select('*')
    .order('member_no');

  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 200 });
  const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('ja-JP', { dateStyle: 'medium' }) : '—';

  const code = (n: number) => (n < 10000 ? String(n).padStart(4, '0') : String(n));

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
        <h2 className="border-b border-border px-5 py-3 text-sm font-semibold text-text-muted">
          {m.listTitle}
        </h2>

        {(members ?? []).length === 0 ? (
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
                {(members ?? []).map((p) => {
                  const paid = p.status === 'active';
                  const blocked = p.status === 'blocked';
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
                        {emailById.get(p.user_id) ?? '—'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={blocked ? 'warn' : paid ? 'accent' : 'default'}>
                          {blocked ? m.stateBlocked : paid ? m.statePaid : m.stateTrial}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 tabular text-text-muted">
                        {day(p.trial_ends_at)}
                      </td>
                      <td className="px-5 py-3">
                        {p.plan ? (p.plan === 'monthly' ? m.planMonthly : m.planYearly) : '—'}
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
                          {!blocked && (
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
      </Card>
    </div>
  );
}
