'use client';

import { useEffect, useState } from 'react';

/**
 * 読み込み中の表示。
 *
 * 中央にスポーツタイプのステアリング（カーボン製スポーク、
 * 12時位置のセンターマーカー、パドルシフト）を置き、左右へ切る。
 * 両脇にデジタルメーター風の計器を配置して進捗を示す。
 *
 * 意匠について:
 *   特定メーカーのエンブレムやカラーストライプは商標にあたるため再現しない。
 *   形状と質感は同系統に寄せつつ、中央のエンブレムは本アプリの配色を使う。
 *
 * 進捗について:
 *   Next.js の loading.tsx は Suspense の待機表示であり、
 *   実際の残り時間を知る手段が無い。そのため 100% へ漸近する
 *   曲線で表示し、描画が終わった時点で本体に差し替わる。
 */
export function SteeringLoader({
  label,
  className = 'min-h-[60vh]',
}: {
  label: string;
  /** 重ねて表示する場合は高さ指定を外して使う */
  className?: string;
}) {
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
      className={`flex flex-col items-center justify-center gap-10 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center justify-center gap-4 sm:gap-8">
        <Gauge value={progress} caption="LOAD" unit="%" redlineFrom={80} />
        <SteeringWheel progress={progress} />
        <Gauge value={progress} caption="DATA" unit="%" redlineFrom={80} mirrored />
      </div>

      <p className="text-sm tracking-wide text-text-muted">{label}</p>
      <span className="sr-only">{Math.round(progress)}%</span>
    </div>
  );
}

/* ========================================================================== */

/** スポーツステアリング（革巻きリム＋カーボンスポーク） */
function SteeringWheel({ progress }: { progress: number }) {
  // リム上部のシフトインジケーターを進捗に合わせて点灯させる
  const lampCount = 9;
  const litLamps = Math.round((progress / 100) * lampCount);

  return (
    <svg width="238" height="238" viewBox="0 0 240 240" className="shrink-0" aria-hidden>
      <defs>
        {/* 革巻きリムの陰影。上方から光が当たる想定 */}
        <linearGradient id="swRim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--c-wheel-hi)" />
          <stop offset="28%" stopColor="var(--c-wheel-1)" />
          <stop offset="70%" stopColor="var(--c-wheel-2)" />
          <stop offset="100%" stopColor="var(--c-wheel-3)" />
        </linearGradient>

        {/* リム断面の丸み */}
        <radialGradient id="swRimRound" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="42%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.5" />
        </radialGradient>

        {/* カーボン繊維の綾織り */}
        <pattern id="swCarbon" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#14171a" />
          <rect width="5" height="5" fill="#1f2429" />
          <rect x="5" y="5" width="5" height="5" fill="#1f2429" />
          <path d="M0 0l5 5M5 5l5 5" stroke="#2b3237" strokeWidth="0.7" />
          <path d="M5 0l-5 5M10 5l-5 5" stroke="#0e1113" strokeWidth="0.7" />
        </pattern>

        <linearGradient id="swCarbonSheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
        </linearGradient>

        {/* ハブ（エアバッグカバー） */}
        <radialGradient id="swHub" cx="40%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#3c434a" />
          <stop offset="55%" stopColor="#22272c" />
          <stop offset="100%" stopColor="#101315" />
        </radialGradient>

        {/* 金属パドル */}
        <linearGradient id="swPaddle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9aa4ac" />
          <stop offset="50%" stopColor="#5d666d" />
          <stop offset="100%" stopColor="#2f363b" />
        </linearGradient>

        <filter id="swShadow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" floodOpacity="0.42" />
        </filter>
      </defs>

      {/*
        回転の中心はステアリングの中心 (120,120)。
        ハブを中心からずらすと、回したときに軸ぶれして玩具のように見える。
      */}
      <g className="steer-wheel" filter="url(#swShadow)">
        {/* --- パドルシフト（リムの裏側にあるため最背面） --- */}
        <path
          d="M40 92c-9 3-13 12-12 22l2 22c1 9 7 13 13 10l4-2-3-54Z"
          fill="url(#swPaddle)"
          stroke="#0d1012"
          strokeWidth="1"
        />
        <path
          d="M200 92c9 3 13 12 12 22l-2 22c-1 9-7 13-13 10l-4-2 3-54Z"
          fill="url(#swPaddle)"
          stroke="#0d1012"
          strokeWidth="1"
        />

        {/* --- スポーク（カーボン） --- */}
        {/* 左右スポーク: 中心からリムへ向かって伸びる */}
        <path d="M120 102 L48 106 a9 9 0 0 0 0 28 L120 138 Z" fill="url(#swCarbon)" />
        <path d="M120 102 L192 106 a9 9 0 0 1 0 28 L120 138 Z" fill="url(#swCarbon)" />
        {/* 下スポーク */}
        <path d="M104 120 L110 194 a10 10 0 0 0 20 0 L136 120 Z" fill="url(#swCarbon)" />

        {/* カーボンの照りと、輪郭を締める縁取り。
            縁が無いと暗い背景・暗いリムに溶けて、ただの輪に見えてしまう。 */}
        <path
          d="M120 102 L48 106 a9 9 0 0 0 0 28 L120 138 Z"
          fill="url(#swCarbonSheen)" stroke="#59636b" strokeOpacity="0.55" strokeWidth="1"
        />
        <path
          d="M120 102 L192 106 a9 9 0 0 1 0 28 L120 138 Z"
          fill="url(#swCarbonSheen)" stroke="#59636b" strokeOpacity="0.55" strokeWidth="1"
        />
        <path
          d="M104 120 L110 194 a10 10 0 0 0 20 0 L136 120 Z"
          fill="url(#swCarbonSheen)" stroke="#59636b" strokeOpacity="0.55" strokeWidth="1"
        />

        {/* スポーク上面のハイライト */}
        <path
          d="M56 110h56M128 110h56"
          stroke="#ffffff" strokeOpacity="0.16" strokeWidth="2.5" strokeLinecap="round"
        />
        <path
          d="M112 142l3 48"
          stroke="#ffffff" strokeOpacity="0.12" strokeWidth="2.5" strokeLinecap="round"
        />

        {/* スポーク上の操作ボタン */}
        {[
          [62, 112],
          [62, 124],
          [78, 112],
          [78, 124],
        ].map(([x, y]) => (
          <rect
            key={`l${x}${y}`}
            x={x}
            y={y}
            width="11"
            height="7"
            rx="2"
            fill="#2c3237"
            stroke="#0e1113"
            strokeWidth="0.6"
          />
        ))}
        {[
          [151, 112],
          [151, 124],
          [167, 112],
          [167, 124],
        ].map(([x, y]) => (
          <rect
            key={`r${x}${y}`}
            x={x}
            y={y}
            width="11"
            height="7"
            rx="2"
            fill="#2c3237"
            stroke="#0e1113"
            strokeWidth="0.6"
          />
        ))}

        {/* --- リム（革巻き。下部はやや平たいDシェイプ寄り） --- */}
        <path
          d="M120 16a104 104 0 1 1 0 208 104 104 0 0 1 0-208Zm0 26a78 78 0 1 0 0 156 78 78 0 0 0 0-156Z"
          fill="url(#swRim)"
          fillRule="evenodd"
        />
        <path
          d="M120 16a104 104 0 1 1 0 208 104 104 0 0 1 0-208Zm0 26a78 78 0 1 0 0 156 78 78 0 0 0 0-156Z"
          fill="url(#swRimRound)"
          fillRule="evenodd"
        />

        {/* 縁の締め */}
        <circle cx="120" cy="120" r="104" fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="1.5" />
        <circle cx="120" cy="120" r="78" fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="1.8" />

        {/* 革の二重ステッチ */}
        <circle
          cx="120" cy="120" r="93"
          fill="none" stroke="var(--c-wheel-stitch)" strokeOpacity="0.5"
          strokeWidth="1.3" strokeDasharray="3 6" strokeLinecap="round"
        />
        <circle
          cx="120" cy="120" r="88"
          fill="none" stroke="var(--c-wheel-stitch)" strokeOpacity="0.28"
          strokeWidth="1.1" strokeDasharray="3 6" strokeLinecap="round"
        />

        {/* グリップ部の膨らみ（9時・3時） */}
        <path d="M16 108a104 104 0 0 0 0 24l10-2a78 78 0 0 1 0-20Z" fill="#000" opacity="0.22" />
        <path d="M224 108a104 104 0 0 1 0 24l-10-2a78 78 0 0 0 0-20Z" fill="#000" opacity="0.22" />

        {/* 上部の反射 */}
        <path
          d="M62 58a92 92 0 0 1 116 0"
          fill="none" stroke="#ffffff" strokeOpacity="0.26"
          strokeWidth="3.5" strokeLinecap="round"
        />

        {/* 12時位置のセンターマーカー（直進位置の目印） */}
        <rect x="115.5" y="17" width="9" height="24" rx="2" fill="#d0342c" />
        <rect x="115.5" y="17" width="9" height="24" rx="2" fill="#fff" opacity="0.12" />

        {/* リム上部のシフトインジケーター。進捗に応じて点灯する */}
        {Array.from({ length: lampCount }, (_, i) => {
          const angle = (-52 + i * 13) * (Math.PI / 180);
          const r = 96;
          const lit = i < litLamps;
          const color = i >= 7 ? 'var(--c-danger)' : i >= 5 ? '#e0a33e' : 'var(--c-accent)';
          return (
            <circle
              key={i}
              cx={120 + r * Math.sin(angle)}
              cy={120 - r * Math.cos(angle)}
              r="3.1"
              fill={lit ? color : '#31383d'}
              opacity={lit ? 1 : 0.85}
            />
          );
        })}

        {/* --- ハブ（エアバッグ部） --- */}
        <circle cx="120" cy="120" r="34" fill="url(#swHub)" />
        <circle cx="120" cy="120" r="34" fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="1.6" />
        <ellipse cx="120" cy="106" rx="24" ry="11" fill="#ffffff" opacity="0.08" />
        {/* カバーの分割線 */}
        <path d="M92 134q28 9 56 0" fill="none" stroke="#000" strokeOpacity="0.32" strokeWidth="1" />

        {/* エンブレム（商標を避け、本アプリの配色で構成） */}
        <circle cx="120" cy="120" r="15" fill="#0f1417" stroke="var(--c-accent)" strokeWidth="2" />
        <path
          d="M120 111.5v14M120 125.5l-4.5-4.5M120 125.5l4.5-4.5"
          fill="none" stroke="var(--c-accent)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        />

        {/* 下スポークのカーボン板とアクセント */}
        <rect x="108" y="168" width="24" height="30" rx="4" fill="url(#swCarbon)" />
        <rect x="108" y="168" width="24" height="30" rx="4" fill="url(#swCarbonSheen)" />
        <rect x="112" y="190" width="16" height="3" rx="1.5" fill="var(--c-accent)" />
      </g>
    </svg>
  );
}

/* ========================================================================== */

const SIZE = 128;
const C = SIZE / 2;
const START = -125; // 目盛りの開始角（12時を0°として時計回り）
const SWEEP = 250; // 可動域
const angleOf = (v: number) => START + (v / 100) * SWEEP;

/** 極座標 → 直交座標。12時を0°、時計回りを正とする。 */
function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

/**
 * 円弧のパスを組み立てる。
 *
 * stroke-dasharray と rotate の組み合わせでも描けるが、
 * 開始位置と長さの計算がずれやすく、実際にレッドゾーンが
 * 反対側に出る不具合を出した。角度から直接パスを引く方が確実。
 */
function arcPath(r: number, fromDeg: number, toDeg: number): string {
  const [x1, y1] = polar(r, fromDeg);
  const [x2, y2] = polar(r, toDeg);
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

/**
 * デジタルクラスター風の円形計器。
 * 金属ベゼル・レッドゾーン・細かい目盛り・
 * デジタル数値・ガラスの映り込みで実物の質感に寄せる。
 */
function Gauge({
  value,
  caption,
  unit,
  redlineFrom,
  mirrored = false,
}: {
  value: number;
  caption: string;
  unit: string;
  redlineFrom: number;
  mirrored?: boolean;
}) {
  const uid = caption.toLowerCase();

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        <defs>
          {/* 金属ベゼル */}
          <linearGradient id={`bezel-${uid}`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#aeb7bd" />
            <stop offset="30%" stopColor="#5e686f" />
            <stop offset="60%" stopColor="#2e353a" />
            <stop offset="100%" stopColor="#7d868c" />
          </linearGradient>

          {/* 文字盤 */}
          <radialGradient id={`face-${uid}`} cx="50%" cy="34%" r="76%">
            <stop offset="0%" stopColor="#232a2f" />
            <stop offset="62%" stopColor="#12171a" />
            <stop offset="100%" stopColor="#080b0d" />
          </radialGradient>

          {/* ガラスの映り込み */}
          <linearGradient id={`glass-${uid}`} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* 針 */}
          <linearGradient id={`needle-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff6a52" />
            <stop offset="100%" stopColor="#c02a1c" />
          </linearGradient>

          <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ベゼルと文字盤 */}
        <circle cx={C} cy={C} r="62" fill={`url(#bezel-${uid})`} />
        <circle cx={C} cy={C} r="57" fill={`url(#face-${uid})`} />
        <circle cx={C} cy={C} r="57" fill="none" stroke="#000" strokeOpacity="0.6" strokeWidth="1.2" />

        {/* 目盛り帯（外周のベース） */}
        <path
          d={arcPath(53, angleOf(0), angleOf(100))}
          fill="none"
          stroke="#39434a"
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        {/* レッドゾーン（高い側だけを赤くする） */}
        <path
          d={arcPath(53, angleOf(redlineFrom), angleOf(100))}
          fill="none"
          stroke="#c62828"
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        {/* 目盛り */}
        {Array.from({ length: 51 }, (_, i) => {
          const v = i * 2;
          const a = angleOf(v) * (Math.PI / 180);
          const major = v % 10 === 0;
          const r1 = 51;
          const r2 = major ? 42 : 47;
          return (
            <line
              key={i}
              x1={C + r1 * Math.sin(a)}
              y1={C - r1 * Math.cos(a)}
              x2={C + r2 * Math.sin(a)}
              y2={C - r2 * Math.cos(a)}
              stroke={v >= redlineFrom ? '#e05a4d' : '#c7d0d5'}
              strokeWidth={major ? 2.1 : 0.9}
              strokeLinecap="round"
              opacity={major ? 0.95 : 0.55}
            />
          );
        })}

        {/* 数字 */}
        {[0, 20, 40, 60, 80, 100].map((v) => {
          const a = angleOf(v) * (Math.PI / 180);
          const r = 33;
          return (
            <text
              key={v}
              x={C + r * Math.sin(a)}
              y={C - r * Math.cos(a) + 3.4}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill={v >= redlineFrom ? '#e8756a' : '#aab5bb'}
              fontFamily="ui-monospace, Consolas, monospace"
            >
              {v / 10}
            </text>
          );
        })}

        {/* 進捗の発光弧 */}
        {value > 0.5 && (
          <path
            d={arcPath(45, angleOf(0), angleOf(value))}
            fill="none"
            stroke="var(--c-accent)"
            strokeWidth="3"
            strokeLinecap="round"
            filter={`url(#glow-${uid})`}
          />
        )}

        {/*
          デジタル表示は目盛りの切れ目（真下）に置く。
          中央に置くと針の軸に隠れて読めない。
        */}
        {/* 見出しは針の軸より下。上に置くと目盛りの数字と重なる。 */}
        <text
          x={C} y={C + 21}
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          fill="var(--c-accent)"
          letterSpacing="1.8"
        >
          {caption}
        </text>
        <text
          x={C} y={C + 40}
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          fill="#f2f6f8"
          fontFamily="ui-monospace, Consolas, monospace"
        >
          {Math.round(value)}
          <tspan fontSize="9" fill="#8d979d" dx="1.5">
            {unit}
          </tspan>
        </text>

        {/* 針 */}
        <g
          style={{
            transform: `rotate(${angleOf(value)}deg)`,
            transformOrigin: `${C}px ${C}px`,
            transition: 'transform 120ms linear',
          }}
        >
          {/* 先端に向かって細くなる形状＋逆側のカウンターウェイト */}
          <path
            d={`M${C - 3.2} ${C} L${C - 1} ${C - 47} L${C + 1} ${C - 47} L${C + 3.2} ${C} Z`}
            fill={`url(#needle-${uid})`}
          />
          <rect x={C - 2.4} y={C} width="4.8" height="13" rx="2.4" fill="#6d777d" />
        </g>

        {/* 針の軸 */}
        <circle cx={C} cy={C} r="6.5" fill="#39424a" />
        <circle cx={C} cy={C} r="6.5" fill="none" stroke="#0b0e10" strokeWidth="1" />
        <circle cx={C} cy={C - 1.6} r="3" fill="#7f8a91" opacity="0.7" />

        {/* ガラスの映り込み（左上から下へ流れる楕円） */}
        <path
          d={`M${C - 50} ${C - 22} a54 54 0 0 1 96 -14 a58 58 0 0 0 -96 14 Z`}
          fill={`url(#glass-${uid})`}
          transform={mirrored ? `scale(-1,1) translate(${-SIZE},0)` : undefined}
        />
        <circle cx={C} cy={C} r="57" fill={`url(#glass-${uid})`} opacity="0.5" />
      </svg>
    </div>
  );
}
