-- =============================================================================
-- 試験提供の期間（β版）は、無料期間が過ぎても使える
-- =============================================================================
--
-- ご指示（2026-10-07）「試験提供の期間なので、無料期間が終わっても使えるように」。
-- 利用規約 第4条第6項（試験提供の期間中は、無料期間が経過した後も引き続き
-- 利用できる）に、アプリの動きを合わせる。
--
-- **これまで** アプリは、登録から1か月（無料期間）が過ぎると、設定などの
--   画面にしか入れないよう絞っていた（app/src/components/plan-gate.tsx）。
--
-- **これから** サイト設定に「試験提供の期間中」（trial_open）を置く。
--   入っているあいだは、すべての会員を「試験提供のため無料」として扱う。
--   有料の提供を始めるとき（第4条第4項の30日前のお知らせのあと）に、
--   管理画面のサイト設定で外す。外すまでは、だれも絞られない。
--
-- **無料の仕組みに乗せる理由** 調査員・所有者・上位の方の無料（my_free_access）
--   と同じ道を通す。アプリはこの結果を端末にも控えているので、圏外でも
--   同じに効く。別の仕組みを足すと、圏外の控えに入れ忘れて、電波の無い
--   場所でだけ絞られる、が起きる。
--
-- **順番** 調査員・所有者（期限なし）→ 前の月の上位（○月○日まで）→ 試験提供。
--   上位の方には「○日まで無料（上位）」と出したいので、試験提供より先に見る。
--
-- **画面の出し方はアプリが決める。** 試験提供は止めた方を除く全員に返すが、
--   アプリは「無料期間（またはお支払いの期間）が過ぎた方」にだけ「試験提供の
--   期間中のため無料」と出す。期間内の方は、これまでどおり残り日数と料金の
--   ご案内を出す（ご指示は「終わっても使える」で、期間内の見え方は変えない）。
--   全員に返すのは、開いたまま期限を迎えた方を、読み直すまで絞らないため。
--
-- **入らない方** ご利用を止めている方（blocked）。止めた方は止めたまま。
--
-- **free_reason_of は変えない。** あちらは「期限なく無料の方」を引くもので、
--   順位から外す判断にも使っている。試験提供を入れると、全員が順位から
--   外れてしまう。
-- =============================================================================

alter table public.site_settings
  add column if not exists trial_open boolean not null default true;

comment on column public.site_settings.trial_open is
  '試験提供の期間中か。true のあいだは、すべての会員が無料で使える（止めた方を除く）。有料の提供を始めるときに false にする';

/* 直せるのは管理者だけ（site_settings_write_admin の方針がそのまま効く） */
grant update (trial_open) on public.site_settings to authenticated;

create or replace function public.my_free_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    /* 調査員・所有者（期限なし） */
    (select jsonb_build_object('reason', x.r, 'until', null)
       from (select public.free_reason_of(auth.uid()) as r) x
      where x.r is not null),
    /* 前の月の情報提供の上位 */
    (select jsonb_build_object('reason', 'top', 'until', g.free_until)
       from public.free_grants g
      where g.user_id = auth.uid()
        and now() >= g.free_from
        and now() < g.free_until
      order by g.free_until desc
      limit 1),
    /* 試験提供の期間中（止めた方を除く） */
    (select jsonb_build_object('reason', 'trial', 'until', null)
       from public.site_settings s
      where s.id = 1
        and s.trial_open
        and auth.uid() is not null
        and not exists (
          select 1 from public.driver_profiles p
          where p.user_id = auth.uid() and p.status = 'blocked'
        ))
  );
$$;

revoke execute on function public.my_free_access() from public, anon;
grant execute on function public.my_free_access() to authenticated;
