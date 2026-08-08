'use client';

import { useActionState } from 'react';

import { Alert, Button, Card, Field, inputClass } from '@/components/ui';
import type { ActionState } from '@/app/actions/facilities';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import type { Category, Facility } from '@/lib/supabase/database.types';

export function FacilityForm({
  action,
  categories,
  facility,
  submitLabel,
  t,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  categories: Pick<Category, 'id' | 'name'>[];
  facility?: Facility;
  submitLabel: string;
  t: Dictionary;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const err = (key: string) => state.errors?.[key];
  const f = t.facilityForm;

  return (
    <form action={formAction} className="space-y-6">
      {facility && <input type="hidden" name="id" value={facility.id} />}

      {state.message && <Alert tone={state.ok ? 'ok' : 'danger'}>{state.message}</Alert>}

      <Card className="space-y-5">
        <h2 className="text-sm font-semibold text-text-muted">
          {f.sectionBasic}
        </h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={f.name} required error={err('name')}>
            <input
              name="name"
              defaultValue={facility?.name}
              required
              className={inputClass}
              placeholder="グランドホテル汐留"
            />
          </Field>

          <Field label={f.nameKana} required hint={f.nameKanaHint} error={err('name_kana')}>
            <input
              name="name_kana"
              defaultValue={facility?.name_kana}
              required
              className={inputClass}
              placeholder="ぐらんどほてるしおどめ"
            />
          </Field>
        </div>

        <Field label={f.aliases} hint={f.aliasesHint} error={err('aliases')}>
          <input
            name="aliases"
            defaultValue={facility?.aliases?.join('; ')}
            className={inputClass}
            placeholder="汐留グランド; GHS"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={f.category} required error={err('category_id')}>
            <select
              name="category_id"
              defaultValue={facility?.category_id ?? ''}
              required
              className={inputClass}
            >
              <option value="" disabled>
                {f.categoryPlaceholder}
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={f.status} error={err('status')}>
            <select
              name="status"
              defaultValue={facility?.status ?? 'draft'}
              className={inputClass}
            >
              <option value="draft">{f.statusDraftLabel}</option>
              <option value="published">{t.status.published}</option>
              <option value="archived">{t.status.archived}</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-5">
        <h2 className="text-sm font-semibold text-text-muted">
          {f.sectionAddress}
        </h2>

        <div className="grid gap-5 sm:grid-cols-[160px_1fr_1fr]">
          <Field label={f.postalCode} error={err('postal_code')}>
            <input
              name="postal_code"
              defaultValue={facility?.postal_code ?? ''}
              className={inputClass}
              placeholder="105-0021"
            />
          </Field>

          <Field label={f.prefecture} required error={err('prefecture')}>
            <input
              name="prefecture"
              defaultValue={facility?.prefecture}
              required
              className={inputClass}
              placeholder="東京都"
            />
          </Field>

          <Field label={f.city} error={err('city')}>
            <input
              name="city"
              defaultValue={facility?.city ?? ''}
              className={inputClass}
              placeholder="港区"
            />
          </Field>
        </div>

        <Field label={f.address} required hint={f.addressHint} error={err('address_line')}>
          <input
            name="address_line"
            defaultValue={facility?.address_line}
            required
            className={inputClass}
            placeholder="東新橋1-8-2"
          />
        </Field>

        <Field label={f.summary} hint={f.summaryHint} error={err('summary')}>
          <textarea
            name="summary"
            defaultValue={facility?.summary ?? ''}
            rows={3}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={f.lat} hint={f.latHint} error={err('lat')}>
            <input
              name="lat"
              defaultValue={facility?.lat ?? ''}
              className={`${inputClass} tabular`}
              placeholder="35.6656"
            />
          </Field>

          <Field label={f.lng} error={err('lng')}>
            <input
              name="lng"
              defaultValue={facility?.lng ?? ''}
              className={`${inputClass} tabular`}
              placeholder="139.7604"
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-5">
        <h2 className="text-sm font-semibold text-text-muted">
          {f.sectionNote}
        </h2>
        <Field label={f.note} hint={f.noteHint} error={err('note_internal')}>
          <textarea
            name="note_internal"
            defaultValue={facility?.note_internal ?? ''}
            rows={2}
            className={inputClass}
          />
        </Field>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t.common.saving : submitLabel}
        </Button>
        {state.ok && <span className="text-sm text-ok">{t.common.saved}</span>}
      </div>
    </form>
  );
}
