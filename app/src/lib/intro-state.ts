import { useSyncExternalStore } from 'react';

/**
 * 導入映像が終わったか（2026-11-02）。
 *
 * 導入映像は画面より上に重ねて流す（_layout.tsx）。その下ではもう「探す」画面が
 * 描かれているため、画面の側だけでは、利用者に見えているかが分からない。
 * 開いたときに一度だけ出す吹き出し（ご意見箱）が、映像の裏で出て消えていた。
 *
 * 映像が消えたら markIntroDone() を呼ぶ。見たい側は useIntroDone() で待つ。
 */

let done = false;
const listeners = new Set<() => void>();

export function markIntroDone(): void {
  if (done) return;
  done = true;
  for (const f of listeners) f();
}

function subscribe(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function useIntroDone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => done,
    () => done,
  );
}
