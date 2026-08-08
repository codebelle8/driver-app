import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from './database.types';

/**
 * サーバーコンポーネント / サーバーアクション用のクライアント。
 * ログイン中の利用者として動作するため、RLS がそのまま効く。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // サーバーコンポーネントからは Cookie を書けない。
            // セッションの更新は middleware が担当するため、ここは無視してよい。
          }
        },
      },
    },
  );
}

/**
 * service_role キーを使うクライアント。**RLS を完全に迂回する。**
 *
 * 使ってよいのは、RLS では表現できない集計や、Storage の後始末など
 * 限定的な場面のみ。**ブラウザへ渡るコードから絶対に呼ばないこと。**
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY が設定されていません');

  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
