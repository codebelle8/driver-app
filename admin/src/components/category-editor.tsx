'use client';

import { useActionState, useState } from 'react';

import {
  createCategory,
  deleteCategory,
  moveCategory,
  updateCategory,
} from '@/app/actions/categories';
import type { ActionState } from '@/app/actions/facilities';
import { Alert, Badge, Button, Card, Field, inputClass } from '@/components/ui';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import type { Category } from '@/lib/supabase/database.types';

/**
 * カテゴリの追加・編集・並べ替え。
 *
 * 一覧をそのまま編集させず、行ごとに「編集」で開く形にしている。
 * 6件すべてを常時編集可能にすると、隣の行を触ったつもりで
 * 別のカテゴリを書き換える事故が起きる。
 */
export function CategoryEditor({
  categories,
  usage,
  t,
  from,
  total,
}: {
  categories: Category[];
  /** カテゴリごとの施設数。削除できるかの判断に使う。 */
  usage: Record<string, number>;
  t: Dictionary;
  /** このページの先頭が全体で何番目か（0始まり） */
  from: number;
  /** 全カテゴリ数 */
  total: number;
}) {
  const c = t.categories;
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-muted">
              <th className="px-5 py-3 font-medium">{c.sortOrder}</th>
              <th className="px-5 py-3 font-medium">{c.name}</th>
              <th className="px-5 py-3 font-medium">{c.prefix}</th>
              <th className="px-5 py-3 font-medium">{c.facilityCount}</th>
              <th className="px-5 py-3 font-medium">{c.state}</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {categories.map((cat, i) =>
              editing === cat.id ? (
                <EditRow
                  key={cat.id}
                  category={cat}
                  onDone={() => setEditing(null)}
                  inUse={(usage[cat.id] ?? 0) > 0}
                  t={t}
                />
              ) : (
                <tr key={cat.id}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      <MoveButton
                        id={cat.id}
                        direction="up"
                        disabled={from + i === 0}
                        label={c.moveUp}
                      />
                      <MoveButton
                        id={cat.id}
                        direction="down"
                        disabled={from + i === total - 1}
                        label={c.moveDown}
                      />
                      <span className="tabular ml-1 text-text-faint">{from + i + 1}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-medium">{cat.name}</td>
                  <td className="tabular px-5 py-3 text-text-muted">{cat.code_prefix}</td>
                  <td className="tabular px-5 py-3">
                    {usage[cat.id] ?? 0} {t.common.count}
                  </td>
                  <td className="px-5 py-3">
                    {cat.is_active ? (
                      <Badge tone="accent">{c.active}</Badge>
                    ) : (
                      <Badge>{c.inactive}</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(cat.id)}
                      className="text-xs text-text-muted transition-colors hover:text-accent"
                    >
                      {c.edit}
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </Card>

      <AddForm t={t} />
    </div>
  );
}

/** 並び順を1つ動かすボタン。写真の並べ替えと同じ形にしている。 */
function MoveButton({
  id,
  direction,
  disabled,
  label,
}: {
  id: string;
  direction: 'up' | 'down';
  disabled: boolean;
  label: string;
}) {
  return (
    <form action={moveCategory}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={label}
        title={label}
        className={
          'flex size-6 items-center justify-center rounded border border-border text-text-muted transition-colors ' +
          (disabled ? 'cursor-not-allowed opacity-35' : 'hover:border-accent hover:text-accent')
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

/** 1行ぶんの編集欄。開いている間だけ表に差し替わる。 */
function EditRow({
  category,
  onDone,
  inUse,
  t,
}: {
  category: Category;
  onDone: () => void;
  inUse: boolean;
  t: Dictionary;
}) {
  const c = t.categories;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await updateCategory(prev, formData);
      if (result.ok) onDone();
      return result;
    },
    {},
  );
  const [del, deleteAction, deleting] = useActionState<ActionState, FormData>(
    deleteCategory,
    {},
  );

  return (
    <tr className="bg-surface-2">
      <td colSpan={6} className="px-5 py-4">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={category.id} />

          {state.message && <Alert tone={state.ok ? 'ok' : 'danger'}>{state.message}</Alert>}
          {del.message && <Alert tone={del.ok ? 'ok' : 'danger'}>{del.message}</Alert>}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={c.name} hint={c.nameHint} error={state.errors?.name}>
              <input name="name" defaultValue={category.name} className={inputClass} />
            </Field>

            <Field label={c.prefix} hint={c.prefixHint} error={state.errors?.code_prefix}>
              <input
                name="code_prefix"
                defaultValue={category.code_prefix}
                className={inputClass}
              />
            </Field>

            <Field label={c.code} hint={c.codeHint}>
              {/* 識別子は変えられない。既存の施設コードとの対応が追えなくなるため。 */}
              <input
                value={category.code}
                readOnly
                disabled
                className={`${inputClass} cursor-not-allowed opacity-60`}
              />
            </Field>
          </div>

          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={category.is_active}
              className="size-4 accent-accent"
            />
            {c.activeLabel}
          </label>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? c.saving : c.save}
            </Button>
            <button
              type="button"
              onClick={onDone}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {c.cancel}
            </button>

            <span className="flex-1" />

            {/*
              施設が紐づいている間は削除させない。
              外部キーが on delete restrict のため DB でも弾かれるが、
              そのときの文言は利用者に伝わらない。
            */}
            <button
              type="submit"
              formAction={deleteAction}
              disabled={deleting || inUse}
              title={inUse ? c.inUseHint : c.delete}
              onClick={(e) => {
                if (!confirm(c.deleteConfirm)) e.preventDefault();
              }}
              className={
                'text-xs transition-colors ' +
                (inUse
                  ? 'cursor-not-allowed text-text-faint opacity-50'
                  : 'text-text-faint hover:text-danger')
              }
            >
              {c.delete}
            </button>
          </div>

          {inUse && <p className="text-xs text-text-faint">{c.inUseHint}</p>}
        </form>
      </td>
    </tr>
  );
}

/** 新しいカテゴリを足す欄 */
function AddForm({ t }: { t: Dictionary }) {
  const c = t.categories;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createCategory,
    {},
  );

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold">{c.add}</h2>
      <form action={formAction} className="space-y-3">
        {state.message && <Alert tone={state.ok ? 'ok' : 'danger'}>{state.message}</Alert>}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={c.name} hint={c.nameHint} error={state.errors?.name}>
            <input name="name" required className={inputClass} placeholder="ホテル" />
          </Field>

          <Field label={c.prefix} hint={c.prefixHint} error={state.errors?.code_prefix}>
            <input name="code_prefix" required className={inputClass} placeholder="HTL" />
          </Field>

          <Field label={c.code} hint={c.codeHint} error={state.errors?.code}>
            <input name="code" required className={inputClass} placeholder="hotel" />
          </Field>
        </div>

        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? c.adding : c.add}
        </Button>
      </form>
    </Card>
  );
}
