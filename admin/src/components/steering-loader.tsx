'use client';

import { useEffect, useState } from 'react';

/**
 * 読み込み中の表示。
 *
 * 中央に自動車のハンドルを置き、左右に切りながら回転させる。
 * 両脇の計器が進捗を示す。
 *
 * 進捗について:
 *   Next.js の loading.tsx は Suspense の待機表示であり、
 *   実際の残り時間を知る手段が無い。そのため 100% へ漸近する
 *   曲線で表示し、描画が終わった時点で本体に差し替わる。
 *   （見かけ上の進捗であることを踏まえ、95% で頭打ちにしている）
 */
export function SteeringLoader({ label }: { label: string }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      // 最初は速く、後半はゆるやかに 95% へ近づく
      setProgress(Math.min(95, 95 * (1 - Math.exp(-elapsed / 1.6))));
    }, 60);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-10"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center justify-center gap-6 sm:gap-10">
        <Gauge value={progress} caption="LOAD" showPercent />
        <SteeringWheel />
        <Gauge value={progress} caption="DATA" />
      </div>

      <p className="text-sm tracking-wide text-text-muted">{label}</p>
      <span className="sr-only">{Math.round(progress)}%</span>
    </div>
  );
}

/** 自動車のハンドル（3本スポーク・革巻き） */
function SteeringWheel() {
  return (
    <svg
      width="188"
      height="188"
      viewBox="0 0 200 200"
      className="shrink-0"
      aria-hidden
    >
      <defs>
        {/* 革巻きリムの陰影。上から光が当たっている想定 */}
        <linearGradient id="rimShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--c-wheel-hi)" />
          <stop offset="35%" stopColor="var(--c-wheel-1)" />
          <stop offset="75%" stopColor="var(--c-wheel-2)" />
          <stop offset="100%" stopColor="var(--c-wheel-3)" />
        </linearGradient>

        {/* リム断面の丸みを出す内側グラデーション */}
        <radialGradient id="rimRound" cx="50%" cy="34%" r="68%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.30" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.42" />
        </radialGradient>

        <linearGradient id="spokeShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--c-wheel-1)" />
          <stop offset="55%" stopColor="var(--c-wheel-2)" />
          <stop offset="100%" stopColor="var(--c-wheel-3)" />
        </linearGradient>

        <radialGradient id="hubShade" cx="42%" cy="34%" r="72%">
          <stop offset="0%" stopColor="var(--c-wheel-1)" />
          <stop offset="60%" stopColor="var(--c-wheel-2)" />
          <stop offset="100%" stopColor="var(--c-wheel-3)" />
        </radialGradient>

        <filter id="wheelShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.35" />
        </filter>
      </defs>

      {/*
        回転の中心はハンドルの中心 (100,100)。
        ハブを中心からずらすと、回したときに軸ぶれして玩具のように見える。
      */}
      <g className="steer-wheel" filter="url(#wheelShadow)">
        {/* --- スポーク（リムより先に描き、リムの下へ潜らせる） --- */}
        {/* 左右のスポークは中心からリムへ向かって細くなる台形にする */}
        <path d="M100 88 L34 93 a7 7 0 0 0 0 14 L100 112 Z" fill="url(#spokeShade)" />
        <path d="M100 88 L166 93 a7 7 0 0 1 0 14 L100 112 Z" fill="url(#spokeShade)" />
        {/* 下スポークは太く、ハブから下へ伸びる */}
        <path d="M87 100 L93 166 a8 8 0 0 0 14 0 L113 100 Z" fill="url(#spokeShade)" />

        {/* スポーク上面のハイライト（金属・樹脂の照り） */}
        <path
          d="M44 96h48M108 96h48"
          stroke="#ffffff"
          strokeOpacity="0.13"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M95 112l3 52"
          stroke="#ffffff"
          strokeOpacity="0.10"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* --- リム（革巻き） --- */}
        {/* 外周から内周までをドーナツ状に塗る */}
        <path
          d="M100 14a86 86 0 1 1 0 172 86 86 0 0 1 0-172Zm0 22a64 64 0 1 0 0 128 64 64 0 0 0 0-128Z"
          fill="url(#rimShade)"
          fillRule="evenodd"
        />
        {/* 断面の丸みを重ねて立体に見せる */}
        <path
          d="M100 14a86 86 0 1 1 0 172 86 86 0 0 1 0-172Zm0 22a64 64 0 1 0 0 128 64 64 0 0 0 0-128Z"
          fill="url(#rimRound)"
          fillRule="evenodd"
        />

        {/* 外周と内周の縁を締める */}
        <circle cx="100" cy="100" r="86" fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth="1.4" />
        <circle cx="100" cy="100" r="64" fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="1.6" />

        {/* 革の縫い目 — リムの中央を一周する二重ステッチ */}
        <circle
          cx="100"
          cy="100"
          r="76.5"
          fill="none"
          stroke="var(--c-wheel-stitch)"
          strokeOpacity="0.5"
          strokeWidth="1.3"
          strokeDasharray="3 5.5"
          strokeLinecap="round"
        />
        <circle
          cx="100"
          cy="100"
          r="72.5"
          fill="none"
          stroke="var(--c-wheel-stitch)"
          strokeOpacity="0.3"
          strokeWidth="1.1"
          strokeDasharray="3 5.5"
          strokeLinecap="round"
        />

        {/* 上部の反射ハイライト */}
        <path
          d="M52 54a74 74 0 0 1 96 0"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.26"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        {/* 下部のわずかな照り返し */}
        <path
          d="M62 152a74 74 0 0 0 76 0"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.07"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* --- 中央ハブ（エアバッグ部） --- */}
        <circle cx="100" cy="100" r="31" fill="url(#hubShade)" />
        <circle cx="100" cy="100" r="31" fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth="1.6" />
        {/* 上面の照り */}
        <ellipse cx="100" cy="88" rx="22" ry="10" fill="#ffffff" opacity="0.09" />
        {/* 合わせ目の線（実物のエアバッグカバーの分割線） */}
        <path
          d="M76 112q24 8 48 0"
          fill="none"
          stroke="#000"
          strokeOpacity="0.3"
          strokeWidth="1"
        />

        {/* ハブ中央のエンブレム */}
        <circle
          cx="100"
          cy="100"
          r="12"
          fill="none"
          stroke="var(--c-accent)"
          strokeOpacity="0.9"
          strokeWidth="2"
        />
        <path
          d="M100 93.5v13M100 106.5l-4-4M100 106.5l4-4"
          fill="none"
          stroke="var(--c-accent)"
          strokeOpacity="0.75"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** 円形メーター。進捗を針と数値で示す。 */
function Gauge({
  value,
  caption,
  showPercent = false,
}: {
  value: number;
  caption: string;
  showPercent?: boolean;
}) {
  // 針は -120° 〜 +120° を可動域とする（実車の計器に近い扇形）
  const angle = -120 + (value / 100) * 240;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  // 240°ぶんの弧長
  const arcLength = circumference * (240 / 360);

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden>
        <defs>
          <linearGradient id={`gaugeArc-${caption}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--c-accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--c-accent)" />
          </linearGradient>
        </defs>

        <circle cx="52" cy="52" r="49" fill="var(--c-gauge-face)" />
        <circle
          cx="52"
          cy="52"
          r="49"
          fill="none"
          stroke="var(--c-gauge-ring)"
          strokeWidth="2"
        />

        {/* 目盛り */}
        {Array.from({ length: 13 }, (_, i) => {
          const a = (-120 + i * 20) * (Math.PI / 180);
          const major = i % 3 === 0;
          const r1 = 44;
          const r2 = major ? 36 : 40;
          return (
            <line
              key={i}
              x1={52 + r1 * Math.sin(a)}
              y1={52 - r1 * Math.cos(a)}
              x2={52 + r2 * Math.sin(a)}
              y2={52 - r2 * Math.cos(a)}
              stroke="var(--c-text-faint)"
              strokeWidth={major ? 1.8 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* 進捗の弧 */}
        <circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          stroke={`url(#gaugeArc-${caption})`}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(arcLength * value) / 100} ${circumference}`}
          transform="rotate(120 52 52)"
          style={{ transition: 'stroke-dasharray 120ms linear' }}
        />

        {/* 針 */}
        <g
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: '52px 52px',
            transition: 'transform 120ms linear',
          }}
        >
          <line
            x1="52"
            y1="56"
            x2="52"
            y2="20"
            stroke="var(--c-danger)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </g>
        <circle cx="52" cy="52" r="4.5" fill="var(--c-text-muted)" />
        <circle cx="52" cy="52" r="2" fill="var(--c-gauge-face)" />

        {showPercent && (
          <text
            x="52"
            y="80"
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fill="var(--c-text)"
            fontFamily="ui-monospace, Consolas, monospace"
          >
            {Math.round(value)}%
          </text>
        )}
      </svg>

      <span className="text-[10px] font-semibold tracking-[0.2em] text-text-faint">
        {caption}
      </span>
    </div>
  );
}
