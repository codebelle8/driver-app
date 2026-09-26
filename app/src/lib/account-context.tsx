import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import {
  endRecovery,
  isRecovery,
  loadAccount,
  offlineLimitReached,
  recoveryPending,
  scrubUrlFragment,
  tookOver,
  type Account,
} from './account';
import { forgetSync, syncAccountData } from './sync-account';
import { supabase } from './supabase';

/**
 * いまログインしている会員を配る。
 *
 * **画面より外側に置く**
 *   マイページだけでなく、左メニューや今後の課金の判定も見ることになる。
 *   画面ごとに読み直すと、同じ問い合わせが画面の数だけ走る。
 *
 * **ログインしていなくても、待たせない**
 *   ready は「調べ終えたか」であって「ログインしているか」ではない。
 *   このアプリは登録しなくても使えるため、調べ終える前に一覧を出してよい。
 *   マイページの行だけが、調べ終えるまで形を決められない。
 *
 * **圏外で通しているあいだは、電波が戻ったら確かめ直す**
 *   圏外では、最後に確かめた会員の控えで通している（account.ts）。
 *   停止・ほかの端末への移動・期限の延長は、確かめ直すまで分からない。
 *   電波が戻った合図（ブラウザの online・アプリが表に出た）と、一定の
 *   間隔で確かめ直す。確かめられたら、いつもの状態に戻る。
 *
 * **再設定の途中を覚えておく**
 *   パスワード再設定のリンクから戻ってくると、Supabase は
 *   「ログイン済み」の状態にしたうえで PASSWORD_RECOVERY を知らせる。
 *   これを覚えていないと、ただログインしただけに見え、新しい
 *   パスワードを決める画面へ進めない。
 */

interface AccountContextValue {
  account: Account | null;
  /** 最初の確認が終わったか */
  ready: boolean;
  /** 再設定のリンクから戻ってきた直後か */
  recovering: boolean;
  /**
   * ほかの端末で入られて、この端末が出されたか。
   *
   * 一瞬で消える帯では、戻ってきた画面を見た方に理由が伝わらない。
   * 入口へ出したままにして、次に入るまで残す。
   */
  takenOver: boolean;
  /**
   * 圏外で使える日数を過ぎ、確かめ直しを待っているか。日数を持つ。
   *
   * 入口でログインの画面の代わりに「電波の届く場所で開いてください」を
   * 出す（圏外ではログインできないため、行き止まりを見せない）。
   */
  offlineLimit: { days: number } | null;
  doneRecovering: () => void;
  refresh: () => Promise<void>;
}

/** 圏外で通しているあいだ、確かめ直す間隔 */
const RECHECK_MS = 30_000;

const AccountContext = createContext<AccountContextValue>({
  account: null,
  ready: false,
  recovering: false,
  takenOver: false,
  offlineLimit: null,
  doneRecovering: () => {},
  refresh: async () => {},
});

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  /*
    最初から印を入れておく。

    出来事（PASSWORD_RECOVERY）を待つと、URL の後片付けと競り合う。
    後片付けが勝つと、そのまま中へ通していた。
  */
  /*
    最初から印を入れておく。

    出来事（PASSWORD_RECOVERY）を待つと、URL の後片付けと競り合う。
    後片付けが勝つと、そのまま中へ通していた。
  */
  const cameFromUrl = isRecovery();
  const [recovering, setRecovering] = useState(cameFromUrl);
  const [takenOver, setTakenOver] = useState(false);
  const [offlineLimit, setOfflineLimit] = useState<{ days: number } | null>(null);

  const refresh = useCallback(async () => {
    const found = await loadAccount();
    setAccount(found);
    setOfflineLimit(offlineLimitReached());
    if (tookOver()) setTakenOver(true);
  }, []);

  /*
    圏外で通しているあいだ（控えで通している・日数を過ぎて止めている）は、
    電波が戻ったら確かめ直す。確かめられたら、この見張りは外れる。
  */
  const waiting = Boolean(account?.offline) || Boolean(offlineLimit);
  useEffect(() => {
    if (!waiting) return;
    let alive = true;
    const retry = () => {
      if (alive) void refresh();
    };
    const timer = setInterval(retry, RECHECK_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') retry();
    });
    const web =
      Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.addEventListener === 'function';
    if (web) window.addEventListener('online', retry);
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
      if (web) window.removeEventListener('online', retry);
    };
  }, [waiting, refresh]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const found = await loadAccount();
      if (!alive) return;
      setAccount(found);
      setOfflineLimit(offlineLimitReached());
      setReady(true);

      /*
        決めないまま開き直した場合。

        URL の印は一度きりで、後片付けで消える。控えのほうを見る。
      */
      if (!cameFromUrl && (await recoveryPending())) {
        if (alive) setRecovering(true);
      }
      if (tookOver()) setTakenOver(true);
      else if (found) setTakenOver(false);
      /*
        お気に入りと閲覧履歴を、サーバーと突き合わせる。

        待たない。画面はもう出してよい。突き合わせは端末の中身を
        主にして足し合わせるだけなので、途中で見えていても中身は減らない。
      */
      if (found) void syncAccountData();
      // メールのリンクから戻ってきた場合、鍵が URL に残っている
      scrubUrlFragment();
    })();

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (!alive) return;

      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      // ログアウトしたら、次に入ったときにまた突き合わせる
      if (event === 'SIGNED_OUT') forgetSync();

      /*
        この中から supabase を直に呼ばない。

        onAuthStateChange の中で認証系を呼ぶと、supabase-js の内部の
        鍵が解けずに固まることがある（公式にも注意書きがある）。
        いったん外へ出してから読みに行く。
      */
      setTimeout(() => {
        if (!alive) return;
        void loadAccount().then((found) => {
          if (!alive) return;
          setAccount(found);
          setOfflineLimit(offlineLimitReached());
          if (tookOver()) setTakenOver(true);
          else if (found) {
            setTakenOver(false);
            void syncAccountData();
          }
        });
        scrubUrlFragment();
      }, 0);
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const doneRecovering = useCallback(() => {
    setRecovering(false);
    // 控えも捨てる。次に開き直しても、もう途中には戻らない。
    void endRecovery();
  }, []);

  return (
    <AccountContext.Provider
      value={{ account, ready, recovering, takenOver, offlineLimit, doneRecovering, refresh }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  return useContext(AccountContext);
}
