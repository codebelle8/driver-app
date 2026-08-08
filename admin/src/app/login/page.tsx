import Image from 'next/image';

import { LocaleSelect, ThemeToggle } from '@/components/header-controls';
import { LoginForm } from '@/components/login-form';
import { getDictionary, getLocale, getTheme } from '@/lib/i18n/server';

/**
 * searchParams はサーバー側で読み、クライアント側の useSearchParams を使わない。
 * useSearchParams は Suspense 境界を要求し、その結果ログインフォームが
 * SSR された HTML に含まれなくなる（JS の読み込み完了まで入力欄が出ない）。
 * ログイン画面は最初に表示される画面なので、ここは素直に描画させる。
 */
export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const [params, t, locale, theme] = await Promise.all([
    searchParams,
    getDictionary(),
    getLocale(),
    getTheme(),
  ]);

  const next = typeof params.next === 'string' ? params.next : '/';
  const initialError = params.error === 'no_permission' ? t.login.noPermission : undefined;

  return (
    <main className="flex min-h-screen flex-col px-4">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-2 py-4">
        <ThemeToggle
          initial={theme}
          labels={{
            toggle: t.common.theme,
            light: t.common.themeLight,
            dark: t.common.themeDark,
          }}
        />
        <LocaleSelect initial={locale} label={t.common.language} />
      </div>

      <div className="flex flex-1 items-center justify-center pb-24">
        <div className="w-full max-w-sm">
          {/*
            ログイン画面は余白があるため、横組みロゴをそのまま使う。
            濃紺版と白抜き版の両方を描画し、CSS で表示を切り替える
            （テーマ切替と同時に入れ替わるようにするため）。
          */}
          <div className="mb-8 flex flex-col items-center text-center">
            <Image
              src="/brand/logo-h160.png"
              alt={t.brand.name}
              width={462}
              height={160}
              className="only-light h-auto w-full max-w-[320px]"
              priority
            />
            <Image
              src="/brand/logo-white-h160.png"
              alt=""
              aria-hidden
              width={462}
              height={160}
              className="only-dark h-auto w-full max-w-[320px]"
              priority
            />
            <p className="mt-4 text-sm text-text-muted">{t.brand.sub}</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface/90 p-6 shadow-sm backdrop-blur">
            <LoginForm
              next={next}
              initialError={initialError}
              labels={{
                email: t.login.email,
                password: t.login.password,
                submit: t.login.submit,
                pending: t.login.pending,
                failed: t.login.failed,
              }}
            />
          </div>
        </div>
      </div>

      <footer className="border-t border-border py-5 text-center">
        <span className="text-sm tracking-widest text-text-muted">
          {t.brand.footerName}
        </span>
        <span className="tabular ml-3 text-sm text-accent">2026</span>
      </footer>
    </main>
  );
}
