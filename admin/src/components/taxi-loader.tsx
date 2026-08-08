/**
 * 読み込み中の演出。
 *
 * 日本のタクシー（JPN TAXI 型の箱型ボディ、屋根の行灯、赤い「空車」表示）が
 * 画面の左端から右端まで一直線に走り抜け、後ろにタイヤ痕を残す。
 * **走り切るまでの時間がそのまま読み込み時間**になるよう、
 * 横断のアニメーションを繰り返し再生する。
 *
 * Next.js の loading.tsx から使われ、ページのデータ取得が終わると
 * 自動的に差し替わる。
 */
export function TaxiLoader({
  label,
  durationSeconds = 2.4,
}: {
  label: string;
  durationSeconds?: number;
}) {
  const duration = `${durationSeconds}s`;

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-8"
      role="status"
      aria-live="polite"
    >
      <div
        className="relative w-full overflow-hidden"
        style={{ ['--kn-duration' as string]: duration }}
      >
        {/*
          路面。
          タイヤ痕はタクシーと同じ区間 (-22vw 〜 112vw) を覆う帯にして、
          同じ duration で scaleX させる。こうしないと痕の先端と
          車輪の位置がずれて、痕だけが先に伸びたように見えてしまう。
        */}
        <div className="relative h-28">
          <div className="absolute bottom-[20px] left-[-22vw] h-[3px] w-[134vw] overflow-hidden">
            <div className="tire-track h-full w-full bg-gradient-to-r from-transparent via-text-faint/40 to-text-faint/75" />
          </div>
          <div className="absolute bottom-[13px] left-[-22vw] h-[3px] w-[134vw] overflow-hidden">
            <div className="tire-track h-full w-full bg-gradient-to-r from-transparent via-text-faint/25 to-text-faint/55" />
          </div>

          {/* 路面のライン */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-border-strong" />

          {/* タクシー */}
          <div className="taxi-run absolute bottom-[8px] left-0">
            <div className="taxi-body">
              <JapaneseTaxi />
            </div>
          </div>
        </div>
      </div>

      <p className="font-mincho text-sm tracking-widest text-text-muted">{label}</p>
    </div>
  );
}

/** 日本のタクシー（側面図） */
function JapaneseTaxi() {
  return (
    <svg width="132" height="62" viewBox="0 0 132 62" fill="none" aria-hidden>
      {/* 行灯（屋根の表示灯） */}
      <rect x="52" y="2" width="26" height="9" rx="2.5" fill="var(--c-gold)" />
      <rect
        x="52"
        y="2"
        width="26"
        height="9"
        rx="2.5"
        stroke="var(--c-text)"
        strokeOpacity="0.35"
        strokeWidth="1"
      />

      {/* 車体 — JPN TAXI 風の背の高い箱型 */}
      <path
        d="M10 46V30c0-3 1.5-5 4-6l10-4 6-8c1.2-1.6 3-2.4 5-2.4h34c2 0 3.8.8 5 2.4l6 8 10 4c2.5 1 4 3 4 6v16H10Z"
        fill="var(--c-taxi-body)"
      />

      {/* 窓 */}
      <path d="M33 26l5-6.6c.6-.8 1.5-1.2 2.5-1.2H63v7.8H33Z" fill="var(--c-taxi-glass)" />
      <path d="M68 18.2h16c1 0 1.9.4 2.5 1.2l5 6.6H68v-7.8Z" fill="var(--c-taxi-glass)" />

      {/* 側面の白い帯（日本のタクシーによくある意匠）。
          黒い車体の上に乗るため、テーマに依らず生成り色で固定する。 */}
      <rect x="12" y="35" width="106" height="3" rx="1.5" fill="#efe9dd" fillOpacity="0.8" />

      {/* 「空車」表示 */}
      <rect x="76" y="28" width="17" height="8" rx="1.5" fill="var(--c-accent)" />
      <text
        x="84.5"
        y="34.4"
        textAnchor="middle"
        fontSize="6.5"
        fill="#fff"
        fontFamily='"Yu Gothic UI", "Hiragino Kaku Gothic ProN", sans-serif'
        fontWeight="700"
      >
        空車
      </text>

      {/* ヘッドライト・テールランプ */}
      <rect x="115" y="30" width="5" height="4" rx="1.5" fill="#ffe9a8" />
      <rect x="10" y="30" width="4" height="4" rx="1.5" fill="var(--c-accent)" />

      {/* 車輪 */}
      <g>
        <circle cx="34" cy="46" r="9" fill="var(--c-taxi-body)" />
        <circle cx="34" cy="46" r="9" stroke="var(--c-taxi-stroke)" strokeWidth="1" />
        <g className="wheel-spin">
          <circle cx="34" cy="46" r="4" fill="var(--c-bg)" />
          <path
            d="M34 42v8M30 46h8M31.2 43.2l5.6 5.6M36.8 43.2l-5.6 5.6"
            stroke="var(--c-text-faint)"
            strokeWidth="0.9"
          />
        </g>
      </g>
      <g>
        <circle cx="98" cy="46" r="9" fill="var(--c-taxi-body)" />
        <circle cx="98" cy="46" r="9" stroke="var(--c-taxi-stroke)" strokeWidth="1" />
        <g className="wheel-spin">
          <circle cx="98" cy="46" r="4" fill="var(--c-bg)" />
          <path
            d="M98 42v8M94 46h8M95.2 43.2l5.6 5.6M100.8 43.2l-5.6 5.6"
            stroke="var(--c-text-faint)"
            strokeWidth="0.9"
          />
        </g>
      </g>
    </svg>
  );
}
