'use client';

import { useActionState } from 'react';

import type { ActionState } from '@/app/actions/facilities';
import { setMemberSurveyor } from '@/app/actions/members';
import { ConfirmSubmit } from '@/components/confirm-dialog';
import { buttonClass } from '@/components/ui';

/**
 * 会員を調査員にする／やめるボタン（会員・お支払い）。ご指示 2026-11-01。
 *
 * 押すと一度だけ確かめる。調査員にすると管理画面に入れるようになり、
 * やめるとアプリの扱いが変わるため、押し間違いをそのまま通さない。
 */
export function MemberSurveyorButton({
  userId,
  name,
  surveyor,
  labels,
}: {
  userId: string;
  /** 確かめる札に出す名前（表示名、無ければアドレス） */
  name: string;
  /** いま調査員か */
  surveyor: boolean;
  labels: {
    button: string;
    heading: string;
    /** {name} を含む文面 */
    body: string;
    note: string;
    cancel: string;
  };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setMemberSurveyor, {});

  return (
    <form action={formAction} className="inline-flex flex-col items-end">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="surveyor" value={surveyor ? 'false' : 'true'} />
      <ConfirmSubmit
        type="submit"
        disabled={pending}
        tone={surveyor ? 'danger' : 'primary'}
        heading={labels.heading}
        message={labels.body.replace('{name}', name)}
        note={labels.note}
        confirmLabel={labels.button}
        cancelLabel={labels.cancel}
        className={buttonClass(surveyor ? 'ghost' : 'secondary')}
      >
        {labels.button}
      </ConfirmSubmit>
      {state.message && !state.ok && <p className="mt-1 text-xs text-danger">{state.message}</p>}
    </form>
  );
}
