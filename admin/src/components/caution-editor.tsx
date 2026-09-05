'use client';

import { useActionState, useState } from 'react';

import { deleteCaution, saveCaution } from '@/app/actions/entry-points';
import type { ActionState } from '@/app/actions/facilities';
import { BulkCheck, BulkDelete } from '@/components/bulk-delete';
import { DeleteButton } from '@/components/delete-button';
import { Alert, Badge, Button, Field, inputClass } from '@/components/ui';
import { bulkLabels, type Dictionary } from '@/lib/i18n/dictionaries';
import type { Caution } from '@/lib/supabase/database.types';

/** 注意事項には見出しがない。どれかを示すのに本文の頭を使う。 */
function shortBody(body: string): string {
  return body.length > 20 ? `${body.slice(0, 20)}…` : body;
}

function timeRangeLabel(c: Caution): string | null {
  if (!c.time_from || !c.time_to) return null;
  return `${c.time_from.slice(0, 5)}〜${c.time_to.slice(0, 5)}`;
}

export function CautionEditor({
  facilityId,
  entryPointId,
  cautions,
  t,
}: {
  facilityId: string;
  entryPointId: string;
  cautions: Caution[];
  t: Dictionary;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveCaution,
    {},
  );
  const [open, setOpen] = useState(false);
  const c = t.caution;

  if (state.ok && open) queueMicrotask(() => setOpen(false));

  const severityLabel = {
    info: c.severityInfo,
    warn: c.severityWarn,
    critical: c.severityCritical,
  };

  return (
    <div className="space-y-3">
      {cautions.length > 0 && (
        <BulkDelete
          name="caution"
          action={deleteCaution}
          extra={{ facility_id: facilityId }}
          ids={cautions.map((x) => x.id)}
          labels={bulkLabels(t)}
        >
        <ul className="space-y-2">
          {cautions.map((item) => {
            const range = timeRangeLabel(item);
            return (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{item.body}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={item.severity === 'critical' ? 'warn' : 'default'}>
                      {severityLabel[item.severity]}
                    </Badge>
                    {range ? <Badge tone="warn">{range}</Badge> : <Badge>{c.always}</Badge>}
                    {item.weekdays.length > 0 && (
                      <Badge>
                        {item.weekdays
                          .map((d) => t.weekday[d as 1 | 2 | 3 | 4 | 5 | 6 | 7])
                          .join('・')}
                      </Badge>
                    )}
                  </div>
                </div>
                {/* 注意事項に見出しはない。本文の頭で、どれかを示す。 */}
                <BulkCheck id={item.id} label={shortBody(item.body)}>
                  <form action={deleteCaution}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="facility_id" value={facilityId} />
                    <DeleteButton
                      name={shortBody(item.body)}
                      labels={{
                        heading: t.common.deleteHeading,
                        confirm: t.common.deleteOneConfirm,
                        noUndo: t.common.noUndo,
                        delete: t.common.delete,
                        cancel: t.common.cancel,
                      }}
                      label={t.common.delete}
                    />
                  </form>
                </BulkCheck>
              </li>
            );
          })}
        </ul>
        </BulkDelete>
      )}

      {!open ? (
        <Button variant="ghost" onClick={() => setOpen(true)} className="!px-0">
          {c.add}
        </Button>
      ) : (
        <form
          action={formAction}
          className="space-y-4 rounded-lg border border-border bg-surface-2 p-4"
        >
          <input type="hidden" name="entry_point_id" value={entryPointId} />
          <input type="hidden" name="facility_id" value={facilityId} />

          {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}

          <Field label={c.body} required error={state.errors?.body}>
            <textarea
              name="body"
              rows={2}
              required
              className={inputClass}
              placeholder={c.bodyPlaceholder}
            />
          </Field>

          {/*
            時間帯を本文に埋め込まず独立した項目として持つことで、
            アプリ側が「今この瞬間に該当する注意事項」だけを強調表示できる。
            運転中に読む情報量を減らすことが安全に直結する。
          */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={c.severity}>
              <select name="severity" defaultValue="warn" className={inputClass}>
                <option value="info">{c.severityInfo}</option>
                <option value="warn">{c.severityWarn}</option>
                <option value="critical">{c.severityCritical}</option>
              </select>
            </Field>

            <Field label={c.timeFrom} error={state.errors?.time_from}>
              <input type="time" name="time_from" className={inputClass} />
            </Field>

            <Field label={c.timeTo}>
              <input type="time" name="time_to" className={inputClass} />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">{c.weekdays}</p>
            <p className="mb-2 text-xs text-text-faint">{c.weekdaysHint}</p>
            <div className="flex flex-wrap gap-3">
              {([1, 2, 3, 4, 5, 6, 7] as const).map((d) => (
                <label key={d} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={d}
                    className="size-4 accent-[var(--c-accent)]"
                  />
                  {t.weekday[d]}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? t.common.saving : t.common.add}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
