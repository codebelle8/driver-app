'use client';

import { useActionState } from 'react';

import { deleteAccount, type AccountActionState } from '@/app/actions/accounts';
import { ConfirmSubmit } from '@/components/confirm-dialog';

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
  labels: {
    delete: string;
    /** {name} を含む文面 */
    confirm: string;
    heading: string;
    noUndo: string;
    cancel: string;
  };
}) {
  const [state, formAction, pending] = useActionState<AccountActionState, FormData>(
    deleteAccount,
    {},
  );

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="user_id" value={userId} />
      {/*
        取り消せない操作なので、一度確かめる。

        以前は window.confirm を使っていた。この文面は3文あり、
        ブラウザによっては途中で切られて「停止する」の案内まで
        読めなかった。画面の中の札なら全文が出る。
      */}
      <ConfirmSubmit
        type="submit"
        disabled={pending}
        heading={labels.heading}
        message={labels.confirm.replace('{name}', name)}
        note={labels.noUndo}
        confirmLabel={labels.delete}
        cancelLabel={labels.cancel}
        className="ml-3 text-xs text-text-faint transition-colors hover:text-danger disabled:opacity-50"
      >
        {labels.delete}
      </ConfirmSubmit>
      {state.message && !state.ok && (
        <p className="mt-1 text-xs text-danger">{state.message}</p>
      )}
    </form>
  );
}
