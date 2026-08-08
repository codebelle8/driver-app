import Link from 'next/link';
import { redirect } from 'next/navigation';

import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const NAV = [
  { href: '/', label: 'ダッシュボード' },
  { href: '/facilities', label: '施設一覧' },
  { href: '/categories', label: 'カテゴリ' },
];

async function signOut() {
  'use server';
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export default async function AdminLayout({ children }: LayoutProps<'/'>) {
  const staff = await requireStaff();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/" className="shrink-0">
            <span className="text-sm font-bold">車寄せナビ</span>
            <span className="ml-2 text-xs text-text-muted">管理画面</span>
          </Link>

          <nav className="flex flex-1 items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-text-muted sm:block">
              {staff.profile.display_name}
              <span className="ml-1.5 rounded border border-border-strong px-1.5 py-0.5 text-[10px]">
                {staff.profile.role === 'admin' ? '管理者' : '編集者'}
              </span>
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
              >
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>

      <footer className="border-t border-border px-6 py-4 text-center text-xs text-text-faint">
        車寄せナビ 管理画面 — 初期版 (MVP)
      </footer>
    </div>
  );
}
