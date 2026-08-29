import Link from 'next/link';

/**
 * ページ送りのボタン。端では押せないことが見て分かるようにする。
 *
 * 施設一覧・操作履歴・カテゴリで同じものを使う。
 * 以前は3画面それぞれに同じ実装が置かれており、先読みの設定のような
 * 変更を1か所に入れられなかった。
 *
 * 先読みを明示している理由:
 *   各画面は force-dynamic のため、既定の先読みでは外枠しか取れず、
 *   押したあとに結局サーバーへ問い合わせることになる。
 *
 *   一覧の行には付けていない。行は15件あり、押されるのはたいてい1件で、
 *   残り14件ぶんの描画がサーバー側で無駄に走る。実測したところ
 *   30件の要求が同時に飛び、落ち着くまで20秒以上かかっていた。
 *   その間にページ送りを押すと後ろに並ばされ、13秒待たされていた。
 *
 *   ページ送りは前後の2つだけで、しかもほぼ必ず押される。
 */
export function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const base = 'rounded-lg border px-4 py-2 text-sm font-medium transition-colors';

  if (disabled) {
    return (
      <span aria-disabled="true" className={`${base} border-border text-text-faint`}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      prefetch
      className={`${base} border-border text-text hover:border-accent hover:text-accent`}
    >
      {children}
    </Link>
  );
}
