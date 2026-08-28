'use client';

import { useRef } from 'react';

import type { AdminRole } from '@/lib/supabase/database.types';

/**
 * 役割を選ぶと即座に保存する。
 *
 * 「変更」ボタンを別に置かないのは、20行並ぶ一覧で選択と確定が分かれると
 * 押し忘れが起きるため。選んだ時点で反映されるほうが誤解が少ない。
 */
export function RoleSelect({
  userId,
  value,
  disabled,
  labels,
  action,
}: {
  userId: string;
  value: AdminRole;
  disabled?: boolean;
  /** 役割の表示名。言語切り替えに追従させるため辞書から渡す。 */
  labels: Record<AdminRole, string>;
  action: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="user_id" value={userId} />
      <select
        name="role"
        defaultValue={value}
        disabled={disabled}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm text-text disabled:opacity-50"
      >
        {(['surveyor', 'editor', 'admin'] as AdminRole[]).map((r) => (
          <option key={r} value={r}>
            {labels[r]}
          </option>
        ))}
      </select>
    </form>
  );
}
