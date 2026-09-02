/**
 * Supabase への接続。
 *
 * アプリは anon キーだけを使い、公開済みのデータのみを読む。
 * 書き込みは RLS が拒否するため、鍵が端末に入っていても危険はない。
 *
 * セッションを持たない理由:
 *   初期版は会員登録を伴わない。誰でも同じ公開データを見るだけなので
 *   認証の状態を保持する必要がなく、保存も自動更新も止めている。
 *   会員登録を導入する運用版でここを見直す。
 */
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

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
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
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
