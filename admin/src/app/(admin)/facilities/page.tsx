import Link from 'next/link';

import { Badge, Card, EmptyState, LinkButton, PageHeader, StatusBadge, inputClass } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { PublishStatus } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

/**
 * 検索語を、施設の search_text と同じ規則で正規化する。
 * DB 側のトリガと揃えないと「シオドメ」で引けない。
 * （DB: public.normalize_search_text）
 */
const KATAKANA = 'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロワヲンー';
const HIRAGANA = 'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろわをんー';

function normalize(input: string): string {
  let out = '';
  for (const ch of input) {
    const i = KATAKANA.indexOf(ch);
    out += i >= 0 ? HIRAGANA[i] : ch;
  }
  return out.toLowerCase();
}

export default async function FacilitiesPage({
  searchParams,
}: PageProps<'/facilities'>) {
  await requireStaff();
  const params = await searchParams;

  const q = typeof params.q === 'string' ? params.q : '';
  const categoryId = typeof params.category === 'string' ? params.category : '';
  const status = typeof params.status === 'string' ? params.status : '';

  const supabase = await createClient();

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, code_prefix')
    .eq('is_active', true)
    .order('sort_order');

  let query = supabase
    .from('facilities')
    .select('id, code, name, name_kana, address_line, status, category_id, updated_at')
    .order('code');

  if (q.trim()) query = query.like('search_text', `%${normalize(q.trim())}%`);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (status) query = query.eq('status', status as PublishStatus);

  const { data: facilities, error } = await query;

  // 入口の件数をまとめて取得し、一覧に表示する
  const ids = (facilities ?? []).map((f) => f.id);
  const { data: entryPoints } = ids.length
    ? await supabase.from('entry_points').select('facility_id').in('facility_id', ids)
    : { data: [] };

  const entryCount = new Map<string, number>();
  for (const ep of entryPoints ?? []) {
    entryCount.set(ep.facility_id, (entryCount.get(ep.facility_id) ?? 0) + 1);
  }

  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="施設一覧"
        description={`${facilities?.length ?? 0} 件を表示しています`}
        actions={<LinkButton href="/facilities/new">施設を新規登録</LinkButton>}
      />

      <Card>
        <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="施設名・かな・別名・住所で検索"
            className={inputClass}
          />
          <select name="category" defaultValue={categoryId} className={inputClass}>
            <option value="">すべてのカテゴリ</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status} className={inputClass}>
            <option value="">すべての状態</option>
            <option value="draft">下書き</option>
            <option value="published">公開中</option>
            <option value="archived">非表示</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-text hover:bg-accent-hover"
          >
            絞り込む
          </button>
        </form>
      </Card>

      {error && (
        <Card>
          <p className="text-sm text-danger">読み込みに失敗しました: {error.message}</p>
        </Card>
      )}

      {!facilities?.length ? (
        <EmptyState
          title={q || categoryId || status ? '該当する施設がありません' : 'まだ施設が登録されていません'}
          description={
            q || categoryId || status
              ? '検索条件を変えてお試しください。別名でも検索できます。'
              : '「施設を新規登録」から最初の施設を追加してください。写真や座標は後からでも追加できます。'
          }
          action={
            !(q || categoryId || status) && (
              <LinkButton href="/facilities/new">施設を新規登録</LinkButton>
            )
          }
        />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-border">
            {facilities.map((f) => {
              const count = entryCount.get(f.id) ?? 0;
              return (
                <li key={f.id}>
                  <Link
                    href={`/facilities/${f.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-surface-2"
                  >
                    <span className="tabular w-24 shrink-0 text-xs text-text-faint">
                      {f.code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.name}</p>
                      <p className="truncate text-xs text-text-muted">{f.address_line}</p>
                    </div>
                    <Badge>{categoryName.get(f.category_id) ?? '—'}</Badge>
                    <Badge tone={count === 0 ? 'warn' : 'teal'}>
                      入口 {count} か所
                    </Badge>
                    <StatusBadge status={f.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
