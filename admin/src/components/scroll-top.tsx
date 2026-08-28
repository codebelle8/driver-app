'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

/**
 * 一覧の先頭へ戻るボタン。
 *
 * 施設一覧やカテゴリ一覧を下まで見たあと、上へ戻すのに
 * 何度もスクロールするのは手間になる。ひと押しで戻せるようにする。
 *
 * 一定量スクロールするまで出さないのは、先頭付近では不要なうえ、
 * 常に浮いていると内容を隠すため。
 */

/** これだけ下へ送ると現れる */
const APPEAR_AFTER = 400;

/** 操作を離れてから尾灯を消すまでの時間 (ms)。一覧が戻り切るまで点けておく。 */
const BRAKE_HOLD = 600;

export function ScrollTopButton({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  /*
    送られるのは <main> の中であって、ページ全体ではない。
    ヘッダーとフッターを固定したため、window.scrollY は常に 0 になる。
    実際に動いている要素を見る必要がある。
  */
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;

    function onScroll() {
      setVisible((main as HTMLElement).scrollTop > APPEAR_AFTER);
    }
    onScroll();
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  /*
    操作している間、尾灯を点ける。車寄せで停まる動作はブレーキなので、
    操作の手応えを実際の車の挙動で返す。

    点けるのは、押し込んだ時点ではなくポインタを重ねた時点から。
    押してからでは、点いたことに気づかないまま操作が終わってしまう。

    離れてすぐ消さないのは、一覧が先頭へ戻り切るまで点けておくため。
  */
  const [braking, setBraking] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  function startBraking() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setBraking(true);
  }

  function endBraking() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setBraking(false), BRAKE_HOLD);
  }

  return (
    <button
      type="button"
      onClick={() =>
        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
      }
      // 押し込むのを待たず、重ねた時点で点ける。
      // 押してからでは、点いたことに気づかないまま操作が終わる。
      onPointerEnter={startBraking}
      onPointerDown={startBraking}
      onPointerLeave={endBraking}
      // キーボードで操作されたときも点ける
      onFocus={startBraking}
      onBlur={endBraking}
      aria-label={label}
      title={label}
      // 見えていないときは操作の対象からも外す。
      // 透明なだけだと、見えない場所を押せてしまう。
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={
        'fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center ' +
        'rounded-full border border-border bg-surface shadow-lg ' +
        'transition-all duration-200 hover:border-accent ' +
        (visible
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none translate-y-2 opacity-0')
      }
    >
      {/*
        4枚を重ねて置き、不透明度だけを切り替える。
        src を差し替える方式だと、初めて触れた瞬間に点灯版の取得が始まり、
        一拍遅れて光ることになる。

        明るい配色用 (car-light) は、車の周りに暗いふちが付いている。
        車体が白いため、白い面ではふちが無いと輪郭が消える。
      */}
      <span className="relative flex h-9 w-12 items-center justify-center">
        {[
          { file: 'car', lit: false, only: 'only-dark' },
          { file: 'car-brake', lit: true, only: 'only-dark' },
          { file: 'car-light', lit: false, only: 'only-light' },
          { file: 'car-light-brake', lit: true, only: 'only-light' },
        ].map(({ file, lit, only }) => (
          <Image
            key={file}
            src={`/brand/${file}.png`}
            alt=""
            aria-hidden
            width={96}
            height={86}
            className={
              `absolute h-9 w-auto ${only} ` + (lit === braking ? 'opacity-100' : 'opacity-0')
            }
          />
        ))}
      </span>
      <span
        // 下地と同じ色で縁取る。ボタンから切り抜いたように見せる。
        className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full border-2 border-surface bg-accent text-accent-text"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </span>
    </button>
  );
}
