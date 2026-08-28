'use client';

import Image from 'next/image';
import { useActionState, useRef, useState } from 'react';

import type { ActionState } from '@/app/actions/facilities';
import { deletePhoto, movePhoto, replacePhoto, uploadPhoto } from '@/app/actions/photos';
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
  readOnly = false,
  t,
}: {
  facilityId: string;
  entryPointId: string;
  photos: Photo[];
  /** 公開済みの施設を調査員が見ている場合など、閲覧だけ許すとき */
  readOnly?: boolean;
  t: Dictionary;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    uploadPhoto,
    {},
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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
          {photos.map((photo, i) => (
            <li
              key={photo.id}
              className="overflow-hidden rounded-lg border border-border bg-surface-2"
            >
              <div className="relative aspect-[4/3] bg-bg">
                {/* 何番目に出るかを示す。並べ替えた結果が一目で分かるように。 */}
                <span className="absolute left-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-bg/85 text-[11px] font-bold tabular-nums text-text">
                  {i + 1}
                </span>
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
                {!readOnly && (
                  <div className="flex items-center justify-between gap-1 pt-0.5">
                    <div className="flex items-center gap-0.5">
                      <MoveButton
                        photoId={photo.id}
                        facilityId={facilityId}
                        direction="up"
                        disabled={i === 0}
                        label={p.moveUp}
                      />
                      <MoveButton
                        photoId={photo.id}
                        facilityId={facilityId}
                        direction="down"
                        disabled={i === photos.length - 1}
                        label={p.moveDown}
                      />
                      <ReplaceButton
                        photoId={photo.id}
                        facilityId={facilityId}
                        label={p.replace}
                      />
                    </div>
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
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
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
          {/*
            枠の上へ落としても登録できるようにする。
            現地で撮った写真をまとめて扱う際、毎回「選択」を開くのは手数が多い。
            落とした内容は input へ移し替えるため、送信の経路は選択時と同じ。
          */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (!dropped || !fileRef.current) return;
              fileRef.current.files = e.dataTransfer.files;
              setFileName(dropped.name);
            }}
            className={
              'rounded-lg border-2 border-dashed p-3 transition-colors ' +
              (dragging ? 'border-accent bg-accent-soft' : 'border-border')
            }
          >
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="w-full text-sm text-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-text hover:file:bg-border"
            />
            <p className="mt-2 text-xs text-text-faint">{p.dropHint}</p>
          </div>
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
      )}
    </div>
  );
}

/**
 * 順番を1つ動かすボタン。
 *
 * つかんで動かす方式にしていない理由:
 *   管理画面はタッチ端末でも開かれる。つかんで動かす操作は、
 *   指では画面ごとスクロールしてしまい狙った位置に落とせない。
 *   また、キーボードだけでは操作できなくなる。
 *   1つずつ動かす方式なら、どの入力手段でも同じように扱える。
 */
function MoveButton({
  photoId,
  facilityId,
  direction,
  disabled,
  label,
}: {
  photoId: string;
  facilityId: string;
  direction: 'up' | 'down';
  disabled: boolean;
  label: string;
}) {
  return (
    <form action={movePhoto}>
      <input type="hidden" name="id" value={photoId} />
      <input type="hidden" name="facility_id" value={facilityId} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={label}
        title={label}
        className={
          'flex size-6 items-center justify-center rounded border border-border text-text-muted transition-colors ' +
          (disabled
            ? 'cursor-not-allowed opacity-35'
            : 'hover:border-accent hover:text-accent')
        }
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={direction === 'down' ? { transform: 'rotate(180deg)' } : undefined}
        >
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>
    </form>
  );
}

/**
 * 画像だけを入れ替えるボタン。
 *
 * ファイルを選んだ時点で送る。「選ぶ」と「送る」を分けると、
 * 150施設ぶんの入れ替えで操作が倍になる。
 */
function ReplaceButton({
  photoId,
  facilityId,
  label,
}: {
  photoId: string;
  facilityId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(replacePhoto, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="contents">
      <input type="hidden" name="id" value={photoId} />
      <input type="hidden" name="facility_id" value={facilityId} />
      <label
        title={state.errors?.file ?? state.message ?? label}
        /*
          relative が要る。中の sr-only は position:absolute のため、
          位置の基準になる先祖が無いと body を基準に置かれ、
          main の overflow では抑えられなくなる。
          その結果ページ全体が伸び、スクロールバーが二重に出る。
        */
        className={
          'relative flex size-6 cursor-pointer items-center justify-center rounded border border-border text-text-muted transition-colors hover:border-accent hover:text-accent ' +
          (pending ? 'pointer-events-none opacity-50' : '')
        }
      >
        <span className="sr-only">{label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) formRef.current?.requestSubmit();
          }}
        />
      </label>
    </form>
  );
}
