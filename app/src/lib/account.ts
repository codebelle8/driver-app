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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { deviceId } from './device';
import { forgetFavoritesHere } from './favorites';
import { forgetHistoryHere } from './history';
import { removeMySubmissionPhotos } from './submissions';
import type { PlanId } from './plans';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';

import { AUTH_STORAGE_KEY, reachServer, supabase } from './supabase';

/** 顔写真の置き場所 */
const AVATARS = 'avatars';

export type MemberStatus = 'trial' | 'active' | 'expired' | 'blocked';

/**
 * 無料でお使いいただいている理由（2026-10-05）。
 *
 *   surveyor … 管理画面で「調査員」として登録されている方
 *
 * 毎月の上位の方を翌月無料にする段で、理由が増える。
 */
export type FreeReason = 'surveyor';

export interface Account {
  userId: string;
  email: string | null;
  displayName: string | null;
  status: MemberStatus;
  /** 無料期間の終わり（ISO） */
  trialEndsAt: string;
  /**
   * お支払いいただいた期間の終わり（ISO）。
   *
   * null は「期限なし」。この欄を設ける前から「ご利用中」だった方が
   * 当てはまる。勝手に締めないため、null は切れていない扱いにする。
   */
  paidUntil: string | null;
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
  /**
   * 圏外のため、最後に確かめた控えで通しているか。
   *
   * 電波が戻ると確かめ直す（account-context.tsx）。そのあいだも、
   * 期限（無料期間・お支払いの期間）は控えの日付で判断される。
   */
  offline: boolean;
  /**
   * 無料でお使いいただいている理由。通常の会員は null。
   *
   * データベースの my_free_access() で尋ねる。端末の控えにも入るので、
   * 圏外でも同じように効く。この版より前の控えには無い（undefined）。
   * 無いものは「通常の会員」として扱う。
   */
  freeReason?: FreeReason | null;
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
  /* 圏外でログアウトしようとした。出ると、電波が戻るまで入り直せない */
  | 'offline'
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
/**
 * 再設定のリンクから戻ってきたか。
 *
 * **取り込んだ時点で読む。**
 *   これを出来事（PASSWORD_RECOVERY）だけに頼っていた。ところが
 *   URL の後片付け（scrubUrlFragment）が先に走ると印ごと消え、
 *   出来事は流れてこない。**6回中5回、新しいパスワードを決めずに
 *   そのまま中へ通していた。** 忘れた方が入れたつもりで帰り、
 *   次にまた入れない。
 *
 *   読み取りをここ（取り込みの時点）で済ませれば、あとで誰が
 *   後片付けをしても変わらない。
 */
const cameFromRecovery = ((): boolean => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return /(^|[#&])type=recovery(&|$)/.test(window.location.hash);
})();

/**
 * 再設定の途中であることを、端末に控える。
 *
 * **なぜ URL だけでは足りないか**（ご報告 2026-09-11）
 *   印は一度きりで、後片付けで消える。**開き直すと印が無くなり、
 *   パスワードを決めないまま中へ入れてしまっていた。**
 *   リンクを開いた時点でログイン済みの状態になっているため、
 *   そのまま古いパスワードのままで使えてしまう。
 *
 *   リンクが人手に渡っている場面（転送された、共用のパソコン）を
 *   考えると、これは決めるまで通してはいけない。
 *
 * **消えるのは3つのときだけ**
 *   新しいパスワードを決めたとき、やめたとき、ログアウトしたとき。
 */
const RECOVERY_KEY = 'kn_recovering';

if (cameFromRecovery) {
  // 控えは待たずに書く。読むのは次の描画より後になる。
  void AsyncStorage.setItem(RECOVERY_KEY, '1').catch(() => undefined);
}

/** 再設定のリンクから来たか。画面が最初に決まる前に呼ばれる。 */
export function isRecovery(): boolean {
  return cameFromRecovery;
}

/** 決めないまま開き直したか。控えを読む。 */
export async function recoveryPending(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(RECOVERY_KEY).catch(() => null);
  return raw === '1';
}

/** 決め終えた・やめた・出た。控えを捨てる。 */
export async function endRecovery(): Promise<void> {
  await AsyncStorage.removeItem(RECOVERY_KEY).catch(() => undefined);
}

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
    1つのアカウントは1台まで（ご指示）。

    **後勝ちにする。** 先に入っている端末を優先して2台目を断ると、
    機種変更・紛失・故障のたびに入れなくなり、こちらへ連絡して
    外してもらうまで使えない。走行前の車内で起こると、その日は
    仕事にならない。

    ここでは2つのことをする。
      1. 名簿へ「いまの1台」を控える（前の端末は次に開いた時点で出る）
      2. Supabase 側の鍵も落とす（scope: 'others'）

    2 だけでは、前の端末の手元の鍵が切れるまで最大1時間効かない。
    1 と併せて、すぐ効かせる。
  */
  await claimDevice();

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
 * この端末を「いまの1台」にする。ほかの端末の鍵は落とす。
 *
 * 落とせなくても、名簿の控えが入っていれば目的は果たせる。止めない。
 */
async function claimDevice(): Promise<void> {
  claiming++;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;

    await ensureProfile();
    await supabase.from('driver_profiles').update({ device_id: await deviceId() }).eq('user_id', userId);
    // 自分は残し、ほかの端末だけ落とす
    await supabase.auth.signOut({ scope: 'others' });
  } catch {
    // ここで失敗しても、ログインそのものは済んでいる。
  } finally {
    claiming--;
  }
}

/**
 * ログアウトする。
 *
 * お気に入りと閲覧履歴は消さない。端末の持ち物で、登録していない方も
 * 同じものを使っている。ログアウトのたびに消えると、登録した人だけが
 * 損をする形になる。
 */
export async function signOut(): Promise<Result> {
  /*
    **圏外では出ていかない。**

    出ると、電波が戻るまで入り直せない（入るには通信が要る）。地下で
    うっかり押すと、そこで仕事が止まる。supabase も、通信できないまま
    出ると、手元の控えだけを消して「出た」状態にしてしまう。
  */
  if (!(await reachServer())) return bad('offline');
  offlineLimit = null;
  await dropSnapshot();
  await endRecovery();
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
  // ほかの端末まで切るには、そもそも通信が要る。圏外では何も消さずに断る
  if (!(await reachServer())) return bad('offline');
  offlineLimit = null;
  await dropSnapshot();
  await endRecovery();
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) return bad(toProblem(error));
  return good(undefined);
}

/**
 * 退会する。
 *
 * お預かりしているもの（メールアドレス・顔写真・お気に入り・履歴）を
 * まとめて消す。取り消せない。
 *
 * **顔写真だけは先に、こちらから消す。**
 *   置き場所の表を直に消すことは Supabase が禁じており、データベース側の
 *   関数からは触れない（42501）。Storage API を通す必要がある。
 *   先に消してから、本体を消す。逆にすると、消えた利用者の鍵では
 *   もう消せなくなる。
 */
export async function deleteMyAccount(userId: string): Promise<Result> {
  /*
    その人の場所ごと片付ける。

    いま名簿に載っている1枚だけでなく、差し替えの途中で残ったものも
    まとめて消す。消せなくても退会は止めない（残るのは持ち主の
    分からない画像1枚で、他人から辿れる道は無い）。
  */
  try {
    const { data: files } = await supabase.storage.from(AVATARS).list(userId);
    if (files && files.length > 0) {
      await supabase.storage.from(AVATARS).remove(files.map((f) => `${userId}/${f.name}`));
    }
  } catch {
    // 置き場所を片付けられなくても、アカウントは消す。
  }
  /* 情報提供の写真も。行のほうは、アカウントを消すとデータベースが消す */
  await removeMySubmissionPhotos(userId);

  const { error } = await supabase.rpc('delete_my_account');
  if (error) return bad(toProblem(error));
  await dropSnapshot();

  /*
    端末の控えも捨てる。

    退会の確認に「お気に入り・閲覧履歴を、すべて消します」と書いて
    ある。サーバー側だけ消しても控えは端末に残り、次に登録した方へ
    引き継がれていた。同じ端末を人に譲ると、前の方の行き先が見える。
  */
  await forgetFavoritesHere();
  await forgetHistoryHere();
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
  // 決まった。もう途中ではない。
  await endRecovery();
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
  /** お支払いいただいた期間の終わり。null は期限なし。 */
  paid_until: string | null;
  avatar_path: string | null;
  plan: PlanId | null;
  plan_chosen_at: string | null;
  member_no: number;
  /** いま使っている1台。ここと違う端末は自分から出ていく。 */
  device_id: string | null;
}

/**
 * ほかの端末で入られたために、この端末が出されたか。
 *
 * 画面へ知らせるための合図。読んだら消す（同じ知らせを二度出さない）。
 */
let takenOver = false;

/**
 * いま「この端末を1台目にする」最中か。
 *
 * ログインすると、控えを書き終える前に画面側が読みに来る
 * （onAuthStateChange → loadAccount）。そのとき控えはまだ前の端末の
 * ままなので、**入ったばかりの端末が自分を締め出していた。**
 * 書き終えるまでのあいだ、突き合わせを止める。
 */
let claiming = 0;

export function tookOver(): boolean {
  const was = takenOver;
  takenOver = false;
  return was;
}

/**
 * 名簿に行が無ければ作り、いまの内容を返す。
 *
 * 何度呼んでも無料期間は延びない（データベース側で on conflict do nothing）。
 */
/**
 * 最後に確かめた会員の控え。
 *
 * **なぜ要るか**
 *   このアプリの一番の売りが「地下駐車場でも出る」ことにある。
 *   ところがログインの確認は通信を使う。繋がらないときに
 *   「ログインしていない」と判断すると、**地下へ入った瞬間に入口へ
 *   戻される。そこは電波が無いのでログインもできない。** 仕事が止まる。
 *
 * **期限は控えの中の日付で判断される**
 *   無料期間の終わりは日付であって、通信で決まるものではない。
 *   圏外でも、切れていれば切れていると分かる。
 *
 * **停止だけは、次に繋がるまで効かない**
 *   停止した方が電波を切れば、その間は使える。管理画面で停止した
 *   直後の数分に限られ、次に繋がった時点で締まる。ここを厳しくすると
 *   「圏外では誰も使えない」に戻ってしまう。
 */
const SNAPSHOT_KEY = 'kn_account_snapshot';

/**
 * 圏外で使える日数（最後にサーバーで確かめてから）。**既定の値。**
 *
 * 管理画面の「サイト設定」で変えられる（site_settings.offline_grace_days）。
 * 電波のある場所で開くたびに読み、控えに入れておく。圏外ではサーバーに
 * 聞けないため、控えの値で判断する。
 *
 * **なぜ上限を設けるか**
 *   停止した方・ほかの端末へ移った方も、圏外のままなら控えで使い続け
 *   られてしまう。どこかで確かめ直す必要がある。毎日使う乗務員の方なら、
 *   30日のあいだに必ず一度は電波のある場所で開くので、実際に当たることは
 *   まず無い。
 */
export const OFFLINE_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

interface Kept {
  account: Account;
  /** 最後にサーバーで確かめた時刻（ms） */
  verifiedAt: number;
  /** そのとき読んだ「圏外で使える日数」 */
  graceDays: number;
}

async function keepSnapshot(account: Account, graceDays: number): Promise<void> {
  const kept: Kept = { account, verifiedAt: Date.now(), graceDays };
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(kept)).catch(() => undefined);
}

async function readSnapshot(): Promise<Kept | null> {
  const raw = await AsyncStorage.getItem(SNAPSHOT_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Kept> & Partial<Account>;
    if (parsed.account && typeof parsed.account.userId === 'string') {
      return {
        account: parsed.account,
        verifiedAt: typeof parsed.verifiedAt === 'number' ? parsed.verifiedAt : Date.now(),
        graceDays: typeof parsed.graceDays === 'number' ? parsed.graceDays : OFFLINE_GRACE_DAYS,
      };
    }
    /*
      以前の形（会員の中身だけ）。確かめた日時を持っていない。
      **いま確かめたものとして扱う。** 厳しく扱うと、この版へ上がった
      直後に圏外で開いた方を締め出してしまう。次に電波のある場所で
      開いた時点で、新しい形に書き換わる。
    */
    if (typeof parsed.userId === 'string') {
      return { account: parsed as Account, verifiedAt: Date.now(), graceDays: OFFLINE_GRACE_DAYS };
    }
    return null;
  } catch {
    return null;
  }
}

/** ログアウト・退会のときに捨てる。次の方に前の方の控えを見せない。 */
async function dropSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(SNAPSHOT_KEY).catch(() => undefined);
}

/**
 * 圏外で使える日数を過ぎて、確かめ直しが要る状態か。
 *
 * 画面へ知らせるための合図（入口で「電波の届く場所で開いてください」を
 * 出す）。ログインの画面を出しても、圏外では入れない。行き止まりを
 * 見せるより、何をすればよいかを出す。確かめられた時点で消える。
 */
let offlineLimit: { days: number } | null = null;

export function offlineLimitReached(): { days: number } | null {
  return offlineLimit;
}

/**
 * 端末に残っているログインの控え（持ち主と、鍵の期限）。
 * 控えが無ければ null（ログアウトした・一度も入っていない）。
 */
async function storedSession(): Promise<{ userId: string; expiresAt: number } | null> {
  const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as { user?: { id?: unknown }; expires_at?: unknown };
    if (typeof stored.user?.id !== 'string') return null;
    const expiresAt = typeof stored.expires_at === 'number' ? stored.expires_at : 0;
    return { userId: stored.user.id, expiresAt };
  } catch {
    return null;
  }
}

/**
 * 鍵の取り替えが要る頃合いか。supabase-js と同じ幅（切れる90秒前から）で見る。
 */
const EXPIRY_MARGIN_MS = 90_000;

/**
 * 圏外のときに、最後に確かめた会員の控えで通す。
 *
 * **通さない場合**
 *   * 控えが無い（ログアウトした・退会した・一度も確かめていない）
 *   * 控えの持ち主と、端末に残っているログインの持ち主が違う
 *   * 最後に確かめてから、圏外で使える日数を過ぎた（→ 入口で知らせる）
 *
 * 期限（無料期間・お支払いの期間）と停止は、控えの中身どおりに効く。
 */
async function offlineAccount(userId?: string): Promise<Account | null> {
  const kept = await readSnapshot();
  if (!kept) return null;
  const owner = userId ?? (await storedSession())?.userId;
  if (!owner || kept.account.userId !== owner) return null;

  if (Date.now() - kept.verifiedAt > kept.graceDays * DAY_MS) {
    offlineLimit = { days: kept.graceDays };
    return null;
  }
  offlineLimit = null;
  return { ...kept.account, offline: true };
}

/**
 * 圏外で使える日数を読む。読めなければ既定（30日）。
 *
 * 列がまだ無い（データベースを更新する前）ときも既定で動く。
 */
async function loadGraceDays(): Promise<number> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('offline_grace_days')
    .eq('id', 1)
    .maybeSingle();
  const n = (data as { offline_grace_days?: unknown } | null)?.offline_grace_days;
  if (error || typeof n !== 'number' || !Number.isFinite(n) || n < 1) return OFFLINE_GRACE_DAYS;
  return Math.min(365, Math.floor(n));
}

/**
 * 名簿の行を取る。**届いたかどうかも返す。**
 *
 * サーバーが答えた誤りには code が付く（PostgREST が必ず付ける）。
 * 付いていなければ、そもそも届いていない。文言で見分けると、
 * 言語や版で変わったときに黙って壊れる。
 */
async function ensureProfile(): Promise<{ row: ProfileRow | null; reached: boolean }> {
  const { data, error } = await supabase.rpc('ensure_driver_profile');
  if (error) {
    const code = (error as { code?: string }).code;
    return { row: null, reached: typeof code === 'string' && code !== '' };
  }
  return { row: (data as ProfileRow) ?? null, reached: true };
}

/**
 * いまログインしている会員を返す。していなければ null。
 *
 * 名簿の行が無ければここで作る。確認メールを開いて初めてログインできる
 * 設定の場合、登録した時点では行を作れないため。
 */
export async function loadAccount(): Promise<Account | null> {
  /*
    **圏外で開いたとき、長く待たせない。**

    鍵の期限が切れていると、supabase は取り替えを間隔を広げながら
    やり直し、**30秒ほどたってから**諦める。そのあいだ画面は真っ白に
    なる（調べ終えるまで何も出さない作りのため）。先に端末の控えで
    期限を見て、切れていてサーバーにも届かなければ、すぐ控えで通す。
    届く場合だけ、supabase に取り替えを任せる。
  */
  const stored = await storedSession();
  if (
    stored &&
    stored.expiresAt * 1000 - Date.now() < EXPIRY_MARGIN_MS &&
    !(await reachServer(3000))
  ) {
    return offlineAccount(stored.userId);
  }

  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) {
    /*
      **圏外で、ログインの鍵を取り替えられなかった場合。**

      鍵は1時間で切れ、開くたびにサーバーで新しいものへ取り替える。
      圏外ではこれができず、supabase は「ログインしていない」と返す。
      ところが**ログインの控えは端末に残っている**（通信の失敗では
      消さない）。ここで入口へ戻すと、圏外ではログインもできないため
      行き止まりになる（ご指摘 2026-09-23）。最後に確かめた控えで通す。
    */
    if (error && isAuthRetryableFetchError(error)) return offlineAccount();
    offlineLimit = null;
    return null;
  }

  const { row, reached } = await ensureProfile();
  if (!row) {
    /*
      届かなかっただけなら、最後に確かめた姿で通す（圏外）。

      別の方の控えは使わない。いま入っている方のものだけ。
    */
    if (!reached) return offlineAccount(session.user.id);
    return null;
  }

  /*
    控えと違う端末なら、ここで出ていく。

    ほかの端末で入り直された、ということ。**空のときは通す**
    （この仕組みより前から入っている方を、いきなり締め出さない）。
    次に入り直した時点で控えが入る。
  */
  const mine = await deviceId();
  if (claiming === 0 && row.device_id && row.device_id !== mine) {
    takenOver = true;
    await dropSnapshot();
    await supabase.auth.signOut().catch(() => undefined);
    return null;
  }

  const account: Account = {
    userId: row.user_id,
    email: session.user.email ?? null,
    displayName: row.display_name,
    status: row.status,
    trialEndsAt: row.trial_ends_at,
    paidUntil: row.paid_until ?? null,
    avatarPath: row.avatar_path,
    avatarUrl: row.avatar_path ? avatarUrlOf(row.avatar_path) : null,
    plan: row.plan,
    planChosenAt: row.plan_chosen_at,
    memberNo: row.member_no,
    offline: false,
    freeReason: await loadFreeReason(),
  };

  // 次に圏外で開いたときのために控える。圏外で使える日数も、いま読んで入れておく
  offlineLimit = null;
  await keepSnapshot(account, await loadGraceDays());
  return account;
}

/**
 * 無料でお使いいただける方か（調査員など）。
 *
 * 尋ねられなかったときは、通常の会員として扱う（null）。データベースを
 * 更新する前でも、これまでどおり動く。
 */
async function loadFreeReason(): Promise<FreeReason | null> {
  try {
    const { data, error } = await supabase.rpc('my_free_access');
    if (error || !data || typeof data !== 'object') return null;
    const reason = (data as { reason?: unknown }).reason;
    return reason === 'surveyor' ? 'surveyor' : null;
  } catch {
    return null;
  }
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
 * いま見ている期間の終わり。
 *
 * **お支払い済みなら、お支払いいただいた期間の終わり。**
 * そうでなければ無料期間の終わり。ご指示 2026-09-15。
 *
 * お支払い済みで期限を持たない方（この欄を設ける前からの方）は null。
 * 呼ぶ側は「期限なし」として扱う。
 */
export function endsAt(account: Account): string | null {
  /* 無料でお使いいただいている方（調査員など）は期限なし */
  if (account.freeReason) return null;
  if (account.status === 'active') return account.paidUntil;
  return account.trialEndsAt;
}

/**
 * いま見ている期間の残り日数。
 *
 * 切り上げる。あと数時間でも「あと1日」と出したい。「あと0日」では
 * 今日中に切れるのか既に切れているのか読み取れない。
 *
 * 期限を持たない方は 0 を返す。残りを出す場面では、呼ぶ側が
 * endsAt() の null を見て出し分ける。
 */
export function daysLeft(account: Account, now: Date = new Date()): number {
  const at = endsAt(account);
  if (!at) return 0;
  const end = new Date(at).getTime();
  if (Number.isNaN(end)) return 0;
  const ms = end - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

/** 残りの長さ。月と、その端数の日。 */
export interface Span {
  months: number;
  days: number;
}

/**
 * いま見ている期間の残りを、月と日に分ける。
 *
 * **月だけで丸めない**（ご指摘 2026-09-15）。「あと11か月」では、
 * ちょうど11か月なのか11か月と28日なのかが分からない。
 *
 * **暦で数える。** 30日を1か月と見なすやり方だと、1年が「12か月5日」に
 * なる。9月15日から翌年9月15日までは、12か月ちょうどと出したい。
 *
 * 端数の日は切り上げる。daysLeft() と同じ考え方で、あと数時間でも
 * 「あと1日」と出す。
 *
 * 期限を持たない方・切れている方は 0か月 0日。呼ぶ側が endsAt() の
 * null と isExpired() を見て出し分ける。
 */
export function remaining(account: Account, now: Date = new Date()): Span {
  const at = endsAt(account);
  if (!at) return { months: 0, days: 0 };
  const end = new Date(at).getTime();
  if (Number.isNaN(end) || end <= now.getTime()) return { months: 0, days: 0 };

  /* いまから1か月ずつ進めて、終わりを越えない回数を数える。 */
  let months = 0;
  let cursor = now.getTime();
  for (;;) {
    const next = addMonth(new Date(cursor)).getTime();
    if (next > end) break;
    cursor = next;
    months++;
    /* 念のための歯止め。暦の計算が進まなくなっても回り続けない。 */
    if (months > 600) break;
  }

  return { months, days: Math.ceil((end - cursor) / 86_400_000) };
}

/**
 * 1か月進める。
 *
 * 足した先に同じ日が無ければ、その月の末日にする。素直に setMonth を
 * 使うと 1月31日 が 3月3日 になり、月の数え方がずれる。
 * 管理画面の nextPaidUntil() と同じ考え方（admin/src/lib/plans.ts）。
 */
function addMonth(from: Date): Date {
  const day = from.getDate();
  const to = new Date(from);
  to.setDate(1);
  to.setMonth(to.getMonth() + 1);
  const lastDay = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
  to.setDate(Math.min(day, lastDay));
  return to;
}

/**
 * 使える期間が切れているか。
 *
 * **お支払い済みでも切れる。** ご指示 2026-09-15。それまでは
 * 「ご利用中」にすると無期限に使えた。1か月ぶん払った方も1年ぶん
 * 払った方も同じ扱いで、止めるには人が気づいて手で停止するしかなかった。
 *
 * **期限を持たない方は切れない。** この欄を設ける前から「ご利用中」
 * だった方が当てはまる。期限を勝手に決めて突然締めることはしない。
 */
export function isExpired(account: Account, now: Date = new Date()): boolean {
  const at = endsAt(account);
  if (!at) return false;
  return new Date(at).getTime() <= now.getTime();
}
