import Link from 'next/link';
import { notFound } from 'next/navigation';

import { deleteEntryPoint } from '@/app/actions/entry-points';
import {
  checkPublishReadiness,
  setFacilityStatus,
  updateFacility,
} from '@/app/actions/facilities';
import { CautionEditor } from '@/components/caution-editor';
import { AddEntryPointButton, EntryPointEditor } from '@/components/entry-point-editor';
import { FacilityForm } from '@/components/facility-form';
import { PhotoManager } from '@/components/photo-manager';
import { Alert, Badge, Button, Card, PageHeader, StatusBadge } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** A, B, C… のうち未使用の記号を提案する */
function nextCode(used: string[]): string {
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!used.includes(c)) return c;
  }
  return 'Z';
}

export default async function FacilityDetailPage({
  params,
  searchParams,
}: PageProps<'/facilities/[id]'>) {
  await requireStaff();
  const [{ id }, sp, t] = await Promise.all([params, searchParams, getDictionary()]);

  const supabase = await createClient();

  const { data: facility } = await supabase
    .from('facilities')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!facility) notFound();

  const [{ data: categories }, { data: entryPoints }, problems] = await Promise.all([
    supabase.from('categories').select('id, name').eq('is_active', true).order('sort_order'),
    supabase
      .from('entry_points')
      .select('*')
      .eq('facility_id', id)
      .order('sort_order')
      .order('code'),
    checkPublishReadiness(id),
  ]);

  const epIds = (entryPoints ?? []).map((ep) => ep.id);

  const [{ data: photos }, { data: cautions }] = await Promise.all([
    epIds.length
      ? supabase.from('photos').select('*').in('entry_point_id', epIds).order('sort_order')
      : Promise.resolve({ data: [] as never[] }),
    epIds.length
      ? supabase.from('cautions').select('*').in('entry_point_id', epIds).order('sort_order')
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const blockers = problems.filter((p) => !p.startsWith('［警告］'));
  const warnings = problems.filter((p) => p.startsWith('［警告］'));
  const canPublish = blockers.length === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title={facility.name}
        description={`${facility.code} ／ ${facility.prefecture}${facility.city ?? ''}${facility.address_line}`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={facility.status} label={t.status[facility.status]} />
            <Link href="/facilities" className="text-sm text-text-muted hover:text-text">
              {t.common.back}
            </Link>
          </div>
        }
      />

      {sp.created === '1' && <Alert tone="ok">{t.facilityForm.createdNotice}</Alert>}

      {/*
        公開可否は DB 側の関数で判定している。
        CSV 一括投入など別経路から登録された場合にも同じ基準が働くようにするため。
      */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text-muted">
            {t.publish.title}
          </h2>
          <form action={setFacilityStatus} className="flex items-center gap-2">
            <input type="hidden" name="id" value={facility.id} />
            {facility.status !== 'published' ? (
              <>
                <input type="hidden" name="status" value="published" />
                <Button type="submit" disabled={!canPublish}>
                  {canPublish ? t.publish.publish : t.publish.cannotPublish}
                </Button>
              </>
            ) : (
              <>
                <input type="hidden" name="status" value="draft" />
                <Button type="submit" variant="secondary">
                  {t.publish.unpublish}
                </Button>
              </>
            )}
          </form>
        </div>

        {blockers.length > 0 && (
          <Alert tone="danger" title={t.publish.blockers}>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {blockers.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Alert>
        )}

        {warnings.length > 0 && (
          <Alert tone="warn" title={t.publish.warnings}>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {warnings.map((p) => (
                <li key={p}>{p.replace('［警告］', '')}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs">{t.publish.warningNote}</p>
          </Alert>
        )}

        {canPublish && warnings.length === 0 && facility.status !== 'published' && (
          <Alert tone="ok">{t.publish.ready}</Alert>
        )}
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">
            {t.entryPoint.heading}
            <span className="ml-2 text-sm font-normal text-text-muted">
              {entryPoints?.length ?? 0} {t.common.places}
            </span>
          </h2>
          <AddEntryPointButton
            facilityId={facility.id}
            suggestedCode={nextCode((entryPoints ?? []).map((ep) => ep.code))}
            t={t}
          />
        </div>

        {!entryPoints?.length ? (
          <Card>
            <p className="text-sm leading-relaxed text-text-muted">{t.entryPoint.empty}</p>
          </Card>
        ) : (
          <div className="space-y-5">
            {entryPoints.map((ep) => {
              const epPhotos = (photos ?? []).filter((p) => p.entry_point_id === ep.id);
              const epCautions = (cautions ?? []).filter((c) => c.entry_point_id === ep.id);

              return (
                <Card key={ep.id} className="space-y-6">
                  <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-lg font-bold text-accent-text">
                      {ep.code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{ep.name}</p>
                      <p className="text-xs text-text-muted">{t.kind[ep.kind]}</p>
                    </div>
                    {!ep.is_active && <Badge tone="warn">{t.entryPoint.inactive}</Badge>}
                    {ep.nav_lat === null && (
                      <Badge tone="warn">{t.entryPoint.noCoords}</Badge>
                    )}
                    <Badge tone="accent">
                      {t.entryPoint.photos} {epPhotos.length} {t.common.sheets}
                    </Badge>
                    <form action={deleteEntryPoint}>
                      <input type="hidden" name="id" value={ep.id} />
                      <input type="hidden" name="facility_id" value={facility.id} />
                      <button
                        type="submit"
                        className="text-xs text-text-faint transition-colors hover:text-danger"
                      >
                        {t.entryPoint.deleteThis}
                      </button>
                    </form>
                  </div>

                  <EntryPointEditor facilityId={facility.id} entryPoint={ep} t={t} />

                  <div className="border-t border-border pt-5">
                    <h3 className="mb-3 text-sm font-semibold text-text-muted">
                      {t.caution.heading}
                    </h3>
                    <CautionEditor
                      facilityId={facility.id}
                      entryPointId={ep.id}
                      cautions={epCautions}
                      t={t}
                    />
                  </div>

                  <div className="border-t border-border pt-5">
                    <h3 className="mb-3 text-sm font-semibold text-text-muted">
                      {t.photo.heading}
                    </h3>
                    <PhotoManager
                      facilityId={facility.id}
                      entryPointId={ep.id}
                      photos={epPhotos}
                      t={t}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">{t.facilityForm.sectionFacility}</h2>
        <FacilityForm
          action={updateFacility}
          categories={categories ?? []}
          facility={facility}
          submitLabel={t.facilityForm.submitUpdate}
          t={t}
        />
      </section>
    </div>
  );
}
