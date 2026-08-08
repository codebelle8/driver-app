import { LoginForm } from '@/components/login-form';

/**
 * searchParams はサーバー側で読み、クライアント側の useSearchParams を使わない。
 * useSearchParams は Suspense 境界を要求し、その結果ログインフォームが
 * SSR された HTML に含まれなくなる（JS の読み込み完了まで入力欄が出ない）。
 * ログイン画面は最初に表示される画面なので、ここは素直に描画させる。
 */
export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;

  const next = typeof params.next === 'string' ? params.next : '/';
  const initialError =
    params.error === 'no_permission'
      ? 'このアカウントには管理画面の利用権限がありません。管理者にご連絡ください。'
      : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold tracking-widest text-accent">
            ── ドライバー専用
          </p>
          <h1 className="mt-2 text-3xl font-bold">車寄せナビ</h1>
          <p className="mt-1 text-sm text-text-muted">管理画面</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <LoginForm next={next} initialError={initialError} />
        </div>
      </div>
    </main>
  );
}
