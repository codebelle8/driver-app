'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { BuildingIcon, GaugeIcon, TagIcon } from '@/components/icons';

/**
 * ヘッダーのナビゲーション。
 *
 * 現在開いている画面の項目だけ地色を一段明るくして区別する。
 * 開いている画面がどれかはサーバーコンポーネントからは分からないため、
 * ここだけクライアント側で usePathname() を使う。
 */
export function NavLinks({
  labels,
}: {
  labels: { dashboard: string; facilities: string; categories: string };
}) {
  const pathname = usePathname();

  const items = [
    { href: '/', label: labels.dashboard, Icon: GaugeIcon },
    { href: '/facilities', label: labels.facilities, Icon: BuildingIcon },
    { href: '/categories', label: labels.categories, Icon: TagIcon },
  ];

  // ダッシュボードは完全一致。他は配下の画面（施設の詳細など）も点灯させる。
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav className="flex flex-1 items-center gap-1">
      {items.map(({ href, label, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors ' +
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
