import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LocaleSelect, ThemeToggle } from '@/components/header-controls';
import { SignOutIcon, UserIcon } from '@/components/icons';
import { NavLinks } from '@/components/nav-links';
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
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-md">
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
          {/* ロゴ。右の縦罫線でナビと明確に切り分ける */}
          <Link
            href="/"
            className="flex shrink-0 items-baseline gap-2 border-r border-border pr-2.5 sm:pr-6"
          >
            <span className="text-base font-bold tracking-tight sm:text-lg">
              {t.brand.name}
            </span>
            <span className="hidden text-xs text-text-muted sm:inline">{t.brand.sub}</span>
          </Link>

          <NavLinks
            labels={{
              dashboard: t.nav.dashboard,
              facilities: t.nav.facilities,
              categories: t.nav.categories,
            }}
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
                {staff.profile.role === 'admin' ? t.nav.roleAdmin : t.nav.roleEditor}
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

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>

      <footer className="border-t border-border px-6 py-5">
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
