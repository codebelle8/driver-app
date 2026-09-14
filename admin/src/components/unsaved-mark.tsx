'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 「まだ保存していません」の印。
 *
 * **なぜ要るか**
 *   施設の画面には保存の釦が3つ以上ある（施設そのものと、入口ごと）。
 *   入口Aを直して、別の枠の釦を押すと、**入口Aの変更は保存されない。**
 *   押した側は保存したつもりでいるため、気づけない。
 *   実際に「編集したのに反映されない」とご報告をいただいた
 *   （2026-09-14）。
 *
 *   直した枠だけに印を出す。押すべき釦がどれかが、その場で分かる。
 *
 * **画面を離れるときにも止める**
 *   直したまま別の画面へ移ると、そのまま消える。ブラウザに尋ねさせる。
 *
 * **入っている枠を自分で探す**
 *   どの form に属するかを引数で渡させると、置き場所を間違えたときに
 *   黙って効かなくなる。自分の親をさかのぼって見つける。
 */
export function UnsavedMark({ label }: { label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;

    const touched = () => setDirty(true);
    const saved = () => setDirty(false);

    form.addEventListener('input', touched);
    form.addEventListener('change', touched);
    form.addEventListener('submit', saved);
    /* 「やめる」で閉じたときにも消す */
    form.addEventListener('reset', saved);

    return () => {
      form.removeEventListener('input', touched);
      form.removeEventListener('change', touched);
      form.removeEventListener('submit', saved);
      form.removeEventListener('reset', saved);
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const ask = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [dirty]);

  return (
    <span
      ref={ref}
      /*
        印が出ていないときも場所を取る形にはしない。出たり消えたりで
        釦の位置が動くと、押そうとした先がずれる。
      */
      className={
        dirty
          ? 'inline-flex items-center gap-1.5 rounded-md border border-warn/40 bg-warn/10 px-2.5 py-1 text-xs font-semibold text-warn'
          : 'hidden'
      }
      role={dirty ? 'status' : undefined}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-warn" />
      {label}
    </span>
  );
}
