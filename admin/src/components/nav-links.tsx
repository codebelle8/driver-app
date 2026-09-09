'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  BuildingIcon,
  GaugeIcon,
  TagIcon,
  UsersIcon,
  HistoryIcon,
  CardIcon,
  BellIcon,
} from '@/components/icons';
import { useCloseSideNav } from '@/components/side-nav';

/**
 * 行き先の並び。左の柱の中に置く。
 *
 * **縦に並べる**
 *   以前はヘッダーへ横に並べていたが、項目が増えるたびに横が詰まり、
 *   狭い画面では横へ流れていた。縦なら、いくつ増えても収まる。
 *
 * **文字を省かない**
 *   横並びのときは狭い画面で記号だけにしていた。記号だけでは
 *   「会員」と「アカウント」のような近い項目を見分けられない。
 *   柱には幅があるので、常に文字を添える。
 *
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
    members: string;
    push: string;
    accounts: string;
    history: string;
  };
  /** アカウント管理と操作履歴は管理者しか開けない。開けない項目は出さない。 */
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const close = useCloseSideNav();

  const items = [
    { href: '/', label: labels.dashboard, Icon: GaugeIcon },
    { href: '/facilities', label: labels.facilities, Icon: BuildingIcon },
    { href: '/categories', label: labels.categories, Icon: TagIcon },
    ...(isAdmin
      ? [
          { href: '/members', label: labels.members, Icon: CardIcon },
          { href: '/push', label: labels.push, Icon: BellIcon },
          { href: '/accounts', label: labels.accounts, Icon: UsersIcon },
          { href: '/history', label: labels.history, Icon: HistoryIcon },
        ]
      : []),
  ];

  // ダッシュボードは完全一致。他は配下の画面（施設の詳細など）も点灯させる。
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav className="flex flex-col gap-0.5">
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
            */
            prefetch
            /* 重ねて出しているときは、押した時点で閉じる。 */
            onClick={close}
            aria-current={active ? 'page' : undefined}
            className={
              'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ' +
              (active
                ? 'border-nav-active-border bg-nav-active font-semibold text-text'
                : 'border-transparent text-text-muted hover:bg-surface-2 hover:text-text')
            }
          >
            <Icon />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
