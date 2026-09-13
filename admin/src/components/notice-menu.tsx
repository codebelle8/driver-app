'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';

import { BellIcon } from '@/components/icons';

/**
 * ヘッダーの知らせの窓。
 *
 * 出すのは2つ。
 *   * 操作履歴の整理をお伺いする知らせ（半年に一度）
 *   * 会員がお支払いを済ませたという知らせ
 *
 * **文面はここで組み立てる。** データベースには種類と手がかりしか
 * 入れていない。文字を入れてしまうと、表示の言語を切り替えても前の
 * 言語のまま残る。
 *
 * **窓は body へ描き出す。**
 *   ヘッダーの内側は overflow-x-auto で、CSS では片方が auto だと
 *   もう片方も visible でなくなるため、縦にはみ出した分が切られる。
 *   ヘッダーには backdrop-filter もあり、これは position: fixed の
 *   基準にもなるので、単に fixed にしても閉じ込められる。
 *   言語の選択と同じ作りにしてある（header-controls.tsx）。
 */

export interface NoticeItem {
  id: number;
  kind: 'purge_request' | 'payment';
  createdAt: string;
  cutoff?: string;
  count?: number;
  memberNo?: number;
  plan?: 'monthly' | 'yearly';
}

export interface NoticeLabels {
  title: string;
  open: string;
  empty: string;
  unread: string;
  purgeTitle: string;
  purgeBody: string;
  purgeApprove: string;
  purgeDecline: string;
  purgeNote: string;
  paymentTitle: string;
  paymentBody: string;
  paymentGo: string;
  dismiss: string;
  monthly: string;
  yearly: string;
}

/** {n} のような差し込みを埋める。 */
function fill(template: string, values: Record<string, string | number>): string {
  let out = template;
  for (const [k, v] of Object.entries(values)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

export function NoticeMenu({
  items,
  labels,
  locale,
  approve,
  decline,
  dismiss,
}: {
  items: NoticeItem[];
  labels: NoticeLabels;
  locale: 'ja' | 'en';
  approve: (formData: FormData) => void;
  decline: (formData: FormData) => void;
  dismiss: (formData: FormData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const EDGE = 8;
    setAt({
      top: r.bottom + 4,
      /* 狭い画面では窓のほうが広い。右端からあふれない位置で止める。 */
      right: Math.max(EDGE, window.innerWidth - r.right),
    });
  }

  function toggle() {
    if (!open) place();
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  // 外を押したら閉じる
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const n = items.length;

  return (
    <div ref={boxRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={n > 0 ? `${labels.open}（${fill(labels.unread, { n })}）` : labels.open}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex size-9 cursor-pointer items-center justify-center rounded-lg border border-transparent text-text-muted transition-colors hover:border-border hover:text-accent"
      >
        <BellIcon />
        {/*
          未対応の数。

          印だけでは「何か出ている」しか伝わらず、開くまで量が分からない。
          2桁を超えると丸が横に伸びるため、99 で止める。
        */}
        {n > 0 && (
          <span
            aria-hidden
            className="tabular absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-bg bg-danger px-1 text-[10px] font-bold leading-none text-white"
          >
            {n > 99 ? '99+' : n}
          </span>
        )}
      </button>

      {open && at && createPortal(
        <div
          role="dialog"
          aria-label={labels.title}
          style={{ top: at.top, right: at.right }}
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed z-50 max-h-[min(70vh,520px)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface shadow-lg"
        >
          <p className="border-b border-border px-4 py-2.5 text-xs font-semibold text-text-muted">
            {labels.title}
          </p>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-faint">{labels.empty}</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((it) => (
                <li key={it.id} className="px-4 py-3">
                  {it.kind === 'purge_request' ? (
                    <>
                      <p className="text-sm font-semibold text-text">{labels.purgeTitle}</p>
                      <p className="mt-1 text-xs leading-relaxed text-text-muted">
                        {fill(labels.purgeBody, {
                          date: it.cutoff ? day(it.cutoff) : '—',
                          count: it.count ?? 0,
                        })}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-text-faint">
                        {labels.purgeNote}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {/*
                          消す側を目立たせない。押し間違いは戻せない。
                          見送るほうを先に置き、消すほうは警告の色で出す。
                        */}
                        <form action={decline}>
                          <input type="hidden" name="id" value={it.id} />
                          <button
                            type="submit"
                            onClick={() => setOpen(false)}
                            className="cursor-pointer rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-accent"
                          >
                            {labels.purgeDecline}
                          </button>
                        </form>
                        <form action={approve}>
                          <input type="hidden" name="id" value={it.id} />
                          <button
                            type="submit"
                            onClick={() => setOpen(false)}
                            className="cursor-pointer rounded-md border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/10"
                          >
                            {labels.purgeApprove}
                          </button>
                        </form>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-text">{labels.paymentTitle}</p>
                      <p className="mt-1 text-xs leading-relaxed text-text-muted">
                        {fill(labels.paymentBody, {
                          no: it.memberNo ?? '—',
                          plan: it.plan === 'yearly' ? labels.yearly : labels.monthly,
                        })}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <Link
                          href="/members"
                          prefetch
                          onClick={() => setOpen(false)}
                          className="cursor-pointer rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-accent"
                        >
                          {labels.paymentGo}
                        </Link>
                        <form action={dismiss}>
                          <input type="hidden" name="id" value={it.id} />
                          <button
                            type="submit"
                            onClick={() => setOpen(false)}
                            className="cursor-pointer rounded-md px-2 py-1.5 text-xs text-text-faint transition-colors hover:text-danger"
                          >
                            {labels.dismiss}
                          </button>
                        </form>
                      </div>
                    </>
                  )}
                  <p className="mt-2 text-[11px] text-text-faint">{day(it.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
