'use client';

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';

import { Button } from '@/components/ui';

/**
 * 消してよいかを尋ねる札。
 *
 * **ブラウザの confirm を置き換えるもの**
 *   以前は window.confirm を使っていた。動きはするが、出てくるのは
 *   ブラウザが作る枠で、管理画面の配色にも書体にも従わない。
 *   暗い表示で使っている最中に白い枠が出るし、長い文面は
 *   ブラウザによって途中で切られる。アカウントの削除のように
 *   注意書きが3文にわたるものは、実際に読み切れない形で出ていた。
 *
 * **サーバー側の処理はそのまま使う**
 *   消す処理は form の action が受け持つ。ここは押した直後に
 *   一度受け止めるだけ。処理を包み直すと、権限の確認や
 *   操作履歴の記録まで作り直すことになる。
 *
 *   そのため「本物の submit ボタンを、確かめた後にもう一度押す」
 *   という形にしている。form.requestSubmit() では押した側の
 *   ボタンが伝わらず、formAction や隠し入力の対応が崩れる。
 */

export function ConfirmDialog({
  open,
  heading,
  message,
  note,
  confirmLabel,
  cancelLabel,
  onCancel,
  onConfirm,
  tone = 'danger',
}: {
  open: boolean;
  /** 見出し。「削除しますか？」 */
  heading: string;
  /** 何が・いくつ消えるのか。 */
  message: ReactNode;
  /** 取り消せない旨。行を分けて置く。 */
  note?: string;
  confirmLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  /**
   * 進む側の色。消すものは赤（既定）。権限を足すなど、消さない操作は
   * 赤にしない（赤は「取り返しがつかない」の印として取っておく）。
   */
  tone?: 'danger' | 'primary';
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  /*
    開いたら「やめる」に焦点を移す。

    取り消せない操作なので、Enter を押したときに進む側へ
    落ちないようにする。キーボードだけで操作する方が、
    札に気づかないまま確定してしまうのを防ぐ。
  */
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      // 後ろを暗くする層。押したらやめる扱いにする。
      // 迷ったまま押した先が「消す」になってはいけない。
      onClick={onCancel}
      data-testid="confirm-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
    >
      <div
        // 札そのものを押しても閉じない。本文を選ぼうとした操作で
        // 閉じてしまわないように止める。
        onClick={(e) => e.stopPropagation()}
        data-testid="confirm-card"
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl"
      >
        <h2 className="text-base font-bold text-text">{heading}</h2>
        <div className="mt-3 text-sm leading-relaxed text-text">{message}</div>
        {note && (
          <p className={`mt-2 text-xs ${tone === 'danger' ? 'text-danger' : 'text-text-muted'}`}>{note}</p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button
            ref={cancelRef}
            type="button"
            variant="secondary"
            onClick={onCancel}
            data-testid="confirm-cancel"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone}
            onClick={onConfirm}
            data-testid="confirm-accept"
            className={tone === 'danger' ? 'border-danger bg-danger/10' : ''}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 確かめてから送るボタン。
 *
 * 見た目と役割は普通の submit ボタンのまま。押されたら一度止めて
 * 札を出し、決めてもらってから本来の送信に進む。
 */
export function ConfirmSubmit({
  heading,
  message,
  note,
  confirmLabel,
  cancelLabel,
  tone,
  children,
  ...button
}: ComponentProps<'button'> & {
  heading: string;
  message: ReactNode;
  note?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'danger' | 'primary';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  /*
    もう一度押すときに、止めずに通すための目印。

    state ではなく ref なのは、click() を呼ぶのが
    再描画を待たない同じ処理の流れの中だから。
  */
  const armed = useRef(false);

  return (
    <>
      <button
        {...button}
        ref={ref}
        onClick={(e) => {
          if (armed.current) {
            armed.current = false;
            return;
          }
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </button>

      <ConfirmDialog
        open={open}
        heading={heading}
        message={message}
        note={note}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        tone={tone}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          armed.current = true;
          ref.current?.click();
        }}
      />
    </>
  );
}
