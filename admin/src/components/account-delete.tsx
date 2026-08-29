'use client';

import { useActionState } from 'react';

import { deleteAccount, type AccountActionState } from '@/app/actions/accounts';

/**
 * アカウントを完全に削除するボタン。
 *
 * 「停止」の隣に、より弱い見た目で置く。
 * 通常は停止で足りるうえ、削除すると操作履歴の実行者が空欄になるため、
 * 押しやすい位置・目立つ色にはしない。
 */
export function AccountDeleteButton({
  userId,
  name,
  labels,
}: {
  userId: string;
  name: string;
  labels: { delete: string; confirm: string };
}) {
  const [state, formAction, pending] = useActionState<AccountActionState, FormData>(
    deleteAccount,
    {},
  );

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="user_id" value={userId} />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          // 取り消せない操作なので、一度確かめる
          if (!confirm(labels.confirm.replace('{name}', name))) e.preventDefault();
        }}
        className="ml-3 text-xs text-text-faint transition-colors hover:text-danger disabled:opacity-50"
      >
        {labels.delete}
      </button>
      {state.message && !state.ok && (
        <p className="mt-1 text-xs text-danger">{state.message}</p>
      )}
    </form>
  );
}
