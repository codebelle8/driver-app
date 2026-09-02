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
