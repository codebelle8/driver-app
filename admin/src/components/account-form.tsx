'use client';

import { useActionState, useState } from 'react';

import { Alert, Button, Card, Field, inputClass } from '@/components/ui';
import type { AccountActionState } from '@/app/actions/accounts';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import type { AdminRole } from '@/lib/supabase/database.types';

const ROLES: AdminRole[] = ['surveyor', 'editor', 'admin'];

export function AccountForm({
  action,
  t,
}: {
  action: (prev: AccountActionState, formData: FormData) => Promise<AccountActionState>;
  t: Dictionary;
}) {
  const [state, formAction, pending] = useActionState<AccountActionState, FormData>(
    action,
    {},
  );
  // 既定を調査員にしているのは、発行の大半が調査員になるため。
  // 権限の強い役割を既定にすると、押し間違いがそのまま事故になる。
  const [role, setRole] = useState<AdminRole>('surveyor');
  const [copied, setCopied] = useState(false);

  const a = t.accounts;
  const err = (key: string) => state.errors?.[key];

  return (
    <Card className="space-y-5">
      <h2 className="text-sm font-semibold text-text-muted">{a.newTitle}</h2>

      {/* 発行直後だけ表示する。再表示の手段は用意しない（保管していないため）。 */}
      {state.issued && (
        <Alert tone="ok" title={a.issuedTitle}>
          <p className="mb-3">{a.issuedWarning}</p>
          <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3 text-text">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-28 shrink-0 text-xs text-text-muted">{a.email}</span>
              <code className="tabular text-sm">{state.issued.email}</code>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-28 shrink-0 text-xs text-text-muted">
                {a.issuedTitle}
              </span>
              <code className="tabular select-all text-base font-semibold tracking-wider">
                {state.issued.password}
              </code>
              <Button
                type="button"
                variant="ghost"
                className="ml-auto"
                onClick={() => {
                  navigator.clipboard?.writeText(state.issued!.password);
                  setCopied(true);
                }}
              >
                {copied ? '✓' : '⧉'}
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {state.message && !state.issued && (
        <Alert tone={state.ok ? 'ok' : 'danger'}>{state.message}</Alert>
      )}

      <form action={formAction} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={a.displayName} required error={err('display_name')}>
            <input
              name="display_name"
              className={inputClass}
              placeholder="山田 太郎"
            />
          </Field>

          <Field label={a.email} required error={err('email')}>
            <input
              name="email"
              type="email"
              className={inputClass}
              placeholder="driver@example.com"
            />
          </Field>
        </div>

        <Field label={a.role} required error={err('role')}>
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
            className={inputClass}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t.role[r]}
              </option>
            ))}
          </select>
          {/* 選んだ役割で何ができるかを、選んだ場で示す */}
          <p className="mt-2 text-xs leading-relaxed text-text-muted">
            {t.role[`${role}Desc`]}
          </p>
        </Field>

        <Button type="submit" disabled={pending}>
          {pending ? a.issuing : a.issue}
        </Button>
      </form>
    </Card>
  );
}
