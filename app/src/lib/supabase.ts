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

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/** Storage 上のパスから、写真の公開URLを作る */
export function photoUrl(storagePath: string): string {
  return `${url}/storage/v1/object/public/facility-photos/${storagePath}`;
}
