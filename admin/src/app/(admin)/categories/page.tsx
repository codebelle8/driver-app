import Link from 'next/link';

import { CategoryEditor } from '@/components/category-editor';
import { Badge, Card, PageHeader } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { getDictionary, type Dictionary } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** 1ページに出す件数。施設一覧と揃える。 */
const PAGE_SIZE = 15;

export default async function CategoriesPage({ searchParams }: PageProps<'/categories'>) {
  const staff = await requireStaff();
  const [params, t] = await Promise.all([searchParams, getDictionary()]);
  const page = Math.max(1, Number(params.page) || 1);

  const supabase = await createClient();

  const from = (page - 1) * PAGE_SIZE;

  // 2つの問い合わせは互いに依存しない。順に待つと往復が2回分積み上がる。
  const [categoryResult, facilityResult] = await Promise.all([
    supabase
      .from('categories')
      .select('*', { count: 'exact' })
      .order('sort_order')
      .range(from, from + PAGE_SIZE - 1),
    supabase.from('facilities').select('category_id'),
  ]);

  const categories = categoryResult.data;
  const facilities = facilityResult.data;

  const total = categoryResult.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const usage: Record<string, number> = {};
  for (const f of facilities ?? []) {
    usage[f.category_id] = (usage[f.category_id] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t.categories.title} description={t.categories.description} />

      {/*
        調査員には編集させない。カテゴリはアプリの絞り込みに直結し、
        1つ変えるだけで全ドライバーの見え方が変わる。
        書き込みは行レベル権限でも管理者・編集者に限っている。
      */}
      {staff.profile.role === 'surveyor' ? (
        <ReadOnlyTable categories={categories ?? []} usage={usage} t={t} from={from} />
      ) : (
        <CategoryEditor
          categories={categories ?? []}
          usage={usage}
          t={t}
          /*
            並べ替えの端判定は、表示中のページではなく全体で行う。
            2ページ目の先頭を「これ以上前へ動かせない」と扱うと、
            ページをまたぐ移動ができなくなる。
          */
          from={from}
          total={total}
        />
      )}

      {lastPage > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="ページ送り">
          <PageLink href={page > 2 ? `/categories?page=${page - 1}` : '/categories'} disabled={page <= 1}>
            前へ
          </PageLink>
          <span className="tabular px-3 text-sm text-text-muted">
            {page} / {lastPage}
          </span>
          <PageLink href={`/categories?page=${page + 1}`} disabled={page >= lastPage}>
            次へ
          </PageLink>
        </nav>
      )}

      <Card>
        <h2 className="mb-2 text-sm font-semibold">
          {t.categories.prefixTitle}
        </h2>
        <p className="text-sm leading-relaxed text-text-muted">{t.categories.prefixBody}</p>
        <p className="mt-3 text-sm text-text-muted">{t.categories.prefixNote}</p>
      </Card>
    </div>
  );
}

/**
 * 調査員に見せる表。編集の入口を持たない。
 * 何があるかは知っておく必要があるため、隠さずに出す。
 */
function ReadOnlyTable({
  categories,
  usage,
  t,
  from,
}: {
  categories: { id: string; name: string; code_prefix: string; is_active: boolean }[];
  usage: Record<string, number>;
  t: Dictionary;
  from: number;
}) {
  return (
    <Card className="!p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-muted">
            <th className="px-5 py-3 font-medium">{t.categories.sortOrder}</th>
            <th className="px-5 py-3 font-medium">{t.categories.name}</th>
            <th className="px-5 py-3 font-medium">{t.categories.prefix}</th>
            <th className="px-5 py-3 font-medium">{t.categories.facilityCount}</th>
            <th className="px-5 py-3 font-medium">{t.categories.state}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {categories.map((c, i) => (
            <tr key={c.id}>
              <td className="tabular px-5 py-3 text-text-muted">{from + i + 1}</td>
              <td className="px-5 py-3 font-medium">{c.name}</td>
              <td className="tabular px-5 py-3 text-text-muted">{c.code_prefix}</td>
              <td className="tabular px-5 py-3">
                {usage[c.id] ?? 0} {t.common.count}
              </td>
              <td className="px-5 py-3">
                {c.is_active ? (
                  <Badge tone="accent">{t.categories.active}</Badge>
                ) : (
                  <Badge>{t.categories.inactive}</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** ページ送りのボタン。端では押せないことが見て分かるようにする。 */
function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const base = 'rounded-lg border px-4 py-2 text-sm font-medium transition-colors';

  if (disabled) {
    return (
      <span aria-disabled="true" className={`${base} border-border text-text-faint`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={`${base} border-border text-text hover:border-accent hover:text-accent`}>
      {children}
    </Link>
  );
}
