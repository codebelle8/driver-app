import Link from 'next/link';

import { PlusIcon } from '@/components/icons';
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  StatusBadge,
  inputClass,
} from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import type { PublishStatus } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

/**
 * 1ページに出す件数。
 *
 * 150件を一度に並べると、目当ての施設を探すのに縦スクロールが要る。
 * 15件なら画面に収まり、絞り込みと組み合わせて辿り着ける。
 */
const PAGE_SIZE = 15;

/**
 * 検索語を、施設の search_text と同じ規則で正規化する。
 * DB 側のトリガと揃えないと「シオドメ」で引けない。
 * （DB: public.normalize_search_text）
 */
const KATAKANA = 'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロワヲンー';
const HIRAGANA = 'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろわをんー';

function normalize(input: string): string {
  let out = '';
  for (const ch of input) {
    const i = KATAKANA.indexOf(ch);
    out += i >= 0 ? HIRAGANA[i] : ch;
  }
  return out.toLowerCase();
}

export default async function FacilitiesPage({ searchParams }: PageProps<'/facilities'>) {
  await requireStaff();
  const [params, t] = await Promise.all([searchParams, getDictionary()]);

  const q = typeof params.q === 'string' ? params.q : '';
  const categoryId = typeof params.category === 'string' ? params.category : '';
  const status = typeof params.status === 'string' ? params.status : '';
  const page = Math.max(1, Number(params.page) || 1);

  const supabase = await createClient();

  // count: 'exact' で、絞り込み後の総件数も一緒に受け取る。
  // 件数が分からないとページ送りの終わりを判断できない。
  let query = supabase
    .from('facilities')
    .select('id, code, name, name_kana, address_line, status, category_id, updated_at', {
      count: 'exact',
    })
    .order('code');

  if (q.trim()) query = query.like('search_text', `%${normalize(q.trim())}%`);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (status) query = query.eq('status', status as PublishStatus);

  const from = (page - 1) * PAGE_SIZE;

  // 絞り込み用のカテゴリ一覧と施設一覧は互いに依存しない。同時に取る。
  const [facilityResult, categoryResult] = await Promise.all([
    query.range(from, from + PAGE_SIZE - 1),
    supabase
      .from('categories')
      .select('id, name, code_prefix')
      .eq('is_active', true)
      .order('sort_order'),
  ]);

  const { data: facilities, error, count } = facilityResult;
  const categories = categoryResult.data;

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** 絞り込みを保ったままページだけ変える */
  function pageHref(target: number): string {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (categoryId) sp.set('category', categoryId);
    if (status) sp.set('status', status);
    if (target > 1) sp.set('page', String(target));
    const query = sp.toString();
    return query ? `/facilities?${query}` : '/facilities';
  }

  // 入口の件数をまとめて取得し、一覧に表示する
  const ids = (facilities ?? []).map((f) => f.id);
  const { data: entryPoints } = ids.length
    ? await supabase.from('entry_points').select('facility_id').in('facility_id', ids)
    : { data: [] };

  const entryCount = new Map<string, number>();
  for (const ep of entryPoints ?? []) {
    entryCount.set(ep.facility_id, (entryCount.get(ep.facility_id) ?? 0) + 1);
  }

  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const isFiltered = Boolean(q || categoryId || status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.facilities.title}
        description={
          total > PAGE_SIZE
            ? `${total} ${t.facilities.showing}（${from + 1}〜${Math.min(from + PAGE_SIZE, total)} 件目）`
            : `${total} ${t.facilities.showing}`
        }
        actions={
          <LinkButton href="/facilities/new">
            <PlusIcon width={16} height={16} />
            {t.dashboard.newFacility}
          </LinkButton>
        }
      />

      <Card>
        <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t.facilities.searchPlaceholder}
            className={inputClass}
          />
          <select name="category" defaultValue={categoryId} className={inputClass}>
            <option value="">{t.facilities.allCategories}</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status} className={inputClass}>
            <option value="">{t.facilities.allStatuses}</option>
            <option value="draft">{t.status.draft}</option>
            <option value="published">{t.status.published}</option>
            <option value="archived">{t.status.archived}</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-hover"
          >
            {t.facilities.filter}
          </button>
        </form>
      </Card>

      {error && (
        <Card>
          <p className="text-sm text-danger">
            {t.facilities.loadFailed}: {error.message}
          </p>
        </Card>
      )}

      {!facilities?.length ? (
        <EmptyState
          title={isFiltered ? t.facilities.emptyFiltered : t.facilities.empty}
          description={isFiltered ? t.facilities.emptyFilteredHint : t.facilities.emptyHint}
          action={
            !isFiltered && (
              <LinkButton href="/facilities/new">{t.dashboard.newFacility}</LinkButton>
            )
          }
        />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-border">
            {facilities.map((f) => {
              const count = entryCount.get(f.id) ?? 0;
              return (
                <li key={f.id}>
                  {/*
                    先読みを明示する。

                    既定でも要求自体は飛んでいるが、force-dynamic の画面では
                    外枠しか取れず、押したあとに結局サーバーへ問い合わせていた。
                    明示すると同じ回数の要求で中身まで取れるため、要求数は変わらない。
                  */}
                  <Link
                    prefetch
                    href={`/facilities/${f.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-surface-2"
                  >
                    <span className="tabular w-24 shrink-0 text-xs text-text-faint">
                      {f.code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.name}</p>
                      <p className="truncate text-xs text-text-muted">{f.address_line}</p>
                    </div>
                    <Badge>{categoryName.get(f.category_id) ?? '—'}</Badge>
                    <Badge tone={count === 0 ? 'warn' : 'accent'}>
                      {t.facilities.entryPoints} {count} {t.common.places}
                    </Badge>
                    <StatusBadge status={f.status} label={t.status[f.status]} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/*
        ページ送り。
        リンクなので、押した時点で既存の読み込み表示（ステアリング）が出る。
        別途の作り込みは要らない。
      */}
      {lastPage > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="ページ送り">
          <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
            前へ
          </PageLink>
          <span className="tabular px-3 text-sm text-text-muted">
            {page} / {lastPage}
          </span>
          <PageLink href={pageHref(page + 1)} disabled={page >= lastPage}>
            次へ
          </PageLink>
        </nav>
      )}
    </div>
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
  const base =
    'rounded-lg border px-4 py-2 text-sm font-medium transition-colors';

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${base} border-border text-text-faint`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`${base} border-border text-text hover:border-accent hover:text-accent`}
    >
      {children}
    </Link>
  );
}
