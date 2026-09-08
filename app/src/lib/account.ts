/**
 * 会員のアカウント。
 *
 * **なぜ要るか**
 *   お気に入りも閲覧履歴も端末の中だけに持っており、機種変更で失われる。
 *   「いつもの行き先」を留める機能なので、失われる前提のままでは
 *   運用版として成り立たない。課金の相手を記録する先も要る。
 *
 * **ログインしなくても使える**
 *   会員登録は、いまのところ何も閉じない。登録せずに開いた方は
 *   今までどおり193件を読める。ある日から突然ログインを求める形にしない。
 *
 * **無料期間はサーバーが決める**
 *   登録した時刻から1か月。端末から渡させると、いくらでも先へ延ばせる。
 *   行を作れるのは ensure_driver_profile() だけで、会員には
 *   insert 権限を渡していない（supabase/migrations/20260908000001）。
 *
 * **失敗の理由は種類で返す**
 *   Supabase が返す文面は英語で、しかも版によって変わる。ここでは
 *   種類だけを返し、言い回しは辞書（i18n）に持たせる。
 */
import { Platform } from 'react-native';

import type { PlanId } from './plans';
import { supabase } from './supabase';

/** 顔写真の置き場所 */
const AVATARS = 'avatars';

export type MemberStatus = 'trial' | 'active' | 'expired' | 'blocked';

export interface Account {
  userId: string;
  email: string | null;
  displayName: string | null;
  status: MemberStatus;
  /** 無料期間の終わり（ISO） */
  trialEndsAt: string;
  /** 顔写真の置き場所。まだ無ければ null。 */
  avatarPath: string | null;
  /** 顔写真の URL。avatarPath から作る。 */
  avatarUrl: string | null;
  /** ご希望の料金。まだ選んでいなければ null。支払い済みの意味ではない。 */
  plan: PlanId | null;
  planChosenAt: string | null;
  /**
   * 会員番号。振込名義の前に付けていただく。
   *
   * 振込は名義しか届かない。同姓同名や法人名での振込があると
   * 突き合わせられないため、短い番号を添えていただく。
   */
  memberNo: number;
}

/**
 * うまくいかなかった理由。
 *
 * 文面ではなく種類を返す。Supabase の文面は英語で、版によって変わる。
 * 文言に頼って判定すると、ある日いきなり「原因不明」に化ける。
 */
export type Problem =
  | 'invalidLogin'
  | 'alreadyRegistered'
  | 'weakPassword'
  | 'invalidEmail'
  | 'notConfirmed'
  | 'samePassword'
  /* いまのパスワードが違う（変更のとき） */
  | 'wrongCurrent'
  /* 新しいパスワードと確認が食い違う */
  | 'mismatch'
  /* こちらでご利用を停止している */
  | 'blocked'
  /* Supabase 側で新規登録を閉じている。運用の設定であって、利用者の落ち度ではない。 */
  | 'signupClosed'
  | 'rateLimited'
  | 'network'
  | 'unknown';

export type Result<T = void> = { ok: true; value: T } | { ok: false; problem: Problem };

const good = <T,>(value: T): Result<T> => ({ ok: true, value });
const bad = (problem: Problem): Result<never> => ({ ok: false, problem });

/** パスワードの下限。Supabase 側の既定と揃えている。 */
export const PASSWORD_MIN = 8;

interface RawError {
  code?: string;
  status?: number;
  message?: string;
}

/**
 * Supabase の失敗を、こちらの種類へ移す。
 *
 * code を先に見る。文面は版で変わるため、code の無い応答のときだけ
 * 文面を当てにする。
 */
function toProblem(error: RawError | null): Problem {
  if (!error) return 'unknown';

  switch (error.code) {
    case 'invalid_credentials':
      return 'invalidLogin';
    case 'user_already_exists':
    case 'email_exists':
      return 'alreadyRegistered';
    case 'weak_password':
      return 'weakPassword';
    case 'validation_failed':
      return 'invalidEmail';
    case 'email_not_confirmed':
      return 'notConfirmed';
    case 'same_password':
      return 'samePassword';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'signupClosed';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'rateLimited';
    default:
      break;
  }

  const m = (error.message ?? '').toLowerCase();
  if (m.includes('invalid login')) return 'invalidLogin';
  if (m.includes('already registered')) return 'alreadyRegistered';
  if (m.includes('password should be')) return 'weakPassword';
  if (m.includes('not confirmed')) return 'notConfirmed';
  if (m.includes('rate limit')) return 'rateLimited';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'signupClosed';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('abort')) {
    return 'network';
  }
  return 'unknown';
}

/**
 * メールのリンクが戻ってくる先。
 *
 * 配布物は静的なページだけなので、いま開いている場所をそのまま使う。
 * 端末側（アプリ）にはこの経路が無いため渡さない。
 *
 * **Supabase 側で許可しておく必要がある。**
 *   ダッシュボードの Authentication → URL Configuration に、
 *   本番の場所（https://…/**）と手元の場所を登録していないと、
 *   リンクを開いても既定の場所へ飛ばされる。
 */
function redirectTo(): string | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  return `${window.location.origin}/account`;
}

/**
 * URL の断片に残った鍵を消す。
 *
 * implicit では鍵が # の後ろに載ってくる。supabase-js が読み終えた後は
 * 用済みで、履歴や共有された URL に残ると、そのまま人のログインになる。
 */
export function scrubUrlFragment(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const h = window.location.hash;
  if (!h.includes('access_token') && !h.includes('error')) return;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

// --- 出入り -------------------------------------------------------------------

/**
 * 新しく登録する。
 *
 * 戻り値の needsConfirm は「確認メールを開くまでログインできない」の意。
 * 確認を求めるかどうかは Supabase 側の設定で変わり、こちらから読みに行く
 * 手立てが無い。返ってきたセッションの有無で見分ける。
 */
export async function signUp(
  email: string,
  password: string,
): Promise<Result<{ needsConfirm: boolean }>> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: redirectTo() },
  });
  if (error) return bad(toProblem(error));

  /*
    既に登録済みのアドレスでも、Supabase は成功として返すことがある
    （どのアドレスが登録済みかを外から数えられないようにするため）。
    その場合 identities が空になる。見分ける手がかりはここだけ。
  */
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    return bad('alreadyRegistered');
  }

  if (data.session) await ensureProfile();
  return good({ needsConfirm: !data.session });
}

export async function signIn(email: string, password: string): Promise<Result> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return bad(toProblem(error));

  /*
    ご利用の停止は、入口（components/auth-gate.tsx）で止める。

    ここでログアウトさせて欄の下に理由を出す作りも試したが、
    出す前に入口が「停止中」の画面へ切り替わり、理由が消えていた。
    **止める場所は1か所にする。** 入口なら、入ったままの端末が
    次に開いたときも同じように止まる。

    名簿の行だけは作っておく（初回ログインのため）。
  */
  await ensureProfile();
  return good(undefined);
}

/**
 * ログアウトする。
 *
 * お気に入りと閲覧履歴は消さない。端末の持ち物で、登録していない方も
 * 同じものを使っている。ログアウトのたびに消えると、登録した人だけが
 * 損をする形になる。
 */
export async function signOut(): Promise<Result> {
  const { error } = await supabase.auth.signOut();
  if (error) return bad(toProblem(error));
  return good(undefined);
}

/**
 * この端末以外も含めて、すべてログアウトする。
 *
 * 社用の端末を使い回す現場では、前の方のログインが残る。
 * 心当たりのあるときに、まとめて切れるようにしておく。
 */
export async function signOutEverywhere(): Promise<Result> {
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) return bad(toProblem(error));
  return good(undefined);
}

/**
 * 退会する。
 *
 * お預かりしているもの（メールアドレス・顔写真・お気に入り・履歴）を
 * まとめて消す。取り消せない。
 */
export async function deleteMyAccount(): Promise<Result> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return bad(toProblem(error));
  // 消えた利用者のセッションは、もう使えない。手元も片付ける。
  await supabase.auth.signOut().catch(() => undefined);
  return good(undefined);
}

/** パスワード再設定のメールを送る */
export async function sendReset(email: string): Promise<Result> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: redirectTo(),
  });
  if (error) return bad(toProblem(error));
  return good(undefined);
}

/**
 * ログインしたまま、パスワードを変える。
 *
 * Supabase の updateUser は「いまのパスワード」を聞かない。席を離れた
 * 隙に変えられてしまうため、こちらで一度確かめてから変える。
 */
export async function changePassword(
  email: string,
  current: string,
  next: string,
): Promise<Result> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: current });
  if (error) {
    const problem = toProblem(error);
    return bad(problem === 'invalidLogin' ? 'wrongCurrent' : problem);
  }
  return updatePassword(next);
}

/** 新しいパスワードを決める（再設定のリンクから戻ってきた後） */
export async function updatePassword(next: string): Promise<Result> {
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return bad(toProblem(error));
  return good(undefined);
}

/** 表示名を変える */
export async function updateDisplayName(userId: string, name: string): Promise<Result> {
  const { error } = await supabase
    .from('driver_profiles')
    .update({ display_name: name.trim() || null })
    .eq('user_id', userId);
  if (error) return bad(toProblem(error));
  return good(undefined);
}

// --- いまの状態 ---------------------------------------------------------------

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  status: MemberStatus;
  trial_ends_at: string;
  avatar_path: string | null;
  plan: PlanId | null;
  plan_chosen_at: string | null;
  member_no: number;
}

/**
 * 名簿に行が無ければ作り、いまの内容を返す。
 *
 * 何度呼んでも無料期間は延びない（データベース側で on conflict do nothing）。
 */
async function ensureProfile(): Promise<ProfileRow | null> {
  const { data, error } = await supabase.rpc('ensure_driver_profile');
  if (error || !data) return null;
  return data as ProfileRow;
}

/**
 * いまログインしている会員を返す。していなければ null。
 *
 * 名簿の行が無ければここで作る。確認メールを開いて初めてログインできる
 * 設定の場合、登録した時点では行を作れないため。
 */
export async function loadAccount(): Promise<Account | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;

  const row = await ensureProfile();
  if (!row) return null;

  return {
    userId: row.user_id,
    email: session.user.email ?? null,
    displayName: row.display_name,
    status: row.status,
    trialEndsAt: row.trial_ends_at,
    avatarPath: row.avatar_path,
    avatarUrl: row.avatar_path ? avatarUrlOf(row.avatar_path) : null,
    plan: row.plan,
    planChosenAt: row.plan_chosen_at,
    memberNo: row.member_no,
  };
}

// --- 顔写真 -------------------------------------------------------------------

/** 置き場所から、表示に使う URL を作る */
export function avatarUrlOf(path: string): string {
  return supabase.storage.from(AVATARS).getPublicUrl(path).data.publicUrl;
}

/**
 * 当てられない名前を作る。
 *
 * 顔写真は公開の置き場所にある（署名付きの URL は期限が切れ、電波の
 * 届かない場所で持ち歩けないため）。道筋の先頭は利用者の id で、
 * 書き込みはそこだけに絞ってある。読まれないようにするのは名前の側。
 */
function randomName(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // 端末側では顔写真の変更を出していない。ここへは来ない想定の控え。
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * 顔写真を差し替える。
 *
 * 先に置いてから名簿を書き換え、済んでから前のものを消す。
 * 順を逆にすると、途中で失敗したときに「名簿は新しい道筋を指しているが
 * 実体が無い」状態になり、顔写真が壊れて出る。
 */
export async function uploadAvatar(
  userId: string,
  blob: Blob,
  oldPath: string | null,
): Promise<Result<string>> {
  const path = `${userId}/${randomName()}.jpg`;

  const { error: putError } = await supabase.storage
    .from(AVATARS)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (putError) return bad(toProblem(putError as RawError));

  const { error: saveError } = await supabase
    .from('driver_profiles')
    .update({ avatar_path: path })
    .eq('user_id', userId);
  if (saveError) {
    // 名簿に付けられないなら、置いたものは片付ける
    await supabase.storage.from(AVATARS).remove([path]);
    return bad(toProblem(saveError));
  }

  if (oldPath && oldPath !== path) {
    await supabase.storage.from(AVATARS).remove([oldPath]);
  }
  return good(path);
}

/** 顔写真を外す */
export async function clearAvatar(userId: string, path: string | null): Promise<Result> {
  const { error } = await supabase
    .from('driver_profiles')
    .update({ avatar_path: null })
    .eq('user_id', userId);
  if (error) return bad(toProblem(error));
  if (path) await supabase.storage.from(AVATARS).remove([path]);
  return good(undefined);
}

// --- 料金 ---------------------------------------------------------------------

/**
 * ご希望の料金を控える。
 *
 * **支払い済みにはしない。** status は触らない。決済の仕組みが
 * 決まるまで、ここに残るのは「どちらをご希望か」だけ。
 */
export async function choosePlan(userId: string, plan: PlanId): Promise<Result> {
  const { error } = await supabase
    .from('driver_profiles')
    .update({ plan, plan_chosen_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) return bad(toProblem(error));
  return good(undefined);
}

/**
 * 無料期間の残り日数。
 *
 * 切り上げる。あと数時間でも「あと1日」と出したい。「あと0日」では
 * 今日中に切れるのか既に切れているのか読み取れない。
 */
export function daysLeft(trialEndsAt: string, now: Date = new Date()): number {
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return 0;
  const ms = end - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

/** 無料期間が切れているか */
export function isExpired(account: Account, now: Date = new Date()): boolean {
  if (account.status === 'active') return false;
  return new Date(account.trialEndsAt).getTime() <= now.getTime();
}
