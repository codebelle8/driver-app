'use client';

import { useId } from 'react';

import type { Locale } from '@/lib/i18n/dictionaries';

/**
 * 言語の切り替えに添える国旗。
 *
 * **絵文字を使わない理由**
 *   🇯🇵 のような国旗の絵文字は、Windows では旗として描かれず
 *   「JP」「GB」という2文字のまま出る。管理画面を使うのは
 *   Windows の PC なので、そのままでは意味をなさない。
 *   図として描けば、どの環境でも同じものが出る。
 *
 * **英語に英国旗を当てている**
 *   言語としての英語を指す印としては、国よりも言語の出所を
 *   示すほうが誤解が少ない。米国旗にすると「米国向け」の
 *   意味に寄る。
 *
 * **縁を付ける**
 *   日本の旗は白地で、白い下地の上では輪郭が消える。
 *   細い縁を引いて、旗の形が分かるようにする。
 */
export function Flag({
  locale,
  size = 16,
  className = '',
}: {
  locale: Locale;
  size?: number;
  className?: string;
}) {
  /*
    clipPath の名前は、同じ画面に2つ出ても衝突しないようにする。
    切り替えのボタンと、開いた一覧の両方に同じ旗が出るため、
    決め打ちの名前だと後から描いたほうが前のものを塗り替える。
  */
  const uid = useId().replace(/:/g, '');

  const common = {
    width: size,
    // 旗の縦横比は 2:3。高さを幅から出す。
    height: Math.round((size * 2) / 3),
    viewBox: '0 0 60 40',
    'aria-hidden': true as const,
    className: `shrink-0 rounded-[2px] ring-1 ring-black/15 ${className}`,
  };

  if (locale === 'ja') {
    return (
      <svg {...common}>
        <rect width="60" height="40" fill="#fff" />
        {/* 日章は中央、直径は高さの 3/5 */}
        <circle cx="30" cy="20" r="12" fill="#BC002D" />
      </svg>
    );
  }

  return (
    <svg {...common} viewBox="0 0 60 30">
      <clipPath id={`f${uid}`}>
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      {/* 斜めの赤は、白の縁を片側だけ残すために半分ずつ描く */}
      <clipPath id={`h${uid}`}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <g clipPath={`url(#f${uid})`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path
          d="M0,0 L60,30 M60,0 L0,30"
          clipPath={`url(#h${uid})`}
          stroke="#C8102E"
          strokeWidth="4"
        />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}
