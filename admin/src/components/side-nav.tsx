'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { MenuIcon, CloseIcon, UserIcon } from '@/components/icons';

/**
 * 画面の並び（左の柱）。
 *
 * **なぜヘッダーから移したか**
 *   項目がすべてヘッダーに並んでおり、増やすたびに横が詰まっていた。
 *   会員・通知を足した時点で、狭い画面では横へ流れるようになっていた。
 *   縦に並べれば、いくつ増えても収まる。
 *
 * **ヘッダーに残すもの**
 *   明るさ・言語・ログアウト。どの画面からでも同じように使い、
 *   行き先ではないもの。行き先は柱へ集める。
 *
 * **狭い画面（768px 未満）**
 *   柱は畳んでおき、三本線を押したときだけ重ねて出す。
 *   常に出しておくと、本文の幅が半分近く持っていかれる。
 *
 * **開いたら、行き先を選んだ時点で閉じる**
 *   重ねて出しているため、押したあとに残ると本文が読めない。
 */

interface SideNavValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const SideNavContext = createContext<SideNavValue>({ open: false, setOpen: () => {} });

export function SideNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SideNavContext.Provider value={{ open, setOpen }}>{children}</SideNavContext.Provider>
  );
}

/** ヘッダーへ置く三本線。狭い画面にだけ出る。 */
export function SideNavTrigger({ label }: { label: string }) {
  const { open, setOpen } = useContext(SideNavContext);
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      title={label}
      aria-label={label}
      aria-expanded={open}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-text-muted transition-colors hover:border-border hover:text-accent md:hidden"
    >
      <MenuIcon />
    </button>
  );
}

/**
 * 柱そのもの。
 *
 * 広い画面では本文の左に並べ、狭い画面では重ねて出す。同じものを
 * 二つ描かず、置き方だけを変える。二つ描くと、片方だけ直る。
 */
export function SideNavPanel({
  children,
  user,
  closeLabel,
}: {
  /** 行き先の並び */
  children: ReactNode;
  /** 誰で入っているか。柱の下に置く。 */
  user: ReactNode;
  closeLabel: string;
}) {
  const { open, setOpen } = useContext(SideNavContext);

  /* 逃げ道。重ねて出しているあいだは Esc で閉じられるようにする。 */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <>
      {/* 外側。押したら閉じる。広い画面では出さない。 */}
      {open && (
        <button
          type="button"
          aria-label={closeLabel}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={
          'z-40 flex w-60 shrink-0 flex-col border-r border-border bg-bg ' +
          /*
            狭い画面では画面の左へ重ねる。広い画面では本文の隣へ戻す。
            translate で動かすのは、出入りを滑らかにするため。
          */
          'fixed inset-y-0 left-0 transition-transform duration-200 ' +
          'md:static md:z-auto md:translate-x-0 ' +
          /*
            畳んでいるあいだは、目からも指からも外す。

            画面の外へ寄せただけでは、tab で中の行き先へ入れてしまう。
            見えていないものへ焦点が移ると、どこにいるのか分からなくなる。
          */
          (open ? 'translate-x-0' : '-translate-x-full invisible md:visible')
        }
      >
        {/* 重ねて出しているときの閉じる釦。広い画面では要らない。 */}
        <div className="flex h-14 shrink-0 items-center justify-end border-b border-border px-3 md:hidden">
          <button
            type="button"
            onClick={() => setOpen(false)}
            title={closeLabel}
            aria-label={closeLabel}
            className="flex size-9 items-center justify-center rounded-lg border border-transparent text-text-muted transition-colors hover:border-border hover:text-accent"
          >
            <CloseIcon />
          </button>
        </div>

        {/* 行き先。増えても縦に伸びるだけなので、送れるようにしておく。 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>

        {/*
          誰で入っているか。

          以前はヘッダーの右にあり、広い画面でしか出していなかった
          （横に入りきらないため）。柱なら、どの幅でも置ける。
        */}
        <div className="shrink-0 border-t border-border p-3">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <UserIcon width={15} height={15} />
            {user}
          </div>
        </div>
      </aside>
    </>
  );
}

/** 行き先を押したら、重ねた柱を閉じる。 */
export function useCloseSideNav() {
  const { setOpen } = useContext(SideNavContext);
  return () => setOpen(false);
}
