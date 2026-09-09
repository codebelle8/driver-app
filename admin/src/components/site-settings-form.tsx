'use client';

import { useActionState } from 'react';

import { Alert, Button, Card, Field, inputClass } from '@/components/ui';
import type { ActionState } from '@/app/actions/facilities';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/**
 * 規約類の掲載先と、問い合わせ先。
 *
 * **文面は預からない。掲載先だけを預かる。**
 *   文面をアプリに抱えると、直すたびに配り直しになる。ホームページ等に
 *   置いていただき、アプリはそこを指す。
 *
 * **空のままでも保存できる**
 *   まだ用意できていないものがある。入っている項目だけがアプリに出る。
 *   押しても何も無いリンクを出すよりは、出さないほうがよい。
 */
export function SiteSettingsForm({
  action,
  t,
  initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  t: Dictionary;
  initial: {
    operator_name: string | null;
    contact_email: string | null;
    terms_url: string | null;
    privacy_url: string | null;
    law_url: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const s = t.site;
  const err = (key: string) => state.errors?.[key];

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-text-muted">{s.linksTitle}</h2>
        <p className="mt-1 text-xs text-text-faint">{s.linksHint}</p>
      </div>

      {state.ok && state.message && <Alert tone="ok">{state.message}</Alert>}
      {!state.ok && state.message && <Alert tone="danger">{state.message}</Alert>}

      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={s.operatorName} hint={s.operatorNameHint}>
            <input
              name="operator_name"
              defaultValue={initial.operator_name ?? ''}
              className={inputClass}
              placeholder="株式会社○○"
            />
          </Field>

          <Field label={s.contactEmail} hint={s.contactEmailHint} error={err('contact_email')}>
            <input
              name="contact_email"
              type="email"
              defaultValue={initial.contact_email ?? ''}
              className={inputClass}
              placeholder="support@example.com"
            />
          </Field>
        </div>

        <Field label={s.termsUrl} error={err('terms_url')}>
          <input
            name="terms_url"
            type="url"
            defaultValue={initial.terms_url ?? ''}
            className={inputClass}
            placeholder="https://example.com/terms"
          />
        </Field>

        <Field label={s.privacyUrl} error={err('privacy_url')}>
          <input
            name="privacy_url"
            type="url"
            defaultValue={initial.privacy_url ?? ''}
            className={inputClass}
            placeholder="https://example.com/privacy"
          />
        </Field>

        <Field label={s.lawUrl} error={err('law_url')}>
          <input
            name="law_url"
            type="url"
            defaultValue={initial.law_url ?? ''}
            className={inputClass}
            placeholder="https://example.com/law"
          />
        </Field>

        <Button type="submit" disabled={pending}>
          {pending ? s.saving : s.save}
        </Button>
      </form>
    </Card>
  );
}
