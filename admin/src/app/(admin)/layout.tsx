import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LocaleSelect, ThemeToggle } from '@/components/header-controls';
import { SignOutIcon } from '@/components/icons';
import { NoticeBell } from '@/components/notice-bell';
import { NavigationOverlay } from '@/components/navigation-overlay';
import { NavLinks } from '@/components/nav-links';
import { ScrollTopButton } from '@/components/scroll-top';
import { SideNavPanel, SideNavProvider, SideNavTrigger } from '@/components/side-nav';
import { requireStaff } from '@/lib/auth';
import { getDictionary, getLocale, getTheme } from '@/lib/i18n/server';
import { ensurePurgeRequest, fetchOpenNotices } from '@/lib/notices';
import { createAdminClient, createClient } from '@/lib/supabase/server';

async function signOut() {
  'use server';
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export default async function AdminLayout({ children }: LayoutProps<'/'>) {
  const [staff, t, locale, theme] = await Promise.all([
    requireStaff(),
    getDictionary(),
    getLocale(),
    getTheme(),
  ]);

  /*
    知らせは管理者だけに出す。

    履歴の整理も会員のお支払いも、編集者・調査員が判断する立場にない。
    出しても押せないものを見せると、押せないことのほうが目に付く。

    お伺いを作るのもここで行う。仕掛け（cron）を持たずに済ませるため、
    管理者が画面を開いたときに時期を確かめる。消しはしない。
  */
  const isAdmin = staff.profile.role === 'admin';
  let notices: Awaited<ReturnType<typeof fetchOpenNotices>> = null;
  if (isAdmin) {
    await ensurePurgeRequest();
    notices = await fetchOpenNotices();
  }

  /*
    審査待ちの情報提供の数（左の柱に出す）。審査するのは管理者と編集者。

    表がまだ無い（データベースを更新する前）ときは 0 として扱う。
    数が出せないことで、画面全体を止めない。
  */
  const isManager = staff.profile.role === 'admin' || staff.profile.role === 'editor';
  let pendingSubmissions = 0;
  let openChatReports = 0;
  if (isManager) {
    const admin = createAdminClient();
    const [sub, chat] = await Promise.all([
      admin.from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      /* チャットの未対応の通報（2026-10-05）。表が無ければ 0 */
      admin.from('chat_reports').select('id', { count: 'exact', head: true }).eq('state', 'open'),
    ]);
    if (!sub.error) pendingSubmissions = sub.count ?? 0;
    if (!chat.error) openChatReports = chat.count ?? 0;
  }

  const roleLabel = {
    admin: t.nav.roleAdmin,
    editor: t.nav.roleEditor,
    surveyor: t.nav.roleSurveyor,
  }[staff.profile.role];

  return (
    /*
      画面の高さに合わせて固定し、本文だけを送る。

      従来はページ全体が伸び、ヘッダーは sticky、フッターは一番下だった。
      そのため一覧が長いとフッターが見えず、下まで送ると
      ヘッダーだけが残る形になっていた。

      h-screen + overflow-hidden で外枠を固定し、本文に
      overflow-y-auto を与えると、ヘッダーとフッターが常に見える。
    */
    <SideNavProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        {/*
          ヘッダーに残すのは、明るさ・言語・ログアウトの3つだけ。

          どの画面からでも同じように使い、行き先ではないもの。
          行き先（ダッシュボード・施設・カテゴリ…）は左の柱へ移した。
          ヘッダーに全部並べていたころは、項目を足すたびに横が詰まり、
          狭い画面では横へ流れていた。
        */}
        <header className="z-20 shrink-0 border-b border-border bg-bg/85 backdrop-blur-md">
          {/*
            **320px でも収まるように詰めてある。**

            知らせのベルを足したところ、320px で36px はみ出した
            （2026-09-14 実測）。操作が4つ並ぶと、この幅では
            既定の余白では入らない。

            削ったのは余白とロゴの大きさだけ。押せる部分（36px）は
            そのまま残している。狭い画面ほど指は正確に狙えない。
          */}
          <div className="flex flex-nowrap items-center gap-1.5 px-2 py-3 sm:gap-3 sm:px-6">
            {/* 狭い画面だけに出る三本線。柱を重ねて開く。 */}
            <SideNavTrigger label={t.nav.menu} />

            {/*
              三本線とロゴのあいだの区切り。

              並べただけでは、ロゴの一部に見えて押せると分からない。
              三本線が出ない広い画面では、線も出さない。
            */}
            <span aria-hidden className="h-7 w-px shrink-0 bg-border md:hidden" />

            {/*
              ロゴ。

              濃紺版と白抜き版の両方を描画し、CSS で表示を切り替える。
              src をサーバー側で選ぶと、テーマ切替が Cookie 経由になるため
              再描画するまで画像が変わらない。
            */}
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <Image
                src="/brand/logo-h80.png"
                alt={t.brand.name}
                width={127}
                height={44}
                className="only-light h-7 w-auto shrink-0 min-[360px]:h-[34px] sm:h-[44px]"
                priority
              />
              <Image
                src="/brand/logo-white-h80.png"
                alt=""
                aria-hidden
                width={127}
                height={44}
                className="only-dark h-7 w-auto shrink-0 min-[360px]:h-[34px] sm:h-[44px]"
                priority
              />
              {/* 副題は場所を取るため lg 以上のみ */}
              <span className="hidden text-xs text-text-muted lg:inline">{t.brand.sub}</span>
            </Link>

            {/* ml-auto で操作ボタンを右端へ寄せる */}
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              {isAdmin && notices !== null && (
                <NoticeBell items={notices} locale={locale} labels={t.notices} />
              )}

              <ThemeToggle
                initial={theme}
                labels={{
                  toggle: t.common.theme,
                  light: t.common.themeLight,
                  dark: t.common.themeDark,
                }}
              />

              <LocaleSelect initial={locale} label={t.common.language} />

              <form action={signOut}>
                <button
                  type="submit"
                  title={t.nav.signOut}
                  aria-label={t.nav.signOut}
                  className="flex size-9 items-center justify-center rounded-lg border border-transparent text-text-muted transition-colors hover:border-border hover:text-accent"
                >
                  <SignOutIcon />
                </button>
              </form>
            </div>
          </div>
        </header>

        {/* 左の柱と本文を横に並べる。柱は 768px 未満では重ねて出す。 */}
        <div className="flex min-h-0 flex-1">
          <SideNavPanel
            closeLabel={t.nav.closeMenu}
            user={
              <>
                <span className="truncate">{staff.profile.display_name}</span>
                <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px]">
                  {roleLabel}
                </span>
              </>
            }
          >
            <NavLinks
              labels={{
                dashboard: t.nav.dashboard,
                facilities: t.nav.facilities,
                categories: t.nav.categories,
                submissions: t.nav.submissions,
                chat: t.nav.chat,
                members: t.nav.members,
                push: t.nav.push,
                accounts: t.nav.accounts,
                history: t.nav.history,
                site: t.nav.site,
              }}
              isAdmin={staff.profile.role === 'admin'}
              isManager={isManager}
              pendingSubmissions={pendingSubmissions}
              openChatReports={openChatReports}
            />
          </SideNavPanel>

          {/*
            本文とフッター。柱は端まで伸ばし、送るのはこちらだけにする。

            min-w-0 が要る。

            並びの中の箱は、既定では**中身より狭くならない**。本文に
            会員の表のような広いものが入ると、この列がその幅まで広がり、
            外枠（overflow-hidden）に切り取られる。指で送っても続きは
            出ない。狭い画面で右が切れていたのはこれ。

            0 まで縮めてよいと伝えると、列は画面の幅に収まり、広いものは
            自分の中（表の overflow-x-auto）で送られるようになる。
          */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/*
              本文だけが送られる領域。
              min-h-0 が要る。これが無いと flex の子は内容の高さまで伸び、
              overflow-y-auto が効かない（外側にスクロールが出てしまう）。

              relative を付けておく。本文の中に position:absolute の要素
              （sr-only など）が置かれたとき、基準になる先祖が無いと
              body を基準に配置され、main の overflow では抑えられない。
            */}
            <main className="relative min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>
            </main>

            {/*
              高さは柱の下（誰で入っているか）と揃える。

              min- にしているのは、狭い画面で文言が2行になったときに
              切らないため。柱が並ぶのは 768px 以上で、そこでは1行に
              収まるので、実際には同じ高さになる。
            */}
            <footer className="flex min-h-14 shrink-0 items-center border-t border-border px-6">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
                <span className="text-sm tracking-widest text-text-muted">
                  {t.brand.footerName}
                </span>
                <span className="tabular text-sm text-accent-ink">2026</span>
              </div>
            </footer>
          </div>
        </div>

        {/*
          遷移中は、いま表示している画面を残したまま上に重ねて出す。
          loading.tsx を置くと元の画面が差し替わってしまうため使っていない。
        */}
        <NavigationOverlay label={t.common.loading} />

        {/* 一覧が長い画面で使う。全画面に置いて場所を固定する。 */}
        <ScrollTopButton label={t.nav.scrollTop} />
      </div>
    </SideNavProvider>
  );
}
