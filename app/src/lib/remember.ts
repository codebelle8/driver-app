/**
 * ログインの控え（メールアドレスとパスワード）。
 *
 * **なぜ持つか**
 *   ご指示による。次に開いたときに両方が入っていて、押すだけで
 *   入れるようにする。走行前の車内で打つ手数を減らす。
 *
 * **どこまで正直に申し上げるか**
 *   パスワードを端末へそのまま残す。ブラウザには、鍵を掛けて
 *   しまっておく場所が無い（端末側の安全な保管庫は、この配布形態
 *   ——PWA——では使えない）。**同じパスワードを他所でもお使いの場合、
 *   この端末を触れる人にそちらまで知られる。**
 *
 *   そのため、
 *     * 既定では控えない。印を付けた方だけ。
 *     * 画面にも「この端末に保存します」と出す。
 *     * ログアウトしても消さない（次に入るためのものなので）。
 *       消したい方は印を外して一度ログインすれば消える。
 *
 * **メールアドレスだけは、印が無くても控える**
 *   打ち直しの手数がいちばん多く、知られて困る度合いが低い。
 *   パスワードとは分けて置く。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const EMAIL_KEY = 'kn_login_email';
const SECRET_KEY = 'kn_login_secret';

export interface Remembered {
  email: string;
  password: string;
  /** パスワードまで控えてあるか */
  full: boolean;
}

/** 控えを読む。何も無ければ空。 */
export async function loadRemembered(): Promise<Remembered> {
  try {
    const [email, password] = await Promise.all([
      AsyncStorage.getItem(EMAIL_KEY),
      AsyncStorage.getItem(SECRET_KEY),
    ]);
    return {
      email: email ?? '',
      password: password ?? '',
      full: Boolean(password),
    };
  } catch {
    // 読めなくても、打っていただければ入れる。
    return { email: '', password: '', full: false };
  }
}

/**
 * 控える。
 *
 * remember が false のときは、パスワードだけ消してメールは残す。
 * 「次からは打ちたい」という意思表示なので、印を外した時点で消す。
 */
export async function remember(
  email: string,
  password: string,
  keepPassword: boolean,
): Promise<void> {
  try {
    await AsyncStorage.setItem(EMAIL_KEY, email.trim());
    if (keepPassword) await AsyncStorage.setItem(SECRET_KEY, password);
    else await AsyncStorage.removeItem(SECRET_KEY);
  } catch {
    // 控えられなくても、ログインそのものは済んでいる。黙って進む。
  }
}

/** 控えをすべて消す。退会のときに使う。 */
export async function forgetRemembered(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([EMAIL_KEY, SECRET_KEY]);
  } catch {
    // 消せなくても、アカウントそのものは消えている。
  }
}
