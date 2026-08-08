import { PlusIcon } from '@/components/icons';
import { Card, LinkButton, PageHeader, StatCard, StatusBadge } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function countOf(
  supabase: Supabase,
  table: 'facilities' | 'entry_points' | 'photos',
) {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
  return count ?? 0;
}

export default async function DashboardPage() {
  await requireStaff();
  const t = await getDictionary();
  const supabase = await createClient();

  const [
    facilityCount,
    entryPointCount,
    photoCount,
    draftResult,
    placeholderResult,
    missingNavResult,
    recentResult,
  ] = await Promise.all([
    countOf(supabase, 'facilities'),
    countOf(supabase, 'entry_points'),
    countOf(supabase, 'photos'),
    supabase.from('facilities').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('photos').select('*', { count: 'exact', head: true }).eq('is_placeholder', true),
    supabase.from('entry_points').select('*', { count: 'exact', head: true }).is('nav_lat', null),
    supabase
      .from('facilities')
      .select('id, code, name, status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(5),
  ]);

  const draftCount = draftResult.count ?? 0;
  const placeholderCount = placeholderResult.count ?? 0;
  const missingNavCount = missingNavResult.count ?? 0;
  const recent = recentResult.data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t.dashboard.title}
        description={t.dashboard.description}
        actions={
          <LinkButton href="/facilities/new">
            <PlusIcon width={16} height={16} />
            {t.dashboard.newFacility}
          </LinkButton>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t.dashboard.facilityCount} value={facilityCount} unit={t.common.count} />
        <StatCard label={t.dashboard.entryPointCount} value={entryPointCount} unit={t.common.places} />
        <StatCard label={t.dashboard.photoCount} value={photoCount} unit={t.common.sheets} />
        <StatCard
          label={t.dashboard.draftCount}
          value={draftCount}
          unit={t.common.count}
          tone={draftCount > 0 ? 'warn' : 'ok'}
        />
      </section>

      {/*
        実データは段階的に入稿されるため、「何がまだ揃っていないか」が
        一目で分かることが運用上いちばん重要になる。
        この2つが 0 になることが初期データ整備の完了条件。
      */}
      <section>
        <h2 className="font-mincho mb-3 text-sm font-semibold text-text-muted">
          {t.dashboard.remainingTitle}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label={t.dashboard.placeholderPhotos}
            value={placeholderCount}
            unit={t.common.sheets}
            tone={placeholderCount > 0 ? 'warn' : 'ok'}
            hint={
              placeholderCount > 0
                ? t.dashboard.placeholderHint
                : t.dashboard.placeholderDone
            }
          />
          <StatCard
            label={t.dashboard.missingNav}
            value={missingNavCount}
            unit={t.common.places}
            tone={missingNavCount > 0 ? 'warn' : 'ok'}
            hint={
              missingNavCount > 0 ? t.dashboard.missingNavHint : t.dashboard.missingNavDone
            }
          />
        </div>
      </section>

      <section>
        <h2 className="font-mincho mb-3 text-sm font-semibold text-text-muted">
          {t.dashboard.recent}
        </h2>
        {recent.length === 0 ? (
          <Card>
            <p className="text-sm text-text-muted">{t.dashboard.empty}</p>
          </Card>
        ) : (
          <Card className="!p-0">
            <ul className="divide-y divide-border">
              {recent.map((f) => (
                <li key={f.id}>
                  <a
                    href={`/facilities/${f.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span className="tabular text-xs text-text-faint">{f.code}</span>
                    <span className="flex-1 truncate text-sm">{f.name}</span>
                    <StatusBadge status={f.status} label={t.status[f.status]} />
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
