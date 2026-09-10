'use client';

import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, useTransition } from 'react';

import { MoonIcon, SunIcon } from '@/components/icons';
import { Flag } from '@/components/flag';
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

/** 言語名は、その言語自身の表記で出す。英語表示でも「日本語」のまま。 */
const LOCALES: { value: Locale; label: string }[] = [
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
];

/**
 * 言語の選択。
 *
 * ネイティブの <select> をやめた理由:
 *   Chrome は「選択中の項目がボタンに重なる位置」へメニューを出す。
 *   2番目を選んでいるとメニューが上へせり上がり、ブラウザのツールバーに
 *   被って壊れて見えた。この位置はブラウザが決めるもので CSS では動かせない。
 *
 *   自前で描けば「ボタンの真下・右そろえ」に固定できる。
 *   画面の右端に置いている操作なので、右そろえにしないと外へはみ出す。
 *
 * ネイティブをやめると失われるもの（キーボード操作と読み上げ）は、
 * 下で自分で用意している。省くと、目で見ずに操作する方が選べなくなる。
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
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const current = LOCALES.find((l) => l.value === locale) ?? LOCALES[0];

  /*
    メニューは body へ描き出す。

    ヘッダーの内側は overflow-x-auto で、CSS では片方が auto だと
    もう片方も visible でなくなるため、縦にはみ出した分が切られる。
    実際にメニューの下半分が見切れていた。

    ヘッダーには backdrop-filter もあり、これは position: fixed の
    基準にもなるので、単に fixed にしても閉じ込められる。
    親から出すには body へ描くしかない。
  */
  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    /*
      画面の端に少し余白を残す。

      狭い画面ではヘッダーが横に流れ、ボタン自体が画面の外へ出ることがある。
      そのまま右をそろえるとメニューも一緒にはみ出すため、端で止める。
    */
    const EDGE = 8;
    setAt({
      top: r.bottom + 4,
      right: Math.max(EDGE, window.innerWidth - r.right),
    });
  }

  function toggle() {
    if (!open) place();
    setOpen((v) => !v);
  }

  /*
    画面が動いたら、閉じるのではなく位置を合わせ直す。

    狭い画面ではヘッダーが横に流れ、この操作は画面の外へ出る。
    押すとブラウザが画面内へ寄せるが、そのスクロールで閉じてしまうと
    「押しても開かない」状態になる。実測で 820px 幅で起きていた。
  */
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  function select(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    setLocale(next);
    writeCookie('kn_locale', next);
    startTransition(() => router.refresh());
  }

  // 外を押したら閉じる。開いたままだと他の操作を隠す。
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  /** 矢印キーで移動し、Enter/Space で決める。Esc で閉じる。 */
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const at = LOCALES.findIndex((l) => l.value === locale);
      const to = e.key === 'ArrowDown' ? at + 1 : at - 1;
      if (to >= 0 && to < LOCALES.length) setLocale(LOCALES[to].value);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) select(locale);
      else setOpen(true);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        onKeyDown={onKeyDown}
        disabled={pending}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface pl-2.5 pr-2 text-xs font-medium text-text transition-colors hover:border-accent focus:border-accent disabled:opacity-60 sm:pl-2.5"
      >
        {/*
          旗を出すので、地球の印は要らなくなった。
          印が2つ並ぶと、どちらが今の言語を指しているのか読み取りにくい。
        */}
        <Flag locale={current.value} />
        {/*
          狭い画面では旗だけにする。

          三本線・ロゴ・明るさ・言語・ログアウトを並べると、366px より
          狭い画面では右のログアウトが切れていた。言語名は旗と重なる
          情報で、削っても何が選ばれているかは分かる。
        */}
        <span className="hidden sm:inline">{current.label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden
          className={'text-text-faint transition-transform ' + (open ? 'rotate-180' : '')}
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
      </button>

      {open && at && createPortal(
        <ul
          role="listbox"
          aria-label={label}
          /*
            ボタンの真下・右そろえに置く。
            この操作は画面の右端にあるため、左そろえだと外へはみ出す。
          */
          style={{ top: at.top, right: at.right }}
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-28 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {LOCALES.map((l) => (
            <li key={l.value}>
              <button
                type="button"
                role="option"
                aria-selected={l.value === locale}
                onClick={() => select(l.value)}
                className={
                  'flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-2 ' +
                  (l.value === locale ? 'font-semibold text-accent' : 'text-text')
                }
              >
                <Flag locale={l.value} />
                {l.label}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}

