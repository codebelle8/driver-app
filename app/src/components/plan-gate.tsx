import { Redirect, usePathname } from 'expo-router';
import { type ReactNode } from 'react';

import { isExpired } from '@/lib/account';
import { useAccount } from '@/lib/account-context';

/**
 * 無料期間が終わったあと、お支払いが済むまでの締め。
 *
 * **入れる。ただし設定より先へは進めない。**
 *   ご指示による。ログインまで断ると、お支払いの手続きにも
 *   たどり着けなくなる。中へは入っていただき、行ける先を絞る。
 *
 * **なぜ経路で見るか**
 *   下の帯から項目を消すだけでは足りない。ブラウザなら住所を
 *   直に打てば入れてしまうし、以前開いた画面が履歴から復元される。
 *   経路そのものを見て、開いてよい先かどうかを決める。
 *
 * **children は外さない**
 *   Redirect だけを返すと、その瞬間に画面の並び全体が外れ、
 *   組み直しになる。並べて置き、移り先だけを指示する。
 */

/**
 * 締めているあいだも開ける先。
 *
 *   /mypage   設定。ご指示の「設定だけは使える」がこれ。
 *   /plan     お支払いの手続き。ここへ行けないと、締めた意味が無い。
 *   /account  お名前・パスワード。締めていても、ご自身のことは直せる。
 *   /notices  お知らせ。締めた理由がここに出ている。
 *   /chat, /ranking, /my-submissions, /chat-room
 *             チャット（情報提供ランキング・情報交換）と、送った情報
 *             （ご回答 2026-10-05）。情報を送って無料を目指す入口にもなるため。
 */
const OPEN = ['/mypage', '/plan', '/account', '/notices', '/chat', '/ranking', '/my-submissions', '/chat-room'];

export function PlanGate({ children }: { children: ReactNode }) {
  const { account } = useAccount();
  const pathname = usePathname();

  const locked = !!account && isExpired(account);
  const allowed = OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <>
      {locked && !allowed && <Redirect href="/mypage" />}
      {children}
    </>
  );
}

/** 締めているか。帯や左メニューが、出す項目を決めるのに使う。 */
export function useLocked(): boolean {
  const { account } = useAccount();
  return !!account && isExpired(account);
}
