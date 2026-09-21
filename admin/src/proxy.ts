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

  /*
    既に入っている方が入口を開いたら、中へ送る。

    **ただし職員に限る。**（2026-09-17 に直した）
      職員でない方まで送っていた。アプリの会員は同じ認証を使うため、
      アプリにログインしたままこの住所を開くと、次のことが起きていた。

        /login → （ここで中へ送る）→ / → 職員でないので /login へ戻す
              → （また中へ送る）→ … 果てしなく往復する

      ブラウザは ERR_TOO_MANY_REDIRECTS で諦める。**入口にすら
      たどり着けない。** 職員として入り直すことも、出ることもできない。
      中身は requireStaff() が守っているので漏れてはいないが、
      画面が壊れて見える。

      自分の行は読める（admin_profiles_read_self）。職員でなければ
      行が無く、そのまま入口を出す。停止中の方も同じで、入口に
      「権限がありません」と出る。
  */
  if (user && isLoginPage) {
    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('is_active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile?.is_active) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // 静的ファイルと画像最適化を除く全経路
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
