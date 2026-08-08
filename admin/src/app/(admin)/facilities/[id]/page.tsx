import Link from 'next/link';
import { notFound } from 'next/navigation';

import { checkPublishReadiness, setFacilityStatus, updateFacility } from '@/app/actions/facilities';
import { deleteEntryPoint } from '@/app/actions/entry-points';
import { CautionEditor } from '@/components/caution-editor';
import { AddEntryPointButton, EntryPointEditor } from '@/components/entry-point-editor';
import { FacilityForm } from '@/components/facility-form';
import { PhotoManager } from '@/components/photo-manager';
import { Alert, Badge, Button, Card, PageHeader, StatusBadge } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ENTRY_POINT_KIND_LABEL } from '@/lib/supabase/database.types';

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
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createClient();

  const { data: facility } = await supabase
    .from('facilities')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!facility) notFound();

  const [{ data: categories }, { data: entryPoints }, problems] = await Promise.all([
    supabase.from('categories').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('entry_points').select('*').eq('facility_id', id).order('sort_order').order('code'),
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
            <StatusBadge status={facility.status} />
            <Link href="/facilities" className="text-sm text-text-muted hover:text-text">
              一覧へ戻る
            </Link>
          </div>
        }
      />

      {sp.created === '1' && (
        <Alert tone="ok">
          施設を登録しました。続けて入口・車寄せの情報を追加してください。
        </Alert>
      )}

      {/*
        公開可否は DB 側の関数で判定している。
        CSV 一括投入など別経路から登録された場合にも同じ基準が働くようにするため。
      */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text-muted">公開状態</h2>
          <form action={setFacilityStatus} className="flex items-center gap-2">
            <input type="hidden" name="id" value={facility.id} />
            {facility.status !== 'published' ? (
              <>
                <input type="hidden" name="status" value="published" />
                <Button type="submit" disabled={!canPublish}>
                  {canPublish ? 'この施設を公開する' : '公開できません'}
                </Button>
              </>
            ) : (
              <>
                <input type="hidden" name="status" value="draft" />
                <Button type="submit" variant="secondary">
                  下書きに戻す
                </Button>
              </>
            )}
          </form>
        </div>

        {blockers.length > 0 && (
          <Alert tone="danger" title="公開前に解消が必要な項目">
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {blockers.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Alert>
        )}

        {warnings.length > 0 && (
          <Alert tone="warn" title="公開は可能ですが、確認をおすすめします">
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {warnings.map((p) => (
                <li key={p}>{p.replace('［警告］', '')}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs">
              仮画像のままでも公開できます。文章と座標が正しければ、ドライバーには既に十分な価値があります。
            </p>
          </Alert>
        )}

        {canPublish && warnings.length === 0 && facility.status !== 'published' && (
          <Alert tone="ok">必要な項目はすべて揃っています。いつでも公開できます。</Alert>
        )}
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">
            入口・車寄せ
            <span className="ml-2 text-sm font-normal text-text-muted">
              {entryPoints?.length ?? 0} か所
            </span>
          </h2>
          <AddEntryPointButton
            facilityId={facility.id}
            suggestedCode={nextCode((entryPoints ?? []).map((ep) => ep.code))}
          />
        </div>

        {!entryPoints?.length ? (
          <Card>
            <p className="text-sm text-text-muted">
              入口・車寄せがまだ登録されていません。
              <strong className="text-text"> ここがアプリの中核データです。</strong>
              同じ建物でも入口ごとに経路も注意点も異なるため、入口の数だけ登録してください。
            </p>
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
                      <p className="text-xs text-text-muted">
                        {ENTRY_POINT_KIND_LABEL[ep.kind]}
                      </p>
                    </div>
                    {!ep.is_active && <Badge tone="warn">無効</Badge>}
                    {ep.nav_lat === null && <Badge tone="warn">座標未設定</Badge>}
                    <Badge tone="teal">写真 {epPhotos.length} 枚</Badge>
                    <form action={deleteEntryPoint}>
                      <input type="hidden" name="id" value={ep.id} />
                      <input type="hidden" name="facility_id" value={facility.id} />
                      <button
                        type="submit"
                        className="text-xs text-text-faint transition-colors hover:text-danger"
                      >
                        この入口を削除
                      </button>
                    </form>
                  </div>

                  <EntryPointEditor facilityId={facility.id} entryPoint={ep} />

                  <div className="border-t border-border pt-5">
                    <h3 className="mb-3 text-sm font-semibold text-text-muted">注意事項</h3>
                    <CautionEditor
                      facilityId={facility.id}
                      entryPointId={ep.id}
                      cautions={epCautions}
                    />
                  </div>

                  <div className="border-t border-border pt-5">
                    <h3 className="mb-3 text-sm font-semibold text-text-muted">
                      写真・進入案内図
                    </h3>
                    <PhotoManager
                      facilityId={facility.id}
                      entryPointId={ep.id}
                      photos={epPhotos}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">施設の基本情報</h2>
        <FacilityForm
          action={updateFacility}
          categories={categories ?? []}
          facility={facility}
          submitLabel="変更を保存"
        />
      </section>
    </div>
  );
}
