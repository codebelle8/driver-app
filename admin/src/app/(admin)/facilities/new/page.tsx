import { createFacility } from '@/app/actions/facilities';
import { FacilityForm } from '@/components/facility-form';
import { Alert, PageHeader } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function NewFacilityPage() {
  await requireStaff();
  const t = await getDictionary();
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.facilityForm.newTitle}
        description={t.facilityForm.newDescription}
      />

      <Alert tone="info">{t.facilityForm.newNotice}</Alert>

      <FacilityForm
        action={createFacility}
        categories={categories ?? []}
        submitLabel={t.facilityForm.submitCreate}
        t={t}
      />
    </div>
  );
}
