/**
 * ホーム画面への追加。
 *
 * **なぜ要るか**
 *   iPhone は、ホーム画面へ追加した場合のみプッシュ通知を受け取れる
 *   （iOS 16.4 以上）。Safari のタブで開いているあいだは、許可を求める
 *   ことすらできない。通知を作っても、追加していただかないと届かない。
 *
 *   あわせて、追加すると起動が速くなり、住所欄やタブの帯が消えて
 *   画面が広くなる。走行前に片手で見る使い方に向く。
 *
 * **勝手に出さない**
 *   開いた瞬間に「追加してください」と被せると、邪魔になるだけで
 *   読まれない。マイページの中に置き、必要な方が見つける形にする。
 *
 * **やり方が端末で違う**
 *   iPhone は共有ボタンから手で追加する（機械的に出す手立てが無い）。
 *   Android の Chrome は、ブラウザが「入れますか」を出せる。
 *   出せるときは押すだけにし、出せないときは手順を文字で伝える。
 */
import { Platform } from 'react-native';

export type InstallState =
  /** 既に追加済み（または追加の要らない環境） */
  | 'installed'
  /** iPhone・iPad。手で追加していただく */
  | 'ios'
  /** ブラウザが「入れますか」を出せる */
  | 'prompt'
  /** 追加できるが、こちらからは押せない */
  | 'manual'
  /** 追加という考え方が無い（端末アプリなど） */
  | 'none';

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';

/**
 * ブラウザからの「入れますか」の申し出。
 *
 * これは押していただく前に一度だけ飛んでくる。受け取った時点で
 * 押せる状態になるため、取っておく。取り逃すと二度と来ない。
 */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let waiting: InstallPrompt | null = null;

if (isWeb()) {
  window.addEventListener('beforeinstallprompt', (e) => {
    // 既定の出し方（ブラウザ任せの帯）は止め、こちらの都合で出す
    e.preventDefault();
    waiting = e as InstallPrompt;
  });
  window.addEventListener('appinstalled', () => {
    waiting = null;
  });
}

/** ホーム画面へ追加した状態で開いているか */
export function isInstalled(): boolean {
  if (!isWeb()) return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches)
  );
}

/** iPhone・iPad か */
export function isApple(): boolean {
  if (!isWeb()) return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

/** いまの状態 */
export function installState(): InstallState {
  if (!isWeb()) return 'none';
  if (isInstalled()) return 'installed';
  if (isApple()) return 'ios';
  return waiting ? 'prompt' : 'manual';
}

/**
 * ブラウザの「入れますか」を出す。
 *
 * 出せたときだけ true。断られた場合も true（出したことは出した）。
 * 申し出は一度きりなので、使ったら捨てる。
 */
export async function askToInstall(): Promise<boolean> {
  if (!waiting) return false;
  const prompt = waiting;
  waiting = null;
  try {
    await prompt.prompt();
    await prompt.userChoice;
    return true;
  } catch {
    return false;
  }
}
