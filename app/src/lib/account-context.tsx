import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { loadAccount, scrubUrlFragment, tookOver, type Account } from './account';
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
  doneRecovering: () => void;
  refresh: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue>({
  account: null,
  ready: false,
  recovering: false,
  takenOver: false,
  doneRecovering: () => {},
  refresh: async () => {},
});

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [takenOver, setTakenOver] = useState(false);

  const refresh = useCallback(async () => {
    setAccount(await loadAccount());
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const found = await loadAccount();
      if (!alive) return;
      setAccount(found);
      setReady(true);
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

  const doneRecovering = useCallback(() => setRecovering(false), []);

  return (
    <AccountContext.Provider
      value={{ account, ready, recovering, takenOver, doneRecovering, refresh }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  return useContext(AccountContext);
}
