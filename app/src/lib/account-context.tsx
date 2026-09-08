import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { loadAccount, scrubUrlFragment, type Account } from './account';
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
  doneRecovering: () => void;
  refresh: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue>({
  account: null,
  ready: false,
  recovering: false,
  doneRecovering: () => {},
  refresh: async () => {},
});

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [recovering, setRecovering] = useState(false);

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
      // メールのリンクから戻ってきた場合、鍵が URL に残っている
      scrubUrlFragment();
    })();

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (!alive) return;

      if (event === 'PASSWORD_RECOVERY') setRecovering(true);

      /*
        この中から supabase を直に呼ばない。

        onAuthStateChange の中で認証系を呼ぶと、supabase-js の内部の
        鍵が解けずに固まることがある（公式にも注意書きがある）。
        いったん外へ出してから読みに行く。
      */
      setTimeout(() => {
        if (!alive) return;
        void loadAccount().then((found) => {
          if (alive) setAccount(found);
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
    <AccountContext.Provider value={{ account, ready, recovering, doneRecovering, refresh }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  return useContext(AccountContext);
}
