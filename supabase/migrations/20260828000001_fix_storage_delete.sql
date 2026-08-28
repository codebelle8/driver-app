-- =============================================================================
-- 保存領域の画像が削除できない問題を直す
-- =============================================================================
-- 症状（2026-08-28 本番で実測）:
--   管理者・編集者・調査員のいずれでも、Storage の画像を削除できない。
--   API は HTTP 200 を返すが、削除件数は 0 件。ファイルは残り続ける。
--
--     管理者(admin)   HTTP 200  応答件数 0   消した後も残っている
--     service_role    HTTP 200  応答件数 1   消えた
--
--   service_role では消えるため、行レベルのポリシーか権限のいずれかが
--   authenticated の DELETE を通していない。
--
-- 影響:
--   * 写真を削除しても実体が残る（管理画面から消えるだけ）
--   * 写真を差し替えても古い画像が残る
--   150施設 × 数枚の差し替えでは、無料枠の容量を圧迫する。
--
-- なぜ気づきにくかったか:
--   Storage の削除 API は、権限が無くてもエラーを返さず
--   HTTP 200 と空配列 [] を返す。戻り値を見ない限り成功と区別できない。
--   アプリ側もこれを見ていなかったため、静かに失敗し続けていた。
--   （admin/src/app/actions/photos.ts の removeFiles で確認するようにした）
--
-- 対処:
--   削除に必要な条件を、テーブル権限とポリシーの両方について明示的に揃える。
--   どちらが欠けていたかは本番でしか判別できないため、両方を確実にする。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. テーブル権限
--
-- ポリシーは「権限を持つ役割の中で、どの行を触れるか」を決めるもの。
-- そもそも DELETE 権限が無ければ、ポリシーが通っても削除できない。
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on storage.objects to authenticated;

-- anon には引き続き読み取りのみ（20260808000002 の方針を維持）
revoke insert, update, delete on storage.objects from anon;
grant select on storage.objects to anon;

-- -----------------------------------------------------------------------------
-- 2. 削除ポリシー
--
-- 削除できるのは管理者・編集者のみ。調査員には許さない。
-- 誤って投入した写真は、データベース側の行を消せば一覧から消えるため、
-- 調査員が実体ファイルまで消せる必要はない。
-- -----------------------------------------------------------------------------
drop policy if exists "kurumayose_staff_delete"   on storage.objects;
drop policy if exists "kurumayose_manager_delete" on storage.objects;

create policy "kurumayose_manager_delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('facility-photos', 'catalog') and public.is_manager());

-- -----------------------------------------------------------------------------
-- 3. 読み取りポリシー
--
-- Storage の削除は対象を引いてから消すため、読めない行は消せない。
-- authenticated が含まれていることを確実にする。
-- -----------------------------------------------------------------------------
drop policy if exists "kurumayose_public_read" on storage.objects;

create policy "kurumayose_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('facility-photos', 'catalog'));

-- -----------------------------------------------------------------------------
-- 4. ポリシーが参照する関数を、authenticated が実行できること
-- -----------------------------------------------------------------------------
grant execute on function public.is_manager() to authenticated;
grant execute on function public.is_staff()   to authenticated;

comment on policy "kurumayose_manager_delete" on storage.objects is
  '画像の実体を削除できるのは管理者・編集者のみ。調査員は行のみ扱える。';
