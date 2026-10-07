/**
 * 所有者のアカウント。
 *
 * このアカウントは、他の管理者から削除・停止・降格されない。
 * 後から管理者になった人に締め出されると、復旧には Supabase の
 * 管理画面から SQL を実行するしかなくなるため。
 *
 * **実際に止めているのはデータベース側のトリガー**
 * (`supabase/migrations/20260830000001_protect_owner_account.sql`)。
 * 画面と Server Action の判定は、分かりやすい文言を出すためのもので、
 * それだけでは API を直接呼ばれたときに通ってしまう。
 */
export const OWNER_EMAIL = 'aprofessional0575@gmail.com';

/** そのメールアドレスが所有者のものか */
export function isOwnerEmail(email: string | null | undefined): boolean {
  return email?.toLowerCase() === OWNER_EMAIL;
}

/**
 * 運営者として、アプリを期限なく無料で使えるアカウント。
 *
 *   所有者（2026-10-05）と、上野修さんのアカウント（2026-10-07 ご指示）。
 *
 * **無料だけ。** 削除・停止・降格されない保護は所有者だけ（上の isOwnerEmail）。
 * データベースの free_reason_of（20261007000002_operator_free.sql）と同じ値。
 * 変えるときは揃えて直すこと。
 */
export const FREE_OPERATOR_EMAILS = [OWNER_EMAIL, 'osa603mu@yahoo.co.jp'];

/** そのメールアドレスが、運営者として無料のアカウントか */
export function isFreeOperatorEmail(email: string | null | undefined): boolean {
  return !!email && FREE_OPERATOR_EMAILS.includes(email.toLowerCase());
}
