import { Badge, Card, PageHeader } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  await requireStaff();
  const t = await getDictionary();
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order');

  const { data: facilities } = await supabase.from('facilities').select('category_id');

  const usage = new Map<string, number>();
  for (const f of facilities ?? []) {
    usage.set(f.category_id, (usage.get(f.category_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t.categories.title} description={t.categories.description} />

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
            {(categories ?? []).map((c) => (
              <tr key={c.id}>
                <td className="tabular px-5 py-3 text-text-muted">{c.sort_order}</td>
                <td className="px-5 py-3 font-medium">{c.name}</td>
                <td className="tabular px-5 py-3 text-text-muted">{c.code_prefix}</td>
                <td className="tabular px-5 py-3">
                  {usage.get(c.id) ?? 0} {t.common.count}
                </td>
                <td className="px-5 py-3">
                  {c.is_active ? (
                    <Badge tone="teal">{t.categories.active}</Badge>
                  ) : (
                    <Badge>{t.categories.inactive}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="font-mincho mb-2 text-sm font-semibold">
          {t.categories.prefixTitle}
        </h2>
        <p className="text-sm leading-relaxed text-text-muted">{t.categories.prefixBody}</p>
        <p className="mt-3 text-sm text-text-muted">{t.categories.prefixNote}</p>
      </Card>
    </div>
  );
}
