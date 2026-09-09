'use client';

import { useActionState } from 'react';

import { Alert, Button, Card, Field, inputClass } from '@/components/ui';
import type { ActionState } from '@/app/actions/facilities';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/**
 * 知らせを送る欄。
 *
 * **取り消せない。** 押した時点で、受け取る設定にしている全員の端末が
 * 鳴る。文面を直して送り直すことはできても、前のものは消せない。
 * その旨を欄の上に書く。
 *
 * **短く書いていただく**
 *   通知は端末側で切り詰められる。長く書いても最後まで読まれない。
 *   件名40文字・本文120文字で止める。
 */
export function PushForm({
  action,
  t,
  targets,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  t: Dictionary;
  /** いま送れる端末の数 */
  targets: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const p = t.push;
  const err = (key: string) => state.errors?.[key];

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-text-muted">{p.sendTitle}</h2>
        <p className="mt-1 text-xs text-text-faint">{p.sendHint.replace('{n}', String(targets))}</p>
      </div>

      {state.ok && state.message && <Alert tone="ok">{state.message}</Alert>}
      {!state.ok && state.message && <Alert tone="warn">{state.message}</Alert>}

      <form action={formAction} className="space-y-4">
        <Field label={p.subject} required error={err('title')}>
          <input
            name="title"
            className={inputClass}
            maxLength={40}
            placeholder={p.subjectPlaceholder}
          />
        </Field>

        <Field label={p.body} hint={p.bodyHint} error={err('body')}>
          <textarea name="body" className={inputClass} rows={2} maxLength={120} />
        </Field>

        <Field label={p.openAt} hint={p.openAtHint}>
          <input name="url" className={inputClass} placeholder="/notices" />
        </Field>

        <Button type="submit" disabled={pending || targets === 0}>
          {pending ? p.sending : p.send}
        </Button>
      </form>
    </Card>
  );
}
