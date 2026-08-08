import { Card, LinkButton, PageHeader, StatCard, StatusBadge } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
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
        title="ダッシュボード"
        description="登録状況と、公開までに残っている作業の一覧"
        actions={<LinkButton href="/facilities/new">施設を新規登録</LinkButton>}
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="登録施設数" value={facilityCount} unit="件" />
        <StatCard label="入口・車寄せ" value={entryPointCount} unit="か所" />
        <StatCard label="登録写真" value={photoCount} unit="枚" />
        <StatCard
          label="下書きのまま"
          value={draftCount}
          unit="件"
          tone={draftCount > 0 ? 'warn' : 'ok'}
        />
      </section>

      {/*
        実データは段階的に入稿されるため、「何がまだ揃っていないか」が
        一目で分かることが運用上いちばん重要になる。
        この2つが 0 になることが初期データ整備の完了条件。
      */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-muted">
          公開までに残っている作業
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="仮画像が残っている写真"
            value={placeholderCount}
            unit="枚"
            tone={placeholderCount > 0 ? 'warn' : 'ok'}
            hint={
              placeholderCount > 0
                ? '実写真が届き次第、管理画面から差し替えてください'
                : 'すべて実写真に差し替え済みです'
            }
          />
          <StatCard
            label="ナビ座標が未設定の入口"
            value={missingNavCount}
            unit="か所"
            tone={missingNavCount > 0 ? 'warn' : 'ok'}
            hint={
              missingNavCount > 0
                ? '座標が無い入口を含む施設は公開できません'
                : 'すべての入口に座標が設定されています'
            }
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-muted">最近更新した施設</h2>
        {recent.length === 0 ? (
          <Card>
            <p className="text-sm text-text-muted">
              まだ施設が登録されていません。「施設を新規登録」から追加してください。
            </p>
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
                    <StatusBadge status={f.status} />
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
