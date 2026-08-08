'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { GlobeIcon, MoonIcon, SunIcon } from '@/components/icons';
import type { Locale } from '@/lib/i18n/dictionaries';

const ONE_YEAR = 60 * 60 * 24 * 365;

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

/**
 * 表示テーマの切り替え。
 *
 * Cookie に保存しつつ、その場で <html data-theme> も書き換える。
 * サーバーへ往復すると切り替えに一拍の遅れが出て、
 * 「押したのに変わらない」という印象になるため。
 */
export function ThemeToggle({
  initial,
  labels,
}: {
  initial: 'light' | 'dark';
  labels: { toggle: string; light: string; dark: string };
}) {
  const [theme, setTheme] = useState(initial);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    writeCookie('kn_theme', next);
  }

  const nextLabel = theme === 'dark' ? labels.light : labels.dark;

  return (
    <button
      type="button"
      onClick={toggle}
      title={`${labels.toggle} — ${nextLabel}`}
      aria-label={`${labels.toggle}: ${nextLabel}`}
      className="flex size-9 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:border-accent hover:text-accent"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/**
 * 言語の選択。
 *
 * ネイティブの <select> を使う。独自実装のドロップダウンと違い、
 * キーボード操作・読み上げ・モバイルの選択UIが標準どおり動くため、
 * アクセシビリティ上もっとも確実（W3C の推奨に沿う形）。
 *
 * サーバーコンポーネントが辞書を読んで描画しているため、
 * Cookie を書いたあと router.refresh() で再描画させる必要がある。
 */
export function LocaleSelect({
  initial,
  label,
}: {
  initial: Locale;
  label: string;
}) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>(initial);
  const [pending, startTransition] = useTransition();

  function select(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    writeCookie('kn_locale', next);
    startTransition(() => router.refresh());
  }

  return (
    <div className="relative flex items-center">
      {/* 狭い画面では地球アイコンを隠し、横幅を詰める */}
      <GlobeIcon
        width={15}
        height={15}
        className="pointer-events-none absolute left-2.5 hidden text-text-faint sm:block"
      />
      <select
        value={locale}
        onChange={(e) => select(e.target.value as Locale)}
        aria-label={label}
        disabled={pending}
        className="h-9 cursor-pointer appearance-none rounded-md border border-border bg-surface py-0 pl-2.5 pr-6 text-xs font-medium text-text transition-colors hover:border-accent focus:border-accent disabled:opacity-60 sm:pl-8 sm:pr-7"
      >
        <option value="ja">日本語</option>
        <option value="en">English</option>
      </select>
      {/* 三角のしるし。appearance-none で消えた標準の矢印を補う */}
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden
        className="pointer-events-none absolute right-2.5 text-text-faint"
      >
        <path
          d="M2 4l3 3 3-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

