/**
 * 背景。
 *
 * このアプリの中身は「どの道から入り、どこに車を着けるか」という案内なので、
 * 街路網と、そこを通って車寄せへ至る経路を抽象化した図を敷く。
 * 主張させず、余白に意味を持たせる程度の濃度に留める。
 *
 * サーバーコンポーネント。動きが無いので JavaScript は不要。
 */
export function AppBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ color: 'var(--c-backdrop)', opacity: 'var(--c-backdrop-opacity)' }}
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* 街区のパターン。少し傾けて単調さを避ける */}
          <pattern
            id="blocks"
            width="150"
            height="150"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-8)"
          >
            <path
              d="M0 0H150M0 0V150"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M75 0V150M0 75H150"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              strokeOpacity="0.6"
            />
          </pattern>

          {/* 経路は中央付近だけ濃く見せる */}
          <radialGradient id="fade" cx="50%" cy="50%" r="62%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="fadeMask">
            <rect width="1600" height="900" fill="url(#fade)" />
          </mask>
        </defs>

        <rect width="1600" height="900" fill="url(#blocks)" mask="url(#fadeMask)" />

        <g mask="url(#fadeMask)">
          {/* 幹線道路 */}
          <path
            d="M-60 640 L620 546 L1180 470 L1680 402"
            fill="none"
            stroke="currentColor"
            strokeWidth="26"
            strokeOpacity="0.5"
            strokeLinecap="round"
          />

          {/* 車寄せへ向かう進入経路 */}
          <path
            d="M620 546 C 740 530, 790 470, 806 404 C 820 348, 862 322, 918 322"
            fill="none"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 進行方向の矢印 */}
          <path
            d="M900 310 L924 322 L900 334"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 目的地（車寄せ）の位置 */}
          <circle cx="972" cy="322" r="15" fill="none" stroke="currentColor" strokeWidth="7" />
          <circle cx="972" cy="322" r="4" fill="currentColor" />

          {/* 建物の輪郭 */}
          <path
            d="M1010 250h150v190h-150z"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeOpacity="0.75"
          />
          <path
            d="M1040 250v190M1080 250v190M1120 250v190"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeOpacity="0.45"
          />
        </g>
      </svg>
    </div>
  );
}
