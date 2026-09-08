import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LocaleSelect, ThemeToggle } from '@/components/header-controls';
import { SignOutIcon, UserIcon } from '@/components/icons';
import { NavigationOverlay } from '@/components/navigation-overlay';
import { NavLinks } from '@/components/nav-links';
import { ScrollTopButton } from '@/components/scroll-top';
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

  return (
    /*
      画面の高さに合わせて固定し、本文だけを送る。

      従来はページ全体が伸び、ヘッダーは sticky、フッターは一番下だった。
      そのため一覧が長いとフッターが見えず、下まで送ると
      ヘッダーだけが残る形になっていた。

      h-screen + overflow-hidden で外枠を固定し、本文に
      overflow-y-auto を与えると、ヘッダーとフッターが常に見える。
    */
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="z-20 shrink-0 border-b border-border bg-bg/85 backdrop-blur-md">
        {/*
          並びは 左:ロゴ ─ 区切り ─ ナビ ─ (余白) ─ 右:操作ボタン。
          折り返さない (flex-nowrap) ことで、狭い画面でも操作列が
          下段へ回り込まないようにする。
        */}
        {/*
          極端に狭い画面（400px 未満）では全項目を並べきれない。
          折り返すと2段になってしまうため、横スクロールで逃がす。
          どの項目も消さずに到達できる状態を保つ。
        */}
        <div className="no-scrollbar mx-auto flex max-w-6xl flex-nowrap items-center gap-2 overflow-x-auto px-3 py-3 sm:gap-3 sm:px-6">
          {/*
            ロゴ。右の縦罫線でナビと明確に切り分ける。

            濃紺版と白抜き版の両方を描画し、CSS で表示を切り替える。
            src をサーバー側で選ぶと、テーマ切替が Cookie 経由になるため
            再描画するまで画像が変わらない。
          */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 border-r border-border pr-2.5 sm:pr-6"
          >
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
            {/* 副題は場所を取るため lg 以上のみ。768px で横にはみ出すのを避ける */}
            <span className="hidden text-xs text-text-muted lg:inline">{t.brand.sub}</span>
          </Link>

          <NavLinks
            labels={{
              dashboard: t.nav.dashboard,
              facilities: t.nav.facilities,
              categories: t.nav.categories,
              members: t.nav.members,
              accounts: t.nav.accounts,
              history: t.nav.history,
            }}
            isAdmin={staff.profile.role === 'admin'}
          />

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

            {/*
              利用者名は場所を取るため lg 以上でのみ出す。
              md で出すと 768px 幅でヘッダーが横にはみ出す。
            */}
            <span className="hidden items-center gap-1.5 border-l border-border pl-3 text-xs text-text-muted lg:flex">
              <UserIcon width={15} height={15} />
              {staff.profile.display_name}
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px]">
                {
                  {
                    admin: t.nav.roleAdmin,
                    editor: t.nav.roleEditor,
                    surveyor: t.nav.roleSurveyor,
                  }[staff.profile.role]
                }
              </span>
            </span>

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

      {/*
        本文だけが送られる領域。
        min-h-0 が要る。これが無いと flex の子は内容の高さまで伸び、
        overflow-y-auto が効かない（外側にスクロールが出てしまう）。
      */}
      {/*
        relative を付けておく。

        本文の中に position:absolute の要素（sr-only など）が置かれたとき、
        基準になる先祖が無いと body を基準に配置され、
        main の overflow では抑えられずページ全体が伸びる。
        個々の要素に頼らず、本文の器の側で受け止める。
      */}
      <main className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>
      </main>

      {/*
        遷移中は、いま表示している画面を残したまま上に重ねて出す。
        loading.tsx を置くと元の画面が差し替わってしまうため使っていない。
      */}
      <NavigationOverlay label={t.common.loading} />

      {/* 一覧が長い画面で使う。全画面に置いて場所を固定する。 */}
      <ScrollTopButton label={t.nav.scrollTop} />

      <footer className="shrink-0 border-t border-border px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
          <span className="text-sm tracking-widest text-text-muted">
            {t.brand.footerName}
          </span>
          <span className="tabular text-sm text-accent">2026</span>
        </div>
      </footer>
    </div>
  );
}
