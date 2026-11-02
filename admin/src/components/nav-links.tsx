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
  MegaphoneIcon,
  DocumentIcon,
  InboxIcon,
  ChatIcon,
  BulbIcon,
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
  isManager = false,
  pendingSubmissions = 0,
  openChatReports = 0,
  newFeedback = 0,
}: {
  labels: {
    dashboard: string;
    facilities: string;
    categories: string;
    submissions: string;
    feedback: string;
    chat: string;
    members: string;
    push: string;
    accounts: string;
    history: string;
    site: string;
  };
  /** アカウント管理と操作履歴は管理者しか開けない。開けない項目は出さない。 */
  isAdmin?: boolean;
  /** 情報提供の審査は、管理者と編集者だけ（調査員は審査しない） */
  isManager?: boolean;
  /** 審査待ちの情報提供の数。行の右に出す */
  pendingSubmissions?: number;
  /** 未対応のチャットの通報の数。行の右に出す */
  openChatReports?: number;
  /** 未対応のご意見の数（ご意見箱。2026-11-02）。行の右に出す */
  newFeedback?: number;
}) {
  const pathname = usePathname();
  const close = useCloseSideNav();

  const items = [
    { href: '/', label: labels.dashboard, Icon: GaugeIcon },
    { href: '/facilities', label: labels.facilities, Icon: BuildingIcon },
    { href: '/categories', label: labels.categories, Icon: TagIcon },
    /*
      情報提供（2026-10-05）。審査待ちの数を添える。届いたことに
      気づけないと、審査が溜まり、採用の件数（翌月無料の元）も遅れる。
    */
    ...(isManager
      ? [
          { href: '/submissions', label: labels.submissions, Icon: InboxIcon, count: pendingSubmissions },
          /* チャットの見張り（2026-10-05）。未対応の通報の数を添える */
          { href: '/chat', label: labels.chat, Icon: ChatIcon, count: openChatReports },
        ]
      : []),
    ...(isAdmin
      ? [
          { href: '/members', label: labels.members, Icon: CardIcon },
          /* ご意見箱（2026-11-02）。会員からアプリへの声。未対応の数を添える */
          { href: '/feedback', label: labels.feedback, Icon: BulbIcon, count: newFeedback },
          { href: '/accounts', label: labels.accounts, Icon: UsersIcon },
          { href: '/history', label: labels.history, Icon: HistoryIcon },
          /* 規約類の掲載先。開くのは決めるときだけなので、下のほうへ。 */
          { href: '/site', label: labels.site, Icon: DocumentIcon },
          /*
            お知らせを送る。ご指示によりいちばん下（2026-09-14）。

            印は拡声器にした。ヘッダーのベルと同じ印だったため、
            「届いた知らせ」と「こちらから送る」が見分けられなかった。
          */
          { href: '/push', label: labels.push, Icon: MegaphoneIcon },
        ]
      : []),
  ];

  // ダッシュボードは完全一致。他は配下の画面（施設の詳細など）も点灯させる。
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const { href, label, Icon } = item;
        const count = ('count' in item ? item.count : 0) ?? 0;
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
            {count > 0 && (
              <span className="tabular ml-auto rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-text">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
