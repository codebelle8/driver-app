-- =============================================================================
-- チャット：書き込んだ日から1年を過ぎた書き込みを、データベースから消す
-- =============================================================================
--
-- ご回答（2026-10-08）「運営側でも、期限を決めて消す（例：1年）」。利用規約
-- 第15条第9項・プライバシーポリシー「書き込んだ日から1年を経過するまで保存し、
-- その後削除します」。
--
--   書き込んでから 90日 … 会員の画面から外れる（20261008000001）
--   書き込んでから 1年  … データベースから消す（ここ。管理画面からも消える）
--
-- **仕掛け（cron）を置かない。** 毎月の締め（settle_free_month）と同じく、
--   アプリか管理画面が開かれたときに呼ぶ（app/src/lib/account.ts・
--   admin/src/app/(admin)/layout.tsx）。消すものが無ければ何もしないので、
--   何度呼んでも構わない。同時に呼ばれても、鍵をかけて1回ずつ行う。
--
-- **消すもの** 1年を過ぎた書き込み（非表示にしたものも）。その書き込みへの通報は
--   一緒に消える（外部キーの連鎖）。操作履歴には「何件消したか」を1行残す
--   （本文は残さない）。
--
-- **呼べる人** ログインしている方（会員・職員）と service_role。ログイン前は呼べない。
--   中で消すのは1年を過ぎたものだけなので、だれが呼んでも結果は同じ。
-- =============================================================================

create index if not exists chat_messages_created_idx on public.chat_messages (created_at);

create or replace function public.purge_old_chat()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - interval '1 year';
  n      integer := 0;
begin
  /* 消すものが無ければ、鍵もかけずに戻る（開くたびに呼ぶため、軽くしておく） */
  if not exists (select 1 from public.chat_messages where created_at < cutoff) then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtext('kurumayose.purge_old_chat'));

  delete from public.chat_messages where created_at < cutoff;
  get diagnostics n = row_count;

  if n > 0 then
    insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
    values (
      null, 'delete', 'chat_messages', null,
      jsonb_build_object('retention', jsonb_build_object('older_than', cutoff, 'count', n))
    );
  end if;
  return n;
end;
$$;

revoke execute on function public.purge_old_chat() from public, anon;
grant execute on function public.purge_old_chat() to authenticated;

notify pgrst, 'reload schema';
