'use client';

import { useActionState, useState } from 'react';

import { saveEntryPoint } from '@/app/actions/entry-points';
import type { ActionState } from '@/app/actions/facilities';
import { PlusIcon } from '@/components/icons';
import { Alert, Button, Field, inputClass } from '@/components/ui';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import type { EntryPoint, EntryPointKind } from '@/lib/supabase/database.types';

const KINDS: EntryPointKind[] = [
  'dropoff',
  'entrance',
  'parking_entrance',
  'bus_stop',
  'service',
];

function triValue(v: boolean | null | undefined): string {
  if (v === true) return 'true';
  if (v === false) return 'false';
  return '';
}

export function EntryPointEditor({
  facilityId,
  entryPoint,
  suggestedCode,
  onDone,
  t,
}: {
  facilityId: string;
  entryPoint?: EntryPoint;
  suggestedCode?: string;
  onDone?: () => void;
  t: Dictionary;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveEntryPoint,
    {},
  );
  const err = (key: string) => state.errors?.[key];
  const e = t.entryPoint;

  if (state.ok && onDone) {
    // 保存が完了したら入力欄を閉じる
    queueMicrotask(onDone);
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="facility_id" value={facilityId} />
      {entryPoint && <input type="hidden" name="id" value={entryPoint.id} />}

      {state.message && <Alert tone={state.ok ? 'ok' : 'danger'}>{state.message}</Alert>}

      <div className="grid gap-5 sm:grid-cols-[100px_180px_1fr]">
        <Field label={e.code} required hint={e.codeHint} error={err('code')}>
          <input
            name="code"
            defaultValue={entryPoint?.code ?? suggestedCode ?? 'A'}
            maxLength={1}
            required
            className={`${inputClass} text-center font-bold uppercase`}
          />
        </Field>

        <Field label={e.kind} required error={err('kind')}>
          <select
            name="kind"
            defaultValue={entryPoint?.kind ?? 'dropoff'}
            className={inputClass}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t.kind[k]}
              </option>
            ))}
          </select>
        </Field>

        <Field label={e.name} required error={err('name')}>
          <input
            name="name"
            defaultValue={entryPoint?.name}
            required
            className={inputClass}
            placeholder="正面車寄せ（メインポーチ）"
          />
        </Field>
      </div>

      <Field label={e.approachText} hint={e.approachTextHint} error={err('approach_text')}>
        <textarea
          name="approach_text"
          defaultValue={entryPoint?.approach_text ?? ''}
          rows={3}
          className={inputClass}
        />
      </Field>

      <Field label={e.approachFrom} hint={e.approachFromHint} error={err('approach_from')}>
        <input
          name="approach_from"
          defaultValue={entryPoint?.approach_from ?? ''}
          className={inputClass}
        />
      </Field>

      {/*
        座標が2組ある理由:
        建物の代表地点にナビすると反対側から到着する経路が案内されることがあり、
        一方通行や中央分離帯があると入り直しに数分かかる。
        ナビには進入レーン上の地点を渡し、画面には停車位置を出す。
      */}
      <div className="rounded-lg border border-border-strong bg-surface-2 p-4">
        <p className="mb-1 text-sm font-medium">{e.navTitle}</p>
        <p className="mb-4 text-xs leading-relaxed text-text-faint">{e.navHint}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={e.navLat} error={err('nav_lat')}>
            <input
              name="nav_lat"
              defaultValue={entryPoint?.nav_lat ?? ''}
              className={`${inputClass} tabular`}
              placeholder="35.6656"
            />
          </Field>
          <Field label={e.navLng} error={err('nav_lng')}>
            <input
              name="nav_lng"
              defaultValue={entryPoint?.nav_lng ?? ''}
              className={`${inputClass} tabular`}
              placeholder="139.7604"
            />
          </Field>
        </div>

        <p className="mb-1 mt-5 text-sm font-medium">{e.dropoffTitle}</p>
        <p className="mb-4 text-xs text-text-faint">{e.dropoffHint}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={e.dropoffLat} error={err('dropoff_lat')}>
            <input
              name="dropoff_lat"
              defaultValue={entryPoint?.dropoff_lat ?? ''}
              className={`${inputClass} tabular`}
            />
          </Field>
          <Field label={e.dropoffLng} error={err('dropoff_lng')}>
            <input
              name="dropoff_lng"
              defaultValue={entryPoint?.dropoff_lng ?? ''}
              className={`${inputClass} tabular`}
            />
          </Field>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field
          label={e.heightLimit}
          hint={e.heightLimitHint}
          error={err('height_limit_cm')}
        >
          <input
            name="height_limit_cm"
            defaultValue={entryPoint?.height_limit_cm ?? ''}
            className={`${inputClass} tabular`}
            placeholder="380"
          />
        </Field>

        <Field label={e.roofed}>
          <select
            name="is_roofed"
            defaultValue={triValue(entryPoint?.is_roofed)}
            className={inputClass}
          >
            <option value="">{t.common.unknown}</option>
            <option value="true">{t.common.yes}</option>
            <option value="false">{t.common.no}</option>
          </select>
        </Field>

        <Field label={e.open24h}>
          <select
            name="is_24h"
            defaultValue={triValue(entryPoint?.is_24h)}
            className={inputClass}
          >
            <option value="">{t.common.unknown}</option>
            <option value="true">{t.common.available}</option>
            <option value="false">{t.common.unavailable}</option>
          </select>
        </Field>
      </div>

      <label className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={entryPoint?.is_active ?? true}
          className="size-4 accent-[var(--c-accent)]"
        />
        <span>{e.active}</span>
        <span className="text-xs text-text-faint">{e.activeHint}</span>
      </label>

      <Field label={e.note} hint={t.facilityForm.noteHint}>
        <input
          name="note_internal"
          defaultValue={entryPoint?.note_internal ?? ''}
          className={inputClass}
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t.common.saving : entryPoint ? e.saveEdit : e.saveNew}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            {t.common.close}
          </Button>
        )}
      </div>
    </form>
  );
}

/** 「入口を追加」ボタンと、その場で開くフォーム */
export function AddEntryPointButton({
  facilityId,
  suggestedCode,
  t,
}: {
  facilityId: string;
  suggestedCode: string;
  t: Dictionary;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <PlusIcon width={16} height={16} />
        {t.entryPoint.add}
      </Button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-accent/40 bg-surface p-5">
      <h3 className="font-mincho mb-4 font-semibold">{t.entryPoint.addTitle}</h3>
      <EntryPointEditor
        facilityId={facilityId}
        suggestedCode={suggestedCode}
        onDone={() => setOpen(false)}
        t={t}
      />
    </div>
  );
}
