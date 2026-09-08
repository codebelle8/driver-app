/**
 * Supabase への接続。
 *
 * anon キーだけを使う。読めるのは公開済みのデータと、
 * ログインしている場合は自分自身の会員情報だけで、
 * 書き込みは RLS が拒否する。鍵が端末に入っていても危険はない。
 *
 * **セッションを保つ**
 *   初期版は会員登録を伴わず、保存も自動更新も止めていた。
 *   運用版でメールアドレスによる会員登録を入れたため、ここを開けている。
 *   保たないと、画面を移るたびにログインし直すことになる。
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY が設定されていません。' +
      'app/.env.local をご確認ください。',
  );
}

/**
 * 1回の問い合わせに待つ上限。
 *
 * 制限を付けないと、電波が弱く「繋がってはいるが応答が返らない」場所で
 * 永久に待ち続ける。このアプリが使われるのは地下駐車場や高架下で、
 * まさにその状態になりやすい。
 *
 * 待つのをやめても、端末に取り込み済みの内容で動く。
 */
const REQUEST_TIMEOUT_MS = 15_000;

export const supabase = createClient(url, anonKey, {
  auth: {
    /*
      ログインの状態を端末へ残す。

      ブラウザでは localStorage、端末では端末の保存領域にあたる。
      AsyncStorage は両方で同じ形で使えるため、分けずに済ませている。
    */
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,

    /*
      メールのリンクから戻ってきたときに、URL に載っている鍵を拾う。

      確認メールとパスワード再設定のリンクは、この画面へ戻してくる。
      端末側（アプリ）にはその経路が無いため、ブラウザでだけ有効にする。
    */
    detectSessionInUrl: Platform.OS === 'web',

    /*
      **implicit を選んでいる。**

      既定の pkce は、鍵と引き換える控えを「頼んだ側のブラウザ」に置く。
      再設定を携帯のブラウザから頼み、届いたメールをメールアプリの中の
      別のブラウザで開くと、その控えが無く引き換えに失敗する。
      走行前のドライバーには、その理由を説明しても手の打ちようがない。

      implicit は鍵を URL の断片（#）に載せるため、どのブラウザで開いても
      通る。断片はサーバーへ送られず、拾ったあとは履歴から消している
      （app/src/lib/account.ts）。この配布物は静的なページだけで、
      受け取る側のサーバーを持たないため、pkce の利点が効かない。
    */
    flowType: 'implicit',
  },
  global: {
    fetch: (input, init) => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
      return fetch(input, { ...init, signal: abort.signal }).finally(() =>
        clearTimeout(timer),
      );
    },
  },
});

/** Storage 上のパスから、写真の公開URLを作る */
export function photoUrl(storagePath: string): string {
  return `${url}/storage/v1/object/public/facility-photos/${storagePath}`;
}
