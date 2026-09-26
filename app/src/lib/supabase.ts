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
import { AppState, Platform } from 'react-native';

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

/*
  端末側では、表に出ているあいだだけ鍵を更新する。

  **なぜ要るか**
    ログインの鍵には期限があり、切れる前に取り替え続ける必要がある。
    ブラウザはこれを自前で回すが、端末側（Expo Go・APK）は
    アプリが裏へ回ると止まる。止まったまま期限が切れると、
    次に開いたときにログインが切れている。

    起動時にログインを求める作りにしたので、これは「久しぶりに
    開いたら入口に戻された」という形で出る。毎回打ち直しになる。

  **裏へ回ったら止める**
    見られていないアプリのために鍵を取り替え続けるのは、電池を使う
    だけになる。表に戻った時点で再開すれば間に合う。

  ブラウザでは何もしない（自前で回っているところへ二重に掛けない）。
*/
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

/**
 * ログインの控えの置き場所の名前。
 *
 * supabase-js の既定と同じ作り方（`sb-<プロジェクト>-auth-token`）。
 * **名前を変えてはいけない。** 変えると、いまログインしている全員の
 * 控えが見つからなくなり、全員がログインし直しになる。
 *
 * 圏外で鍵を取り替えられなかったとき、控えが残っているか（＝ログアウト
 * したのではないか）を確かめるために読む（account.ts）。
 */
export const AUTH_STORAGE_KEY = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

/**
 * サーバーに届くか。
 *
 * 圏外でログアウトすると、電波が戻るまで入り直せなくなる（入るには通信が
 * 要る）。出る前にこれで確かめる。答えを待つのは短く（圏外では待たせない）。
 */
export async function reachServer(timeoutMs = 4000): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey! },
      signal: abort.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Storage 上のパスから、写真の公開URLを作る */
export function photoUrl(storagePath: string): string {
  return `${url}/storage/v1/object/public/facility-photos/${storagePath}`;
}
