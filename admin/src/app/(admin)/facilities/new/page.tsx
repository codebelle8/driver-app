import { createFacility } from '@/app/actions/facilities';
import { FacilityForm } from '@/components/facility-form';
import { Alert, PageHeader } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function NewFacilityPage() {
  await requireStaff();
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order');

  return (
    <div className="space-y-6">
      <PageHeader
        title="施設を新規登録"
        description="施設コードはカテゴリに応じて自動採番されます"
      />

      <Alert tone="info">
        入口・車寄せの情報と写真は、この施設を保存したあとに登録できます。
        分かっている範囲だけ入力して保存して問題ありません。
      </Alert>

      <FacilityForm
        action={createFacility}
        categories={categories ?? []}
        submitLabel="登録して次へ進む"
      />
    </div>
  );
}
