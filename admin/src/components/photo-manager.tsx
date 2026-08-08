'use client';

import Image from 'next/image';
import { useActionState, useState } from 'react';

import type { ActionState } from '@/app/actions/facilities';
import { deletePhoto, uploadPhoto } from '@/app/actions/photos';
import { Alert, Badge, Button, Field, inputClass } from '@/components/ui';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { thumbUrlOf } from '@/lib/photos';
import type { Photo, PhotoKind } from '@/lib/supabase/database.types';

/** 入口に紐づく写真で使う種類。外観は施設単位のため除く。 */
const ENTRY_PHOTO_KINDS: PhotoKind[] = [
  'approach',
  'dropoff',
  'entrance',
  'night',
  'diagram',
  'other',
];

export function PhotoManager({
  facilityId,
  entryPointId,
  photos,
  t,
}: {
  facilityId: string;
  entryPointId: string;
  photos: Photo[];
  t: Dictionary;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    uploadPhoto,
    {},
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const p = t.photo;

  return (
    <div className="space-y-4">
      {photos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
          {p.empty}
          <br />
          <span className="text-xs text-text-faint">{p.emptyHint}</span>
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="overflow-hidden rounded-lg border border-border bg-surface-2"
            >
              <div className="relative aspect-[4/3] bg-bg">
                <Image
                  src={thumbUrlOf(photo.storage_path)}
                  alt={photo.caption ?? t.photoKind[photo.kind]}
                  fill
                  sizes="200px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="space-y-1.5 p-2.5">
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone={photo.kind === 'diagram' ? 'accent' : 'default'}>
                    {t.photoKind[photo.kind]}
                  </Badge>
                  {photo.is_placeholder && <Badge tone="warn">{p.placeholder}</Badge>}
                </div>
                {photo.caption && (
                  <p className="truncate text-xs text-text-muted">{photo.caption}</p>
                )}
                <form action={deletePhoto}>
                  <input type="hidden" name="id" value={photo.id} />
                  <input type="hidden" name="facility_id" value={facilityId} />
                  <button
                    type="submit"
                    className="text-xs text-text-faint transition-colors hover:text-danger"
                  >
                    {t.common.delete}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        action={formAction}
        className="space-y-3 rounded-lg border border-border bg-surface-2 p-4"
      >
        <input type="hidden" name="facility_id" value={facilityId} />
        <input type="hidden" name="entry_point_id" value={entryPointId} />

        {state.message && <Alert tone={state.ok ? 'ok' : 'danger'}>{state.message}</Alert>}

        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <Field label={p.kind}>
            <select name="kind" defaultValue="dropoff" className={inputClass}>
              {ENTRY_PHOTO_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t.photoKind[k]}
                </option>
              ))}
            </select>
          </Field>

          <Field label={p.caption} hint={p.captionHint}>
            <input name="caption" className={inputClass} />
          </Field>
        </div>

        <Field label={p.file} hint={p.fileHint} error={state.errors?.file}>
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            required
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="w-full text-sm text-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-text hover:file:bg-border"
          />
        </Field>

        {fileName && (
          <p className="text-xs text-text-faint">
            {p.selected}: {fileName}
          </p>
        )}

        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? p.uploading : p.upload}
        </Button>
      </form>
    </div>
  );
}
