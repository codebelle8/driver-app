-- =============================================================================
-- 試験提供を終えるとき、無料期間を過ぎている方に、あらためて1か月の無料期間
-- =============================================================================
--
-- ご回答（2026-10-08）「β版が終わる時点で、登録から1か月の無料期間を過ぎている
-- 方には、あらためて1か月の無料期間を差し上げる」。利用規約 第4条第7項。
--
-- **これまで** サイト設定の「試験提供の期間中」（trial_open）を外すと、無料期間を
--   過ぎている方は、その時点から設定の画面などにしか入れなくなっていた。
--
-- **これから** trial_open が「入」から「外」に変わったときに、データベースが
--   その場で、無料期間を過ぎている方の無料期間を「外した時点から1か月」にする。
--   管理画面から外しても、SQL で外しても同じに効く（仕掛けを表に付けるため）。
--
-- **対象**
--   * 状態が trial（無料期間）または expired で、無料期間がもう過ぎている方
--   * 止めている方（blocked）は対象外。止めたまま
--   * お支払い済みの方（active）は対象外。期限はお支払いの期間で見ている
--   * 期限なく無料の方（調査員・運営者）は対象外。延ばす必要が無い
--   * 無料期間の途中の方は、残りの日数のまま（規約どおり）
--
-- **記録** 何名に付けたかを操作履歴に残す。外した職員が分かるよう、管理画面は
--   職員の鍵で外す（admin/src/app/actions/site.ts）。
--
-- 入れ直して、また外したときは、もう一度は付かない（その時点で無料期間の途中の
-- ため）。
-- =============================================================================

create or replace function public.grant_month_on_trial_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n      integer;
  until  timestamptz := now() + interval '1 month';
begin
  if coalesce(old.trial_open, false) and not coalesce(new.trial_open, false) then
    update public.driver_profiles p
       set trial_ends_at = until,
           status = 'trial'
     where p.status in ('trial', 'expired')
       and p.trial_ends_at <= now()
       and public.free_reason_of(p.user_id) is null;
    get diagnostics n = row_count;

    insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
    values (
      auth.uid(), 'update', 'site_settings', null,
      jsonb_build_object(
        'trial_open', jsonb_build_object('from', true, 'to', false),
        'trial_end_grant', jsonb_build_object('members', n, 'until', until)
      )
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.grant_month_on_trial_end() from public, anon, authenticated;

drop trigger if exists site_settings_trial_end on public.site_settings;
create trigger site_settings_trial_end
  after update of trial_open on public.site_settings
  for each row execute function public.grant_month_on_trial_end();
