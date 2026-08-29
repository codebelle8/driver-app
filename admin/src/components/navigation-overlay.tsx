"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SteeringLoader } from "@/components/steering-loader";

/**
 * 画面遷移中に、いま表示している画面の上へ重ねる読み込み表示。
 *
 * loading.tsx（Suspense の待機表示）は元の画面を差し替えてしまうため、
 * 「前の画面の上に重ねる」用途には使えない。そこで loading.tsx を置かず、
 * 遷移が始まったことを検知してこのオーバーレイを出す。
 *
 * 検知の方法:
 *   ページ内のリンククリックと GET フォームの送信を拾い、
 *   pathname が変わった時点で消す。Link を1つずつ書き換える必要がない。
 *
 * すぐに表示しない理由:
 *   先読み済みの画面へは一瞬で遷移するため、即座に出すと
 *   チラつきになる。少し待ってから出す。
 */
const SHOW_DELAY_MS = 180;
/**
 * 遷移が検知できないまま残り続けないための保険。
 *
 * 実測でサーバーの応答は 300ms 前後なので、3秒あれば十分に余裕がある。
 * 以前は15秒にしていたが、消し忘れが起きたときの待ち時間がそのまま
 * 利用者の待ち時間になっていた。短くして被害を抑える。
 */
const SAFETY_TIMEOUT_MS = 3000;

export function NavigationOverlay({ label }: { label: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    遷移が完了したら消す。

    **検索文字列まで見る必要がある。**
    ページ送りで変わるのは ?page=2 の部分だけで、pathname は /history のまま。
    pathname だけを見ていたため、ページ送りでは消えるきっかけが無く、
    表示が画面を覆ったまま残っていた。次の「次へ」が押せず、
    上の保険が働くまで待たされていた（実測で毎回14.5秒）。
  */
  const query = searchParams.toString();
  useEffect(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    setPending(false);
  }, [pathname, query]);

  useEffect(() => {
    function start() {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      showTimer.current = setTimeout(() => setPending(true), SHOW_DELAY_MS);
      safetyTimer.current = setTimeout(
        () => setPending(false),
        SAFETY_TIMEOUT_MS,
      );
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      // 左クリック以外、修飾キー付き（別タブで開く）は対象外
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin) return;
      // 同じ画面へのリンクは遷移が起きず、消すきっかけが無くなる
      if (url.pathname + url.search === location.pathname + location.search)
        return;

      start();
    }

    function onSubmit(event: SubmitEvent) {
      if (event.defaultPrevented) return;
      const form = event.target as HTMLFormElement | null;
      // 検索・絞り込みの GET フォームだけが画面遷移を伴う。
      // POST はサーバーアクション（その場で更新）なので対象外。
      if (!form || (form.method || "get").toLowerCase() !== "get") return;
      start();
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      if (showTimer.current) clearTimeout(showTimer.current);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    };
  }, []);

  if (!pending) return null;

  return (
    <div
      data-testid="navigation-overlay"
      /*
        操作を受け付けないようにする。

        これは「処理中」を伝えるためのもので、操作を止めるためのものではない。
        受け付ける状態にしておくと、万一消し忘れたときに画面全体が
        押せなくなる。実際にそれが起きて、ページ送りが15秒待たされていた。
      */
      style={{ pointerEvents: "none" }}
      className="nav-overlay fixed inset-0 z-50 flex items-center justify-center bg-bg/10 backdrop-blur-[1px]"
    >
      <SteeringLoader label={label} className="" />
    </div>
  );
}
