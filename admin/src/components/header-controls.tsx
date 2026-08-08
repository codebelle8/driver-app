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
      className="flex size-9 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:border-accent hover:text-accent"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/**
 * 言語の切り替え。
 *
 * サーバーコンポーネントが辞書を読んで描画しているため、
 * Cookie を書いたあと router.refresh() で再描画させる必要がある。
 */
export function LocaleToggle({
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
    <div
      className="flex items-center gap-1 rounded-lg border border-border px-1.5 py-1"
      aria-label={label}
      data-pending={pending ? '' : undefined}
    >
      <GlobeIcon width={15} height={15} className="mx-0.5 text-text-faint" />
      {(
        [
          ['ja', '日本語'],
          ['en', 'EN'],
        ] as const
      ).map(([value, text]) => (
        <button
          key={value}
          type="button"
          onClick={() => select(value)}
          aria-pressed={locale === value}
          className={
            'rounded px-1.5 py-0.5 text-xs font-semibold transition-colors ' +
            (locale === value
              ? 'bg-accent text-accent-text'
              : 'text-text-muted hover:text-text')
          }
        >
          {text}
        </button>
      ))}
    </div>
  );
}
