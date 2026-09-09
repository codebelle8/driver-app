import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LocaleSelect, ThemeToggle } from '@/components/header-controls';
import { SignOutIcon } from '@/components/icons';
import { NavigationOverlay } from '@/components/navigation-overlay';
import { NavLinks } from '@/components/nav-links';
import { ScrollTopButton } from '@/components/scroll-top';
import { SideNavPanel, SideNavProvider, SideNavTrigger } from '@/components/side-nav';
import { requireStaff } from '@/lib/auth';
import { getDictionary, getLocale, getTheme } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';

async function signOut() {
  'use server';
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export default async function AdminLayout({ children }: LayoutProps<'/'>) {
  const [staff, t, locale, theme] = await Promise.all([
    requireStaff(),
    getDictionary(),
    getLocale(),
    getTheme(),
  ]);

  const roleLabel = {
    admin: t.nav.roleAdmin,
    editor: t.nav.roleEditor,
    surveyor: t.nav.roleSurveyor,
  }[staff.profile.role];

  return (
    /*
      画面の高さに合わせて固定し、本文だけを送る。

      従来はページ全体が伸び、ヘッダーは sticky、フッターは一番下だった。
      そのため一覧が長いとフッターが見えず、下まで送ると
      ヘッダーだけが残る形になっていた。

      h-screen + overflow-hidden で外枠を固定し、本文に
      overflow-y-auto を与えると、ヘッダーとフッターが常に見える。
    */
    <SideNavProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        {/*
          ヘッダーに残すのは、明るさ・言語・ログアウトの3つだけ。

          どの画面からでも同じように使い、行き先ではないもの。
          行き先（ダッシュボード・施設・カテゴリ…）は左の柱へ移した。
          ヘッダーに全部並べていたころは、項目を足すたびに横が詰まり、
          狭い画面では横へ流れていた。
        */}
        <header className="z-20 shrink-0 border-b border-border bg-bg/85 backdrop-blur-md">
          <div className="flex flex-nowrap items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6">
            {/* 狭い画面だけに出る三本線。柱を重ねて開く。 */}
            <SideNavTrigger label={t.nav.menu} />

            {/*
              三本線とロゴのあいだの区切り。

              並べただけでは、ロゴの一部に見えて押せると分からない。
              三本線が出ない広い画面では、線も出さない。
            */}
            <span aria-hidden className="h-7 w-px shrink-0 bg-border md:hidden" />

            {/*
              ロゴ。

              濃紺版と白抜き版の両方を描画し、CSS で表示を切り替える。
              src をサーバー側で選ぶと、テーマ切替が Cookie 経由になるため
              再描画するまで画像が変わらない。
            */}
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <Image
                src="/brand/logo-h80.png"
                alt={t.brand.name}
                width={127}
                height={44}
                className="only-light h-[38px] w-auto shrink-0 sm:h-[44px]"
                priority
              />
              <Image
                src="/brand/logo-white-h80.png"
                alt=""
                aria-hidden
                width={127}
                height={44}
                className="only-dark h-[38px] w-auto shrink-0 sm:h-[44px]"
                priority
              />
              {/* 副題は場所を取るため lg 以上のみ */}
              <span className="hidden text-xs text-text-muted lg:inline">{t.brand.sub}</span>
            </Link>

            {/* ml-auto で操作ボタンを右端へ寄せる */}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ThemeToggle
                initial={theme}
                labels={{
                  toggle: t.common.theme,
                  light: t.common.themeLight,
                  dark: t.common.themeDark,
                }}
              />

              <LocaleSelect initial={locale} label={t.common.language} />

              <form action={signOut}>
                <button
                  type="submit"
                  title={t.nav.signOut}
                  aria-label={t.nav.signOut}
                  className="flex size-9 items-center justify-center rounded-lg border border-transparent text-text-muted transition-colors hover:border-border hover:text-accent"
                >
                  <SignOutIcon />
                </button>
              </form>
            </div>
          </div>
        </header>

        {/* 左の柱と本文を横に並べる。柱は 768px 未満では重ねて出す。 */}
        <div className="flex min-h-0 flex-1">
          <SideNavPanel
            closeLabel={t.nav.closeMenu}
            user={
              <>
                <span className="truncate">{staff.profile.display_name}</span>
                <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px]">
                  {roleLabel}
                </span>
              </>
            }
          >
            <NavLinks
              labels={{
                dashboard: t.nav.dashboard,
                facilities: t.nav.facilities,
                categories: t.nav.categories,
                members: t.nav.members,
                push: t.nav.push,
                accounts: t.nav.accounts,
                history: t.nav.history,
              }}
              isAdmin={staff.profile.role === 'admin'}
            />
          </SideNavPanel>

          {/* 本文とフッター。柱は端まで伸ばし、送るのはこちらだけにする。 */}
          <div className="flex min-h-0 flex-1 flex-col">
            {/*
              本文だけが送られる領域。
              min-h-0 が要る。これが無いと flex の子は内容の高さまで伸び、
              overflow-y-auto が効かない（外側にスクロールが出てしまう）。

              relative を付けておく。本文の中に position:absolute の要素
              （sr-only など）が置かれたとき、基準になる先祖が無いと
              body を基準に配置され、main の overflow では抑えられない。
            */}
            <main className="relative min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>
            </main>

            {/*
              高さは柱の下（誰で入っているか）と揃える。

              min- にしているのは、狭い画面で文言が2行になったときに
              切らないため。柱が並ぶのは 768px 以上で、そこでは1行に
              収まるので、実際には同じ高さになる。
            */}
            <footer className="flex min-h-14 shrink-0 items-center border-t border-border px-6">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
                <span className="text-sm tracking-widest text-text-muted">
                  {t.brand.footerName}
                </span>
                <span className="tabular text-sm text-accent">2026</span>
              </div>
            </footer>
          </div>
        </div>

        {/*
          遷移中は、いま表示している画面を残したまま上に重ねて出す。
          loading.tsx を置くと元の画面が差し替わってしまうため使っていない。
        */}
        <NavigationOverlay label={t.common.loading} />

        {/* 一覧が長い画面で使う。全画面に置いて場所を固定する。 */}
        <ScrollTopButton label={t.nav.scrollTop} />
      </div>
    </SideNavProvider>
  );
}
