'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { BellIcon } from '@/components/icons';

/**
 * ヘッダーのベル。
 *
 * **押すと一覧へ移る。**（ご指示 2026-09-14）
 *   以前はベルの下に窓を開き、その中に「同意して消す」まで置いていた。
 *   戻せない操作を小さな浮き窓に置くのは良くないうえ、狭い画面では
 *   窓が画面の外へはみ出して文字が読めなかった。
 *
 * **重ねたときは、中身を覗けるだけ。**
 *   何が届いているかを、移る前に確かめられるようにする。ここには
 *   押せるものを置かない。返事は一覧の画面で行う。
 *
 * **触って操作する端末では覗き窓を出さない。**
 *   指では「重ねる」ができない。触れた時点で出すと、押した拍子に
 *   一瞬出て消えるだけになり、移動の邪魔にしかならない。
 */

export interface NoticeItem {
  id: number;
  kind: 'purge_request' | 'payment';
  createdAt: string;
  cutoff?: string;
  count?: number;
  memberNo?: number;
  plan?: 'monthly' | 'quarterly' | 'half' | 'yearly';
}

export interface BellLabels {
  title: string;
  open: string;
  empty: string;
  unread: string;
  hover: string;
  purgeTitle: string;
  purgeBody: string;
  paymentTitle: string;
  paymentBody: string;
  planNames: Record<'monthly' | 'quarterly' | 'half' | 'yearly', string>;
}

function fill(template: string, values: Record<string, string | number>): string {
  let out = template;
  for (const [k, v] of Object.entries(values)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

/**
 * 覗き窓の高さの上限。
 *
 * ご指示（2026-09-14）により、**3件以上のときは送れるようにする。**
 * 1件ぶんの高さは、見出し(20) + 本文2行(32) + 余白(10) で約62px。
 * 2件（132px）までは収まり、3件（194px）から送りが出る高さにしてある。
 *
 * 打ち切って「残り◯件」と書く形もあるが、それでは何が届いているかが
 * 分からない。全部を並べて、送って見ていただく。
 */
const PEEK_MAX_H = '8.5rem';

/**
 * ベルから覗き窓へ指を移すあいだ、閉じないでおく時間 (ms)。
 *
 * ベルと窓のあいだには隙間がある。離れた瞬間に閉じると、窓の中へ
 * たどり着けず、送ることができない。
 */
const LEAVE_DELAY = 180;

export function NoticeBell({
  items,
  labels,
  locale,
}: {
  items: NoticeItem[];
  labels: BellLabels;
  locale: 'ja' | 'en';
}) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPeek = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setShow(true);
  }, []);

  const closePeek = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setShow(false), LEAVE_DELAY);
  }, []);

  useEffect(() => () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  }, []);

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  /**
   * 覗き窓の位置を決める。
   *
   * **ベルの右端に合わせるだけでは足りない。**
   *   ベルの右にはまだ明るさ・言語・ログアウトが並ぶ。狭い画面で
   *   右端を合わせると、窓の左側が画面の外へ出る。実際に 390px の
   *   端末で左へはみ出し、文字が切れていた（ご報告 2026-09-14）。
   *
   *   窓の**幅を測ってから**、画面の中に収まる位置まで引き戻す。
   */
  const place = useCallback(() => {
    const b = linkRef.current?.getBoundingClientRect();
    const w = panelRef.current?.offsetWidth ?? 0;
    if (!b || w === 0) return;
    const EDGE = 8;
    const rightMost = Math.max(EDGE, window.innerWidth - w - EDGE);
    setPos({ top: b.bottom + 6, left: Math.max(EDGE, Math.min(b.right - w, rightMost)) });
  }, []);

  useLayoutEffect(() => {
    if (!show) {
      setPos(null);
      return;
    }
    place();
  }, [show, place]);

  useEffect(() => {
    if (!show) return;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [show, place]);

  const n = items.length;

  const line = (it: NoticeItem) =>
    it.kind === 'purge_request'
      ? {
          title: labels.purgeTitle,
          body: fill(labels.purgeBody, {
            date: it.cutoff ? day(it.cutoff) : '—',
            count: it.count ?? 0,
          }),
        }
      : {
          title: labels.paymentTitle,
          body: fill(labels.paymentBody, {
            no: it.memberNo ?? '—',
            plan: it.plan ? labels.planNames[it.plan] : '',
          }),
        };

  return (
    <div className="relative">
      <Link
        ref={linkRef}
        href="/notices"
        prefetch
        aria-label={n > 0 ? `${labels.open}（${fill(labels.unread, { n })}）` : labels.open}
        /* 指で触る端末では覗き窓を出さない。重ねるという操作が無い。 */
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') openPeek();
        }}
        onPointerLeave={closePeek}
        /* キーボードで辿る方にも、同じ中身が見えるようにする */
        onFocus={openPeek}
        onBlur={closePeek}
        onClick={() => setShow(false)}
        className="relative flex size-9 items-center justify-center rounded-lg border border-transparent text-text-muted transition-colors hover:border-border hover:text-accent focus-visible:border-border focus-visible:text-accent"
      >
        <BellIcon />
        {/*
          未対応の数。地は主役の色。

          警告の赤に白文字では 3.2:1 にしかならない（10px の数字で
          基準は 4.5:1）。#008000 に白で 5.1:1。
        */}
        {n > 0 && (
          <span
            aria-hidden
            className="tabular absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-bg bg-accent px-1 text-[10px] font-bold leading-none text-accent-text"
          >
            {n > 99 ? '99+' : n}
          </span>
        )}
      </Link>

      {show && createPortal(
        <div
          ref={panelRef}
          role="tooltip"
          /*
            幅を測ってから置く。測る前は画面の外へ逃がしておく。
            0,0 に置くと、左上で一瞬ちらつく。
          */
          style={{
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            visibility: pos ? 'visible' : 'hidden',
          }}
          /* 窓の中でも送れるように、指を受け取る。離れたら閉じる。 */
          onPointerEnter={openPeek}
          onPointerLeave={closePeek}
          className="fixed z-50 w-[min(20rem,calc(100vw-1rem))] rounded-lg border border-border bg-surface p-3 shadow-lg"
        >
          <p className="text-xs font-semibold text-text-muted">{labels.title}</p>

          {n === 0 ? (
            <p className="mt-2 text-sm text-text-faint">{labels.empty}</p>
          ) : (
            <ul
              style={{ maxHeight: PEEK_MAX_H }}
              className="mt-2 space-y-2 overflow-y-auto overscroll-contain pr-1"
            >
              {items.map((it) => {
                const l = line(it);
                return (
                  <li key={it.id}>
                    <p className="text-sm font-semibold text-text">{l.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-muted">
                      {l.body}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-2.5 border-t border-border pt-2 text-xs text-text-faint">
            {labels.hover}
          </p>
        </div>,
        document.body,
      )}
    </div>
  );
}
