/**
 * 銀行振込でのお支払い。
 *
 * **銀行の一覧を持たない**
 *   「日本のどの銀行からでも払える」ために要るのは、銀行の一覧ではなく
 *   受け取る口座ひとつ。振り込む側がどの銀行を使うかは、こちらが知る
 *   必要のないことで、聞けば預かる責任だけが増える。
 *
 * **会員の口座は一切扱わない**
 *   ここで読むのは発注元の受取口座だけ。振込は会員がご自分の銀行から
 *   行う。口座番号をこちらへ入れていただく欄は無い。
 *
 * **まだ入っていない状態を、正しく扱う**
 *   受取口座は発注元からお伺いしてから入れる。空のあいだ「準備中」と
 *   出す。空欄のまま振込先らしき枠を出すと、宛先の無い振込を招く。
 */
import { supabase } from './supabase';

export type AccountType = 'futsu' | 'touza';

export interface Transfer {
  bankName: string | null;
  branchName: string | null;
  accountType: AccountType | null;
  accountNumber: string | null;
  accountHolder: string | null;
  accountHolderKana: string | null;
  note: string | null;
}

interface SettingsRow {
  bank_name: string | null;
  branch_name: string | null;
  account_type: AccountType | null;
  account_number: string | null;
  account_holder: string | null;
  account_holder_kana: string | null;
  note: string | null;
}

/** 受取口座を読む。ログインしていなければ null。 */
export async function loadTransfer(): Promise<Transfer | null> {
  const { data, error } = await supabase
    .from('payment_settings')
    .select('bank_name, branch_name, account_type, account_number, account_holder, account_holder_kana, note')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as SettingsRow;
  return {
    bankName: row.bank_name,
    branchName: row.branch_name,
    accountType: row.account_type,
    accountNumber: row.account_number,
    accountHolder: row.account_holder,
    accountHolderKana: row.account_holder_kana,
    note: row.note,
  };
}

/**
 * 振込先として出せる状態か。
 *
 * 銀行名・口座番号・名義がそろって初めて振り込める。1つでも欠けたら
 * 出さない。**半端な振込先は、振込先が無いより悪い。**
 */
export function isReady(t: Transfer | null): t is Transfer {
  if (!t) return false;
  return Boolean(
    t.bankName?.trim() && t.accountNumber?.trim() && (t.accountHolder?.trim() || t.accountHolderKana?.trim()),
  );
}

/**
 * 振込名義の前に付けていただく番号。
 *
 * 銀行の振込名義欄は文字数が限られる。利用者 id（36文字）は入らない。
 * 4桁に収め、あふれたらそのまま出す（1万人を超えたときのため）。
 */
export function memberCode(memberNo: number): string {
  return memberNo < 10000 ? String(memberNo).padStart(4, '0') : String(memberNo);
}

/**
 * 「お振込みを済ませました」とお伝えする。
 *
 * **入金そのものは機械で分からない。** 銀行振込は、こちらの通帳に
 * 名義と金額が届くだけで、アプリからは見えない。だからご本人に
 * 教えていただき、管理画面の知らせへ回す。人が通帳を確かめて
 * 「入金を確認した」を押すまでが一連の流れ。
 *
 * 何度押しても知らせは増えない（データベース側で止めている）。
 * 確認までに間が空くため、待っているあいだ何度か押される前提。
 */
export async function reportPayment(): Promise<boolean> {
  const { error } = await supabase.rpc('report_payment');
  return !error;
}

/**
 * 自分の報告が受け付けられているか。受け付けた時刻を返す。
 *
 * 会員は管理画面の知らせを読めないため、これで確かめる。
 * 押したのに何も変わらないと、押せたのかどうかが分からない。
 */
export async function paymentReported(): Promise<Date | null> {
  const { data, error } = await supabase.rpc('my_payment_reported');
  if (error || typeof data !== 'string') return null;
  return new Date(data);
}
