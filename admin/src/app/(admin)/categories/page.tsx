import { Badge, Card, PageHeader } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  await requireStaff();
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
      <PageHeader
        title="カテゴリ"
        description="アプリの絞り込みチップに、この順序で表示されます"
      />

      <Card className="!p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-muted">
              <th className="px-5 py-3 font-medium">表示順</th>
              <th className="px-5 py-3 font-medium">カテゴリ名</th>
              <th className="px-5 py-3 font-medium">施設コード接頭辞</th>
              <th className="px-5 py-3 font-medium">登録施設数</th>
              <th className="px-5 py-3 font-medium">状態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(categories ?? []).map((c) => (
              <tr key={c.id}>
                <td className="tabular px-5 py-3 text-text-muted">{c.sort_order}</td>
                <td className="px-5 py-3 font-medium">{c.name}</td>
                <td className="tabular px-5 py-3 text-text-muted">{c.code_prefix}</td>
                <td className="tabular px-5 py-3">{usage.get(c.id) ?? 0} 件</td>
                <td className="px-5 py-3">
                  {c.is_active ? <Badge tone="teal">有効</Badge> : <Badge>無効</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">接頭辞について</h2>
        <p className="text-sm text-text-muted">
          接頭辞は施設コード（<span className="tabular">HTL-0001</span>）の採番と、
          写真ファイル名の規則に使われます。
          <strong className="text-text">
            一度データを登録したあとに変更すると、入稿済みの写真との対応が崩れます。
          </strong>
        </p>
        <p className="mt-3 text-sm text-text-muted">
          カテゴリの追加・並べ替えの機能は、次の工程（管理画面②）で実装します。
        </p>
      </Card>
    </div>
  );
}
