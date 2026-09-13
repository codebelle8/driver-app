'use client';

import Link from 'next/link';

/**
 * お知らせ1件への返事。
 *
 * **画面の中に置く。浮き窓には置かない。**
 *   以前はヘッダーのベルの下に開く窓へ入れていた。戻せない操作を
 *   小さな浮き窓に置くと、押し間違いが起きやすいうえ、狭い画面では
 *   窓そのものがはみ出して読めなかった（ご報告 2026-09-14）。
 *
 * **消す側は目立たせない。**
 *   見送るほうを先に置き、消すほうは警告の色で出す。
 */
export function NoticeActions({
  id,
  kind,
  labels,
  approve,
  decline,
  dismiss,
}: {
  id: number;
  kind: 'purge_request' | 'payment';
  labels: {
    purgeApprove: string;
    purgeDecline: string;
    paymentGo: string;
    dismiss: string;
  };
  approve: (formData: FormData) => void;
  decline: (formData: FormData) => void;
  dismiss: (formData: FormData) => void;
}) {
  if (kind === 'purge_request') {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={decline}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="cursor-pointer rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-accent"
          >
            {labels.purgeDecline}
          </button>
        </form>
        <form action={approve}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="cursor-pointer rounded-md border border-danger/40 px-3 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
          >
            {labels.purgeApprove}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Link
        href="/members"
        prefetch
        className="cursor-pointer rounded-md border border-border-strong px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:border-accent"
      >
        {labels.paymentGo}
      </Link>
      <form action={dismiss}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-text-faint transition-colors hover:text-danger"
        >
          {labels.dismiss}
        </button>
      </form>
    </div>
  );
}
