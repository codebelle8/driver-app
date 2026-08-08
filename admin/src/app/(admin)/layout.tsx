import Link from 'next/link';
import { redirect } from 'next/navigation';

import { HeaderClock, LocaleSelect, ThemeToggle } from '@/components/header-controls';
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3">
          <Link href="/" className="shrink-0">
            <span className="text-lg font-bold">{t.brand.name}</span>
            <span className="ml-2 text-xs text-text-muted">{t.brand.sub}</span>
          </Link>

          <NavLinks
            labels={{
              dashboard: t.nav.dashboard,
              facilities: t.nav.facilities,
              categories: t.nav.categories,
            }}
          />

          <div className="flex items-center gap-2">
            <HeaderClock locale={locale} />

            <ThemeToggle
              initial={theme}
              labels={{
                toggle: t.common.theme,
                light: t.common.themeLight,
                dark: t.common.themeDark,
              }}
            />

            <LocaleSelect initial={locale} label={t.common.language} />

            <span className="hidden items-center gap-1.5 border-l border-border pl-3 text-xs text-text-muted md:flex">
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
