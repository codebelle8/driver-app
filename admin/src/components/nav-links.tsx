'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { BuildingIcon, GaugeIcon, TagIcon, UsersIcon, HistoryIcon } from '@/components/icons';

/**
 * ヘッダーのナビゲーション。
 *
 * 現在開いている画面の項目だけ地色を一段明るくして区別する。
 * 開いている画面がどれかはサーバーコンポーネントからは分からないため、
 * ここだけクライアント側で usePathname() を使う。
 */
export function NavLinks({
  labels,
  isAdmin = false,
}: {
  labels: {
    dashboard: string;
    facilities: string;
    categories: string;
    accounts: string;
    history: string;
  };
  /** アカウント管理と操作履歴は管理者しか開けない。開けない項目は出さない。 */
  isAdmin?: boolean;
}) {
  const pathname = usePathname();

  const items = [
    { href: '/', label: labels.dashboard, Icon: GaugeIcon },
    { href: '/facilities', label: labels.facilities, Icon: BuildingIcon },
    { href: '/categories', label: labels.categories, Icon: TagIcon },
    ...(isAdmin
      ? [
          { href: '/accounts', label: labels.accounts, Icon: UsersIcon },
          { href: '/history', label: labels.history, Icon: HistoryIcon },
        ]
      : []),
  ];

  // ダッシュボードは完全一致。他は配下の画面（施設の詳細など）も点灯させる。
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  // flex-1 にせず自然な幅に留め、右側の操作ボタンは ml-auto で端へ寄せる。
  // 左の余白でロゴから離し、ナビ全体を少し右に置く。
  return (
    <nav className="ml-1 flex shrink-0 items-center gap-1 sm:ml-3">
      {items.map(({ href, label, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            /*
              先読みを明示的に有効にする。

              各画面は force-dynamic のため、既定の先読みでは何も取得されない。
              押してから初めてサーバーへ問い合わせるので、毎回 600ms 前後かかる。
              明示すると、画面に見えた時点で内容を取りにいくため、
              押した瞬間に切り替わる。

              取得先はこの5画面だけで、いずれも管理者が日常的に行き来する。
            */
            prefetch
            aria-current={active ? 'page' : undefined}
            className={
              'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm transition-colors sm:px-2.5 ' +
              (active
                ? 'border-nav-active-border bg-nav-active font-semibold text-text'
                : 'border-transparent text-text-muted hover:bg-surface-2 hover:text-text')
            }
          >
            <Icon />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
