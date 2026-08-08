'use client';

import { useActionState, useState } from 'react';

import { saveEntryPoint } from '@/app/actions/entry-points';
import type { ActionState } from '@/app/actions/facilities';
import { Alert, Button, Field, inputClass } from '@/components/ui';
import { ENTRY_POINT_KIND_LABEL } from '@/lib/supabase/database.types';
import type { EntryPoint, EntryPointKind } from '@/lib/supabase/database.types';

const KINDS = Object.keys(ENTRY_POINT_KIND_LABEL) as EntryPointKind[];

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
}: {
  facilityId: string;
  entryPoint?: EntryPoint;
  suggestedCode?: string;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveEntryPoint,
    {},
  );
  const err = (key: string) => state.errors?.[key];

  if (state.ok && onDone) {
    // 保存が完了したら入力欄を閉じる
    queueMicrotask(onDone);
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="facility_id" value={facilityId} />
      {entryPoint && <input type="hidden" name="id" value={entryPoint.id} />}

      {state.message && (
        <Alert tone={state.ok ? 'ok' : 'danger'}>{state.message}</Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-[100px_180px_1fr]">
        <Field
          label="入口記号"
          required
          hint="写真のファイル名と対応します"
          error={err('code')}
        >
          <input
            name="code"
            defaultValue={entryPoint?.code ?? suggestedCode ?? 'A'}
            maxLength={1}
            required
            className={`${inputClass} text-center font-bold uppercase`}
          />
        </Field>

        <Field label="区分" required error={err('kind')}>
          <select
            name="kind"
            defaultValue={entryPoint?.kind ?? 'dropoff'}
            className={inputClass}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {ENTRY_POINT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="名称" required error={err('name')}>
          <input
            name="name"
            defaultValue={entryPoint?.name}
            required
            className={inputClass}
            placeholder="正面車寄せ（メインポーチ）"
          />
        </Field>
      </div>

      <Field
        label="進入方法の説明"
        hint="ドライバーに話しかけるつもりで書いてください"
        error={err('approach_text')}
      >
        <textarea
          name="approach_text"
          defaultValue={entryPoint?.approach_text ?? ''}
          rows={3}
          className={inputClass}
          placeholder="海岸通り側から進入し、スロープを上がって2階レベルの車寄せへ。乗降は一番奥のレーンをご利用ください。"
        />
      </Field>

      <Field
        label="進入元の道路・方向"
        hint="ナビが正しい側から到着するために重要です"
        error={err('approach_from')}
      >
        <input
          name="approach_from"
          defaultValue={entryPoint?.approach_from ?? ''}
          className={inputClass}
          placeholder="海岸通り（北行き）から"
        />
      </Field>

      {/*
        座標が2組ある理由:
        建物の代表地点にナビすると反対側から到着する経路が案内されることがあり、
        一方通行や中央分離帯があると入り直しに数分かかる。
        ナビには進入レーン上の地点を渡し、画面には停車位置を出す。
      */}
      <div className="rounded-lg border border-border-strong bg-surface-2 p-4">
        <p className="mb-1 text-sm font-medium">ナビ投入座標</p>
        <p className="mb-4 text-xs text-text-faint">
          建物の中心ではなく、<strong className="text-text-muted">車寄せに入るために曲がる地点</strong>
          （進入レーンの入口）を指定してください。ここがこのアプリの価値の中心です。
          PC版 Google マップで地点を右クリック → 一番上の数値をクリックするとコピーできます。
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ナビ緯度" error={err('nav_lat')}>
            <input
              name="nav_lat"
              defaultValue={entryPoint?.nav_lat ?? ''}
              className={`${inputClass} tabular`}
              placeholder="35.6656"
            />
          </Field>
          <Field label="ナビ経度" error={err('nav_lng')}>
            <input
              name="nav_lng"
              defaultValue={entryPoint?.nav_lng ?? ''}
              className={`${inputClass} tabular`}
              placeholder="139.7604"
            />
          </Field>
        </div>

        <p className="mb-1 mt-5 text-sm font-medium">停車位置座標</p>
        <p className="mb-4 text-xs text-text-faint">
          進入地点と実際の停車位置が離れている場合のみ入力してください。
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="停車位置 緯度" error={err('dropoff_lat')}>
            <input
              name="dropoff_lat"
              defaultValue={entryPoint?.dropoff_lat ?? ''}
              className={`${inputClass} tabular`}
            />
          </Field>
          <Field label="停車位置 経度" error={err('dropoff_lng')}>
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
          label="高さ制限 (cm)"
          hint="ハイヤー・ワゴンの可否判断に使います"
          error={err('height_limit_cm')}
        >
          <input
            name="height_limit_cm"
            defaultValue={entryPoint?.height_limit_cm ?? ''}
            className={`${inputClass} tabular`}
            placeholder="380"
          />
        </Field>

        <Field label="屋根">
          <select
            name="is_roofed"
            defaultValue={triValue(entryPoint?.is_roofed)}
            className={inputClass}
          >
            <option value="">未確認</option>
            <option value="true">あり</option>
            <option value="false">なし</option>
          </select>
        </Field>

        <Field label="24時間利用">
          <select
            name="is_24h"
            defaultValue={triValue(entryPoint?.is_24h)}
            className={inputClass}
          >
            <option value="">未確認</option>
            <option value="true">可</option>
            <option value="false">不可</option>
          </select>
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={entryPoint?.is_active ?? true}
          className="size-4 accent-[#f0b429]"
        />
        <span>この入口を有効にする</span>
        <span className="text-xs text-text-faint">
          （一時閉鎖中はチェックを外すとアプリに表示されません）
        </span>
      </label>

      <Field label="管理用メモ" hint="アプリには表示されません">
        <input
          name="note_internal"
          defaultValue={entryPoint?.note_internal ?? ''}
          className={inputClass}
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? '保存しています…' : entryPoint ? '変更を保存' : '入口を追加'}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            閉じる
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
}: {
  facilityId: string;
  suggestedCode: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        入口・車寄せを追加
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-surface p-5">
      <h3 className="mb-4 font-semibold">入口・車寄せを追加</h3>
      <EntryPointEditor
        facilityId={facilityId}
        suggestedCode={suggestedCode}
        onDone={() => setOpen(false)}
      />
    </div>
  );
}
