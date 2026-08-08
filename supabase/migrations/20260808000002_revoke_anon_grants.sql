-- =============================================================================
-- anon から不要なテーブル権限を剥奪する（多層防御）
-- =============================================================================
-- 背景:
--   Supabase は public スキーマの新規テーブルに対し、anon / authenticated へ
--   既定で全権限を付与する。20260807000002 で必要な権限を明示的に GRANT したが、
--   GRANT は加算のみで、既定で付いていた余分な権限は残ったままだった。
--
--   本番環境で実測したところ:
--     * anon が admin_profiles / audit_logs を SELECT できる（RLS により0件）
--     * anon が INSERT / UPDATE / DELETE を発行できる（RLS により全て拒否・0件）
--
--   データが漏れたり改ざんされたりはしない（RLS が機能していることを実測確認済み）。
--   ただし防御が RLS の1層のみに依存する状態であり、
--   将来ポリシーを1つ書き間違えただけで即座に露出することになる。
--
--   そのため、そもそも権限を持たせない層を追加する。
--   RLS ポリシーに不備があっても、権限が無ければテーブルに触れられない。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 管理系テーブル: anon には一切触らせない
-- -----------------------------------------------------------------------------
revoke all on public.admin_profiles from anon;
revoke all on public.audit_logs     from anon;
revoke all on sequence public.audit_logs_id_seq from anon;

-- -----------------------------------------------------------------------------
-- 施設データ系: anon は読み取りのみ。書き込み権限は剥奪する。
-- -----------------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger on
  public.categories,
  public.facilities,
  public.entry_points,
  public.cautions,
  public.photos,
  public.catalog_snapshots
from anon;

-- 読み取りは維持する（アプリが施設情報を取得するため）
grant select on
  public.categories,
  public.facilities,
  public.entry_points,
  public.cautions,
  public.photos,
  public.catalog_snapshots
to anon;

-- -----------------------------------------------------------------------------
-- Storage: anon は読み取りのみ
-- -----------------------------------------------------------------------------
revoke insert, update, delete on storage.objects from anon;
grant  select on storage.objects to anon;

-- -----------------------------------------------------------------------------
-- 今後作られるテーブルにも既定で anon の全権限が付かないようにする。
-- 新しいテーブルを追加した際、明示的に grant select しない限り
-- anon からは見えない状態が既定になる。
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
