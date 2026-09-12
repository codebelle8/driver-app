import { createAccount, setAccountActive, setAccountRole } from '@/app/actions/accounts';
import { AccountDeleteButton } from '@/components/account-delete';
import { AccountForm } from '@/components/account-form';
import { RoleSelect } from '@/components/role-select';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireAdmin } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import { isOwnerEmail } from '@/lib/owner';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import type { AdminRole } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const me = await requireAdmin();
  const t = await getDictionary();
  const a = t.accounts;

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from('admin_profiles')
    .select('*')
    .order('created_at');

  // メールアドレスは auth 側にあり、admin_profiles には持っていない。
  // 二重に持つと片方だけ古くなるため、表示のたびに取りに行く。
  const admin = createAdminClient();
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 200 });
  const emailById = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, u.email ?? null]),
  );

  const activeAdmins = (profiles ?? []).filter(
    (p) => p.role === 'admin' && p.is_active,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader title={a.title} description={a.description} />

      <AccountForm action={createAccount} t={t} />

      <Card className="!p-0">
        <h2 className="border-b border-border px-5 py-3 text-sm font-semibold text-text-muted">
          {a.listTitle}
        </h2>

        {(profiles ?? []).length === 0 ? (
          <div className="p-5">
            <EmptyState title={a.empty} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-muted">
                  <th className="px-5 py-3 font-medium">{a.colName}</th>
                  <th className="px-5 py-3 font-medium">{a.email}</th>
                  <th className="px-5 py-3 font-medium">{a.colRole}</th>
                  <th className="px-5 py-3 font-medium">{a.colState}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(profiles ?? []).map((p) => {
                  const isMe = p.user_id === me.userId;
                  // 最後の管理者から権限を外すと、誰もアカウントを操作できなくなる
                  const lastAdmin = isMe && p.role === 'admin' && activeAdmins <= 1;
                  /*
                    所有者の行は、削除も停止も役割の変更もさせない。

                    ここで隠すのは操作の入口だけで、実際に止めているのは
                    データベース側のトリガー。画面だけでは、API を
                    直接呼ばれたときに通ってしまう。
                  */
                  const owner = isOwnerEmail(emailById.get(p.user_id));

                  return (
                    <tr key={p.user_id}>
                      <td className="px-5 py-3 font-medium">
                        {p.display_name}
                        {isMe && (
                          <span className="ml-2 text-xs text-text-muted">（{a.self}）</span>
                        )}
                        {owner && (
                          <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent-ink">
                            {a.owner}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-text-muted">
                        {emailById.get(p.user_id) ?? '—'}
                      </td>
                      <td className="px-5 py-3">
                        <RoleSelect
                          userId={p.user_id}
                          value={p.role as AdminRole}
                          disabled={lastAdmin || owner}
                          labels={{
                            admin: t.role.admin,
                            editor: t.role.editor,
                            surveyor: t.role.surveyor,
                          }}
                          action={setAccountRole}
                        />
                      </td>
                      <td className="px-5 py-3">
                        {p.is_active ? (
                          <Badge tone="accent">{a.active}</Badge>
                        ) : (
                          <Badge>{a.inactive}</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {/*
                          停止と削除を並べる。削除は取り消せず、操作履歴の実行者も
                          空欄になるため、弱い見た目で右端に置いている。
                        */}
                        {!isMe && !owner && (
                          <div className="flex items-center justify-end">
                            <form action={setAccountActive}>
                              <input type="hidden" name="user_id" value={p.user_id} />
                              <input
                                type="hidden"
                                name="active"
                                value={p.is_active ? 'false' : 'true'}
                              />
                              <Button type="submit" variant="ghost">
                                {p.is_active ? a.suspend : a.resume}
                              </Button>
                            </form>
                            <AccountDeleteButton
                              userId={p.user_id}
                              name={p.display_name}
                              labels={{
                                delete: a.delete,
                                confirm: a.deleteConfirm,
                                heading: t.common.deleteHeading,
                                noUndo: t.common.noUndo,
                                cancel: t.common.cancel,
                              }}
                            />
                          </div>
                        )}
                        {owner && !isMe && (
                          <span className="text-xs text-text-muted">
                            {a.ownerLocked}
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

      <Card>
        <h2 className="mb-3 text-sm font-semibold">{a.roleNote}</h2>
        <dl className="space-y-2 text-sm">
          {(['admin', 'editor', 'surveyor'] as AdminRole[]).map((r) => (
            <div key={r} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
              <dt className="w-24 shrink-0 font-medium">{t.role[r]}</dt>
              <dd className="text-text-muted">{t.role[`${r}Desc`]}</dd>
            </div>
          ))}
        </dl>

        {/* 停止と削除は取り違えると取り返しがつかないため、違いを添える */}
        <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-text-muted">
          {a.deleteNote}
        </p>
      </Card>
    </div>
  );
}
