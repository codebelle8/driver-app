import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * リクエストごとにセッションを更新し、未ログインなら /login へ送る。
 *
 * Supabase のアクセストークンは短命で、リフレッシュした結果を Cookie へ
 * 書き戻す必要がある。サーバーコンポーネントからは Cookie を書けないため、
 * ここが唯一の書き込み口になる。
 *
 * Next.js 16 で `middleware` は `proxy` へ改名された（旧名は非推奨）。
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() を呼ぶことでトークンの更新が走る。呼ばないと期限切れに気づけない。
  const { data: { user } } = await supabase.auth.getUser();

  /*
    確認できた利用者を、後続の画面へ受け渡す。

    画面側 (lib/auth.ts) でも getUser() を呼んでいたため、1回の表示で
    Supabase の認証サーバーへ2往復していた。1往復あたり 70〜100ms かかり、
    表示のたびに無駄が乗る。

    ここで付ける値は利用者のブラウザから来たものではなく、
    この関数がトークンを検証した結果である。改ざんの余地は無い。
  */
  if (user) {
    request.headers.set('x-kn-user-id', user.id);
    request.headers.set('x-kn-user-email', user.email ?? '');
    response = NextResponse.next({ request });
  }

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname.startsWith('/login');

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // 静的ファイルと画像最適化を除く全経路
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
