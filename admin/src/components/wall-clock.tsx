'use client';

import { useEffect, useState } from 'react';

/**
 * 背景に描く昭和レトロ調の掛け時計。
 *
 * 日本の家庭や事業所で広く見られる丸型の掛け時計を模している。
 * 秒針は赤（朱）、文字盤は12分割の目盛りという構成が、
 * 日本人にとって最も見慣れた掛け時計の姿。
 *
 * 現在時刻を実際に指す。装飾でありながら実用も兼ねるため、
 * ヘッダーにはデジタル時計を併置している。
 */
export function WallClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // サーバーとクライアントで時刻がずれるため、描画後に開始する
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h = now ? now.getHours() % 12 : 0;
  const m = now ? now.getMinutes() : 0;
  const s = now ? now.getSeconds() : 0;

  const hourAngle = h * 30 + m * 0.5;
  const minuteAngle = m * 6 + s * 0.1;
  const secondAngle = s * 6;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden"
    >
      <svg
        viewBox="0 0 400 400"
        className="h-[min(66vw,66vh)] w-[min(66vw,66vh)]"
        style={{
          color: 'var(--c-clock-line)',
          opacity: 'var(--c-clock-opacity)',
        }}
      >
        {/* 外枠（木枠を思わせる二重円） */}
        <circle cx="200" cy="200" r="192" stroke="currentColor" strokeWidth="3" fill="none" />
        <circle cx="200" cy="200" r="178" stroke="currentColor" strokeWidth="1.2" fill="none" />

        {/* ゆっくり回る装飾リング（青海波を思わせる破線） */}
        <circle
          className="clock-ring"
          cx="200"
          cy="200"
          r="164"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 10"
          fill="none"
        />

        {/* 目盛り */}
        {Array.from({ length: 60 }, (_, i) => {
          const isHour = i % 5 === 0;
          const angle = (i * 6 * Math.PI) / 180;
          const outer = 168;
          const inner = isHour ? 148 : 160;
          return (
            <line
              key={i}
              x1={200 + outer * Math.sin(angle)}
              y1={200 - outer * Math.cos(angle)}
              x2={200 + inner * Math.sin(angle)}
              y2={200 - inner * Math.cos(angle)}
              stroke="currentColor"
              strokeWidth={isHour ? 4 : 1.2}
              strokeLinecap="round"
            />
          );
        })}

        {/* 漢数字の文字盤 — 十二・三・六・九のみ置いて和の印象を出す */}
        {[
          { label: '十二', x: 200, y: 118 },
          { label: '三', x: 282, y: 208 },
          { label: '六', x: 200, y: 296 },
          { label: '九', x: 118, y: 208 },
        ].map((n) => (
          <text
            key={n.label}
            x={n.x}
            y={n.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="currentColor"
            fontSize="26"
            fontFamily='"Yu Mincho", "Hiragino Mincho ProN", serif'
          >
            {n.label}
          </text>
        ))}

        {/* 針 */}
        <g style={{ transformOrigin: '200px 200px', transform: `rotate(${hourAngle}deg)` }}>
          <line x1="200" y1="212" x2="200" y2="112" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
        </g>
        <g style={{ transformOrigin: '200px 200px', transform: `rotate(${minuteAngle}deg)` }}>
          <line x1="200" y1="216" x2="200" y2="72" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
        </g>
        <g style={{ transformOrigin: '200px 200px', transform: `rotate(${secondAngle}deg)` }}>
          <line x1="200" y1="228" x2="200" y2="62" stroke="var(--c-accent)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="200" cy="200" r="7" fill="var(--c-accent)" />
        </g>
        <circle cx="200" cy="200" r="3" fill="var(--c-bg)" />
      </svg>
    </div>
  );
}

/** ヘッダーに置くデジタル時計。掛け時計と同じ現在時刻を数値で示す。 */
export function DigitalClock({ locale }: { locale: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // サーバー描画時は空にしておく（時刻がずれて hydration 警告が出るため）
  if (!now) return <span className="tabular text-xs text-text-faint">--:--:--</span>;

  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const date =
    locale === 'ja'
      ? `${now.getMonth() + 1}月${now.getDate()}日（${'日月火水木金土'[now.getDay()]}）`
      : now.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', weekday: 'short' });

  return (
    <span className="flex items-baseline gap-2">
      <span className="hidden text-xs text-text-faint lg:inline">{date}</span>
      <span className="tabular text-sm font-semibold text-text-muted">{time}</span>
    </span>
  );
}
