'use client';

import { useActionState, useState } from 'react';

import { deleteCaution, saveCaution } from '@/app/actions/entry-points';
import type { ActionState } from '@/app/actions/facilities';
import { Alert, Badge, Button, Field, inputClass } from '@/components/ui';
import { CAUTION_SEVERITY_LABEL, WEEKDAY_LABEL } from '@/lib/supabase/database.types';
import type { Caution } from '@/lib/supabase/database.types';

function timeRangeLabel(c: Caution): string | null {
  if (!c.time_from || !c.time_to) return null;
  return `${c.time_from.slice(0, 5)}〜${c.time_to.slice(0, 5)}`;
}

export function CautionEditor({
  facilityId,
  entryPointId,
  cautions,
}: {
  facilityId: string;
  entryPointId: string;
  cautions: Caution[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveCaution,
    {},
  );
  const [open, setOpen] = useState(false);

  if (state.ok && open) queueMicrotask(() => setOpen(false));

  return (
    <div className="space-y-3">
      {cautions.length > 0 && (
        <ul className="space-y-2">
          {cautions.map((c) => {
            const range = timeRangeLabel(c);
            return (
              <li
                key={c.id}
                className="flex items-start gap-3 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{c.body}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={c.severity === 'critical' ? 'warn' : 'default'}>
                      {CAUTION_SEVERITY_LABEL[c.severity]}
                    </Badge>
                    {range ? (
                      <Badge tone="warn">{range}</Badge>
                    ) : (
                      <Badge>常時</Badge>
                    )}
                    {c.weekdays.length > 0 && (
                      <Badge>{c.weekdays.map((d) => WEEKDAY_LABEL[d]).join('・')}</Badge>
                    )}
                  </div>
                </div>
                <form action={deleteCaution}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="facility_id" value={facilityId} />
                  <button
                    type="submit"
                    className="text-xs text-text-faint transition-colors hover:text-danger"
                  >
                    削除
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      {!open ? (
        <Button variant="ghost" onClick={() => setOpen(true)} className="!px-0">
          + 注意事項を追加
        </Button>
      ) : (
        <form
          action={formAction}
          className="space-y-4 rounded-lg border border-border bg-surface-2 p-4"
        >
          <input type="hidden" name="entry_point_id" value={entryPointId} />
          <input type="hidden" name="facility_id" value={facilityId} />

          {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}

          <Field label="本文" required error={state.errors?.body}>
            <textarea
              name="body"
              rows={2}
              required
              className={inputClass}
              placeholder="17〜20時は送迎バスが停車するため手前のレーンは通過できません。"
            />
          </Field>

          {/*
            時間帯を本文に埋め込まず独立した項目として持つことで、
            アプリ側が「今この瞬間に該当する注意事項」だけを強調表示できる。
            運転中に読む情報量を減らすことが安全に直結する。
          */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="重要度">
              <select name="severity" defaultValue="warn" className={inputClass}>
                <option value="info">情報</option>
                <option value="warn">注意</option>
                <option value="critical">重要（常に強調表示）</option>
              </select>
            </Field>

            <Field label="開始時刻" error={state.errors?.time_from}>
              <input type="time" name="time_from" className={inputClass} />
            </Field>

            <Field label="終了時刻">
              <input type="time" name="time_to" className={inputClass} />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">適用曜日</p>
            <p className="mb-2 text-xs text-text-faint">
              指定しない場合は全曜日に適用されます
            </p>
            <div className="flex flex-wrap gap-3">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <label key={d} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={d}
                    className="size-4 accent-[#f0b429]"
                  />
                  {WEEKDAY_LABEL[d]}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? '保存中…' : '追加'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
