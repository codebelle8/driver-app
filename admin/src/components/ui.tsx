import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import type { PublishStatus } from '@/lib/supabase/database.types';
import { PUBLISH_STATUS_LABEL } from '@/lib/supabase/database.types';

/** 画面共通の見出し。右側に操作ボタンを置ける。 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-5 ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  tone = 'default',
  hint,
}: {
  label: string;
  value: number | string;
  unit?: string;
  tone?: 'default' | 'warn' | 'ok';
  hint?: string;
}) {
  const toneClass =
    tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-text';
  return (
    <Card>
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular ${toneClass}`}>
        {value}
        {unit && <span className="ml-1 text-base font-normal text-text-muted">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-text-faint">{hint}</p>}
    </Card>
  );
}

const buttonBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const buttonVariants = {
  primary: 'bg-accent text-accent-text hover:bg-accent-hover',
  secondary: 'border border-border-strong bg-surface-2 text-text hover:border-accent',
  ghost: 'text-text-muted hover:text-text hover:bg-surface-2',
  danger: 'border border-danger/40 text-danger hover:bg-danger/10',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`${buttonBase} ${buttonVariants[variant]} ${className}`}
    />
  );
}

export function LinkButton({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link {...props} className={`${buttonBase} ${buttonVariants[variant]} ${className}`} />
  );
}

export function StatusBadge({ status }: { status: PublishStatus }) {
  const style = {
    published: 'border-ok/40 bg-ok/10 text-ok',
    draft: 'border-border-strong bg-surface-2 text-text-muted',
    archived: 'border-danger/40 bg-danger/10 text-danger',
  }[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {PUBLISH_STATUS_LABEL[status]}
    </span>
  );
}

export function Badge({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'teal' | 'warn';
}) {
  const style = {
    default: 'border-border-strong bg-surface-2 text-text-muted',
    accent: 'border-accent/40 bg-accent/10 text-accent',
    teal: 'border-teal/40 bg-teal/10 text-teal',
    warn: 'border-warn/40 bg-warn/10 text-warn',
  }[tone];

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border py-14 text-center">
      <p className="font-medium text-text">{title}</p>
      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-sm text-text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** 入力欄。label と説明文をまとめて扱えるようにしている。 */
export function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-text">
        {label}
        {required && <span className="text-accent">*</span>}
      </span>
      {hint && <span className="mb-1.5 block text-xs text-text-faint">{hint}</span>}
      {children}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

export function Alert({
  tone = 'warn',
  title,
  children,
}: {
  tone?: 'warn' | 'danger' | 'ok' | 'info';
  title?: string;
  children: ReactNode;
}) {
  const style = {
    warn: 'border-warn/40 bg-warn/10 text-warn',
    danger: 'border-danger/40 bg-danger/10 text-danger',
    ok: 'border-ok/40 bg-ok/10 text-ok',
    info: 'border-border-strong bg-surface-2 text-text-muted',
  }[tone];

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${style}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-1' : ''}>{children}</div>
    </div>
  );
}
