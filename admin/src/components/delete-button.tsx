'use client';

/**
 * 確かめてから消すボタン。
 *
 * **なぜ要るか**
 *   進入口・注意事項・写真は、押した瞬間に消えていた。取り消せない操作を
 *   一段も挟まずに実行するのは、業務で使う画面としては危うい。
 *   カテゴリとアカウントには以前から確かめがあり、そこへ揃える。
 *
 * **サーバー側の処理はそのまま使う**
 *   消す処理そのものは form の action が受け持つ。ここが担うのは、
 *   押した直後に一度受け止めることだけ。処理を包み直すと、
 *   権限の確認や操作履歴の記録まで作り直すことになる。
 *
 * **何が消えるかを名前で示す**
 *   「削除しますか？」だけでは、どれを押したのか分からなくなる。
 *   一覧の中で同じ形のボタンが並ぶ場面ではとくに紛れる。
 */
export function DeleteButton({
  name,
  confirmText,
  label,
  className,
}: {
  /** 消すものの名前。文面の {name} に入る。 */
  name: string;
  /** 確かめの文面。{name} を含む。 */
  confirmText: string;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm(confirmText.replace('{name}', name))) e.preventDefault();
      }}
      className={
        className ?? 'text-xs text-text-faint transition-colors hover:text-danger'
      }
    >
      {label}
    </button>
  );
}
