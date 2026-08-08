'use client';

import Image from 'next/image';
import { useActionState, useState } from 'react';

import type { ActionState } from '@/app/actions/facilities';
import { deletePhoto, uploadPhoto } from '@/app/actions/photos';
import { Alert, Badge, Button, Field, inputClass } from '@/components/ui';
import { thumbUrlOf } from '@/lib/photos';
import { PHOTO_KIND_LABEL } from '@/lib/supabase/database.types';
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
}: {
  facilityId: string;
  entryPointId: string;
  photos: Photo[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    uploadPhoto,
    {},
  );
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {photos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
          写真がまだありません。
          <br />
          <span className="text-xs text-text-faint">
            写真が無くても保存できます。文章と座標が正しければ、ドライバーには既に十分な価値があります。
          </span>
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
                  alt={photo.caption ?? PHOTO_KIND_LABEL[photo.kind]}
                  fill
                  sizes="200px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="space-y-1.5 p-2.5">
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone={photo.kind === 'diagram' ? 'accent' : 'default'}>
                    {PHOTO_KIND_LABEL[photo.kind]}
                  </Badge>
                  {photo.is_placeholder && <Badge tone="warn">仮画像</Badge>}
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
                    削除
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
        <input type="hidden" name="facility_id" value={facilityId} />
        <input type="hidden" name="entry_point_id" value={entryPointId} />

        {state.message && (
          <Alert tone={state.ok ? 'ok' : 'danger'}>{state.message}</Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <Field label="種類">
            <select name="kind" defaultValue="dropoff" className={inputClass}>
              {ENTRY_PHOTO_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PHOTO_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="キャプション" hint="アプリの写真下に表示されます">
            <input
              name="caption"
              className={inputClass}
              placeholder="正面車寄せ（夜間）"
            />
          </Field>
        </div>

        <Field
          label="画像ファイル"
          hint="長辺1600px以上を推奨。アップロード時に自動で圧縮・リサイズされます"
          error={state.errors?.file}
        >
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            required
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="w-full text-sm text-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-text hover:file:bg-border"
          />
        </Field>

        {fileName && <p className="text-xs text-text-faint">選択中: {fileName}</p>}

        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? 'アップロードしています…' : '写真を追加'}
        </Button>
      </form>
    </div>
  );
}
