'use client';

import { useActionState } from 'react';

import { Alert, Button, Card, Field, inputClass } from '@/components/ui';
import type { ActionState } from '@/app/actions/facilities';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/**
 * お支払いの受取口座。
 *
 * **ここに入れたものが、そのままドライバーの画面へ出る。**
 *   打ち間違いは、そのまま宛先違いの振込になる。欄の並びは通帳の
 *   並び（金融機関 → 支店 → 種別 → 番号 → 名義）に合わせ、
 *   目で追いながら写せるようにしている。
 *
 * **空のままでも保存できる**
 *   まだ決まっていないことがある。空のあいだ、アプリは「準備中」と出す。
 *   半端に埋まった状態だけを止める（サーバー側で見ている）。
 */
export function PaymentSettingsForm({
  action,
  t,
  initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  t: Dictionary;
  initial: {
    bank_name: string | null;
    branch_name: string | null;
    account_type: string | null;
    account_number: string | null;
    account_holder: string | null;
    account_holder_kana: string | null;
    note: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const m = t.members;
  const err = (key: string) => state.errors?.[key];

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-text-muted">{m.transferTitle}</h2>
        <p className="mt-1 text-xs text-text-faint">{m.transferHint}</p>
      </div>

      {state.ok && state.message && <Alert tone="ok">{state.message}</Alert>}
      {!state.ok && state.message && <Alert tone="danger">{state.message}</Alert>}

      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={m.bankName} error={err('bank_name')}>
            <input
              name="bank_name"
              defaultValue={initial.bank_name ?? ''}
              className={inputClass}
              placeholder="○○銀行"
            />
          </Field>

          <Field label={m.branchName} error={err('branch_name')}>
            <input
              name="branch_name"
              defaultValue={initial.branch_name ?? ''}
              className={inputClass}
              placeholder="△△支店"
            />
          </Field>

          <Field label={m.accountType} error={err('account_type')}>
            <select
              name="account_type"
              defaultValue={initial.account_type ?? 'futsu'}
              className={inputClass}
            >
              <option value="futsu">{m.futsu}</option>
              <option value="touza">{m.touza}</option>
            </select>
          </Field>

          <Field label={m.accountNumber} hint={m.accountNumberHint} error={err('account_number')}>
            <input
              name="account_number"
              defaultValue={initial.account_number ?? ''}
              className={`${inputClass} tabular`}
              inputMode="numeric"
              placeholder="1234567"
            />
          </Field>

          <Field label={m.accountHolder} error={err('account_holder')}>
            <input
              name="account_holder"
              defaultValue={initial.account_holder ?? ''}
              className={inputClass}
              placeholder="上野 修"
            />
          </Field>

          <Field label={m.accountHolderKana} hint={m.accountHolderKanaHint}>
            <input
              name="account_holder_kana"
              defaultValue={initial.account_holder_kana ?? ''}
              className={inputClass}
              placeholder="ウエノ オサム"
            />
          </Field>
        </div>

        <Field label={m.note} hint={m.noteHint}>
          <textarea
            name="note"
            defaultValue={initial.note ?? ''}
            className={inputClass}
            rows={2}
            placeholder={m.notePlaceholder}
          />
        </Field>

        <Button type="submit" disabled={pending}>
          {pending ? m.saving : m.save}
        </Button>
      </form>
    </Card>
  );
}
