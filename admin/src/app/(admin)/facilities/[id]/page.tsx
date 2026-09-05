import Link from 'next/link';
import { notFound } from 'next/navigation';

import { deleteEntryPoint } from '@/app/actions/entry-points';
import { BulkCheck, BulkDelete } from '@/components/bulk-delete';
import { ConfirmSubmit } from '@/components/confirm-dialog';
import { DeleteButton } from '@/components/delete-button';
import {
  checkPublishReadiness,
  deleteFacility,
  setFacilityStatus,
  updateFacility,
} from '@/app/actions/facilities';
import { CautionEditor } from '@/components/caution-editor';
import { AddEntryPointButton, EntryPointEditor } from '@/components/entry-point-editor';
import { FacilityForm } from '@/components/facility-form';
import { PhotoManager } from '@/components/photo-manager';
import { Alert, Badge, Button, Card, PageHeader, StatusBadge } from '@/components/ui';
import { canEditFacility, requireStaff } from '@/lib/auth';
import { bulkLabels } from '@/lib/i18n/dictionaries';
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
  const staff = await requireStaff();
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

  // 調査員は公開・非公開の切り替えを行えない
  const isManager = staff.profile.role !== 'surveyor';
  // 調査員から見た公開済みの施設は読み取り専用。
  // 編集欄を出したまま保存させると、RLS が対象0件に絞るため
  // 「保存できたのに何も変わらない」という最悪の結果になる。
  const editable = canEditFacility(staff, facility.status);

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
        調査員から見た公開済みの施設。編集欄を出したまま保存させると
        RLS が対象0件に絞るため、保存できたように見えて何も変わらない。
        操作させずに理由を伝える。
      */}
      {!editable && (
        <Alert tone="info" title={t.publish.readOnlyTitle}>
          {t.publish.readOnlyBody}
        </Alert>
      )}

      {/*
        公開可否は DB 側の関数で判定している。
        CSV 一括投入など別経路から登録された場合にも同じ基準が働くようにするため。
      */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text-muted">
            {t.publish.title}
          </h2>
          {isManager ? (
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
          ) : (
            <span className="text-xs text-text-muted">{t.publish.surveyorNote}</span>
          )}
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
          {editable && (
            <AddEntryPointButton
              facilityId={facility.id}
              suggestedCode={nextCode((entryPoints ?? []).map((ep) => ep.code))}
              t={t}
            />
          )}
        </div>

        {!entryPoints?.length ? (
          <Card>
            <p className="text-sm leading-relaxed text-text-muted">{t.entryPoint.empty}</p>
          </Card>
        ) : (
          <BulkDelete
            name="entry-point"
            action={deleteEntryPoint}
            extra={{ facility_id: facility.id }}
            ids={entryPoints.map((ep) => ep.id)}
            labels={bulkLabels(t)}
            enabled={editable}
          >
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
                    {editable && (
                      <BulkCheck id={ep.id} label={ep.name}>
                        <form action={deleteEntryPoint}>
                          <input type="hidden" name="id" value={ep.id} />
                          <input type="hidden" name="facility_id" value={facility.id} />
                          <DeleteButton
                            name={ep.name}
                            labels={{
                              heading: t.common.deleteHeading,
                              confirm: t.common.deleteOneConfirm,
                              noUndo: t.common.noUndo,
                              delete: t.common.delete,
                              cancel: t.common.cancel,
                            }}
                            label={t.entryPoint.deleteThis}
                          />
                        </form>
                      </BulkCheck>
                    )}
                  </div>

                  {editable ? (
                    <EntryPointEditor facilityId={facility.id} entryPoint={ep} t={t} />
                  ) : (
                    // 編集はできなくても、現地で参照する情報としては読めるべき
                    <dl className="space-y-2 text-sm">
                      {ep.approach_text && (
                        <div>
                          <dt className="text-xs text-text-muted">
                            {t.entryPoint.approachText}
                          </dt>
                          <dd className="leading-relaxed">{ep.approach_text}</dd>
                        </div>
                      )}
                      {ep.approach_from && (
                        <div>
                          <dt className="text-xs text-text-muted">
                            {t.entryPoint.approachFrom}
                          </dt>
                          <dd>{ep.approach_from}</dd>
                        </div>
                      )}
                    </dl>
                  )}

                  <div className="border-t border-border pt-5">
                    <h3 className="mb-3 text-sm font-semibold text-text-muted">
                      {t.caution.heading}
                    </h3>
                    {editable ? (
                      <CautionEditor
                        facilityId={facility.id}
                        entryPointId={ep.id}
                        cautions={epCautions}
                        t={t}
                      />
                    ) : (
                      <ul className="space-y-1 text-sm leading-relaxed">
                        {epCautions.length === 0 && (
                          <li className="text-text-muted">{t.caution.empty}</li>
                        )}
                        {epCautions.map((c) => (
                          <li key={c.id}>
                            {c.time_from && c.time_to && (
                              <span className="tabular mr-2 text-xs text-text-muted">
                                {c.time_from.slice(0, 5)}–{c.time_to.slice(0, 5)}
                              </span>
                            )}
                            {c.body}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="border-t border-border pt-5">
                    <h3 className="mb-3 text-sm font-semibold text-text-muted">
                      {t.photo.heading}
                    </h3>
                    <PhotoManager
                      facilityId={facility.id}
                      entryPointId={ep.id}
                      photos={epPhotos}
                      readOnly={!editable}
                      t={t}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
          </BulkDelete>
        )}
      </section>

      {editable && (
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
      )}

      {/*
        施設そのものを消す。

        いちばん下に、他の操作から離して置く。取り消せないうえ、
        入口・注意事項・写真までまとめて消えるため、編集の流れの
        途中で目に入る場所には置かない。

        調査員には出さない。押しても RLS が0件に絞るため、
        「押せるのに何も起きない」状態になる。
      */}
      {isManager ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-danger">{t.publish.deleteTitle}</h2>
          <Card className="space-y-3 border-danger/40">
            <p className="text-sm leading-relaxed text-text-muted">{t.publish.deleteNote}</p>
            {facility.status === 'published' && (
              <Alert tone="warn">{t.publish.deletePublishedNote}</Alert>
            )}
            <form action={deleteFacility}>
              <input type="hidden" name="id" value={facility.id} />
              <ConfirmSubmit
                type="submit"
                heading={t.common.deleteHeading}
                message={t.publish.deleteConfirmBody.replace('{name}', facility.name)}
                note={t.common.noUndo}
                confirmLabel={t.common.delete}
                cancelLabel={t.common.cancel}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-danger/40 px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
              >
                {t.publish.deleteButton}
              </ConfirmSubmit>
            </form>
          </Card>
        </section>
      ) : (
        <p className="text-xs text-text-faint">{t.publish.deleteManagerOnly}</p>
      )}
    </div>
  );
}
