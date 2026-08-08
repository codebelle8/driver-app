'use client';

import { useActionState } from 'react';

import { Alert, Button, Card, Field, inputClass } from '@/components/ui';
import type { ActionState } from '@/app/actions/facilities';
import type { Category, Facility } from '@/lib/supabase/database.types';

export function FacilityForm({
  action,
  categories,
  facility,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  categories: Pick<Category, 'id' | 'name'>[];
  facility?: Facility;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const err = (key: string) => state.errors?.[key];

  return (
    <form action={formAction} className="space-y-6">
      {facility && <input type="hidden" name="id" value={facility.id} />}

      {state.message && (
        <Alert tone={state.ok ? 'ok' : 'danger'}>{state.message}</Alert>
      )}

      <Card className="space-y-5">
        <h2 className="text-sm font-semibold text-text-muted">基本情報</h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="施設名" required error={err('name')}>
            <input
              name="name"
              defaultValue={facility?.name}
              required
              className={inputClass}
              placeholder="グランドホテル汐留"
            />
          </Field>

          <Field
            label="施設名（かな）"
            required
            hint="検索に使用します。ひらがな・カタカナどちらでも可"
            error={err('name_kana')}
          >
            <input
              name="name_kana"
              defaultValue={facility?.name_kana}
              required
              className={inputClass}
              placeholder="ぐらんどほてるしおどめ"
            />
          </Field>
        </div>

        <Field
          label="別名・略称"
          hint="ドライバーが口頭で言う呼び方。複数ある場合は「;」で区切ってください。検索の精度に直結します"
          error={err('aliases')}
        >
          <input
            name="aliases"
            defaultValue={facility?.aliases?.join('; ')}
            className={inputClass}
            placeholder="汐留グランド; GHS"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="カテゴリ" required error={err('category_id')}>
            <select
              name="category_id"
              defaultValue={facility?.category_id ?? ''}
              required
              className={inputClass}
            >
              <option value="" disabled>
                選択してください
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="公開状態" error={err('status')}>
            <select
              name="status"
              defaultValue={facility?.status ?? 'draft'}
              className={inputClass}
            >
              <option value="draft">下書き（アプリに表示されません）</option>
              <option value="published">公開中</option>
              <option value="archived">非表示</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-5">
        <h2 className="text-sm font-semibold text-text-muted">所在地</h2>

        <div className="grid gap-5 sm:grid-cols-[160px_1fr_1fr]">
          <Field label="郵便番号" error={err('postal_code')}>
            <input
              name="postal_code"
              defaultValue={facility?.postal_code ?? ''}
              className={inputClass}
              placeholder="105-0021"
            />
          </Field>

          <Field label="都道府県" required error={err('prefecture')}>
            <input
              name="prefecture"
              defaultValue={facility?.prefecture}
              required
              className={inputClass}
              placeholder="東京都"
            />
          </Field>

          <Field label="市区町村" error={err('city')}>
            <input
              name="city"
              defaultValue={facility?.city ?? ''}
              className={inputClass}
              placeholder="港区"
            />
          </Field>
        </div>

        <Field label="住所" required hint="町名・番地・建物名" error={err('address_line')}>
          <input
            name="address_line"
            defaultValue={facility?.address_line}
            required
            className={inputClass}
            placeholder="東新橋1-8-2"
          />
        </Field>

        <Field
          label="施設概要"
          hint="アプリの施設詳細に表示されます。2〜3行程度"
          error={err('summary')}
        >
          <textarea
            name="summary"
            defaultValue={facility?.summary ?? ''}
            rows={3}
            className={inputClass}
            placeholder="地上38階の大型シティホテル。正面車寄せは屋根付きで、深夜も警備員が常駐しています。"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="代表地点の緯度"
            hint="地図の初期表示に使います。ナビの目的地には使いません"
            error={err('lat')}
          >
            <input
              name="lat"
              defaultValue={facility?.lat ?? ''}
              className={`${inputClass} tabular`}
              placeholder="35.6656"
            />
          </Field>

          <Field label="代表地点の経度" error={err('lng')}>
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
        <h2 className="text-sm font-semibold text-text-muted">管理用メモ</h2>
        <Field label="メモ" hint="アプリには表示されません" error={err('note_internal')}>
          <textarea
            name="note_internal"
            defaultValue={facility?.note_internal ?? ''}
            rows={2}
            className={inputClass}
            placeholder="コンシェルジュ対応あり。撮影は管理室へ要連絡。"
          />
        </Field>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? '保存しています…' : submitLabel}
        </Button>
        {state.ok && <span className="text-sm text-ok">保存しました</span>}
      </div>
    </form>
  );
}
