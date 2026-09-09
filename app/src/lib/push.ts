/**
 * プッシュ通知の受け取り。
 *
 * **なぜ要るか**
 *   アプリ内のお知らせは、開かないと気づけない。注意事項の追加は
 *   出発前に知りたい性質のもので、開いたときに気づくのでは遅い場面がある。
 *
 * **ブラウザだけ**
 *   端末側（Expo Go・APK）で受け取るには別の仕組み（FCM/APNs）と
 *   作り直しが要る。この製品は PWA として配っており、まずブラウザで
 *   動く形にする。
 *
 * **iPhone は「ホーム画面へ追加」が要る**
 *   iOS 16.4 以上、かつホーム画面へ追加した場合のみ受け取れる。
 *   Safari のタブで開いているあいだは、許可を求めることすらできない。
 *   そのことを画面で伝える（黙って何も起きないと、壊れて見える）。
 *
 * **鍵はサーバーから取る**
 *   購読には配信元の公開鍵（VAPID）が要る。配布物へ焼き込むと、
 *   鍵を作り直すたびに配り直しになる。名簿と同じところから取る。
 *   秘密鍵は渡っていない（列ごとの権限で公開鍵だけを渡している）。
 */
import { Platform } from 'react-native';

import { supabase } from './supabase';

/** いまこの端末が、どういう状態にあるか */
export type PushState =
  /** この端末・ブラウザでは受け取れない */
  | 'unsupported'
  /** iPhone で、ホーム画面へ追加していない */
  | 'needsHomeScreen'
  /** 配信元の鍵がまだ用意されていない（管理画面で作る） */
  | 'notReady'
  /** 一度断られている。ブラウザの設定からでないと戻せない */
  | 'denied'
  /** 受け取れるが、まだ入れていない */
  | 'off'
  /** 受け取る */
  | 'on';

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';

/** ホーム画面へ追加した状態で開いているか */
function standalone(): boolean {
  if (!isWeb()) return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches)
  );
}

/** iPhone・iPad か */
function isApple(): boolean {
  if (!isWeb()) return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

/** 配信元の公開鍵。管理画面で作るまでは空。 */
async function publicKey(): Promise<string | null> {
  const { data, error } = await supabase
    .from('push_settings')
    .select('public_key')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return null;
  const key = (data as { public_key: string | null }).public_key;
  return key && key.trim() !== '' ? key : null;
}

/** いまの状態を調べる */
export async function pushState(): Promise<PushState> {
  if (!isWeb()) return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    /*
      iPhone は、ホーム画面へ追加するまで PushManager そのものが無い。
      「使えない端末」と「まだ追加していない端末」を分けて伝える。
    */
    return isApple() && !standalone() ? 'needsHomeScreen' : 'unsupported';
  }
  if (isApple() && !standalone()) return 'needsHomeScreen';

  if (Notification.permission === 'denied') return 'denied';
  if (!(await publicKey())) return 'notReady';

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/**
 * 受け取りを始める。
 *
 * 許可を求め、購読を作り、宛先を控える。断られたら 'denied'。
 */
export async function enablePush(): Promise<PushState> {
  const before = await pushState();
  if (before !== 'off' && before !== 'on') return before;

  const key = await publicKey();
  if (!key) return 'notReady';

  /*
    許可を求めるのは、押していただいた直後だけにする。

    開いた瞬間に出す作りにすると、多くの方が反射で「許可しない」を
    押す。一度断られると、ブラウザの設定からでないと戻せない。
  */
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        // 中身の見えない通知は、ブラウザが受け付けない
        userVisibleOnly: true,
        applicationServerKey: toBytes(key),
      }));

    const saved = await save(sub);
    return saved ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/** 受け取りをやめる。宛先も消す。 */
export async function disablePush(): Promise<PushState> {
  if (!isWeb() || !('serviceWorker' in navigator)) return 'unsupported';

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    // 消せなくても、画面上は「受け取らない」にしておく。
  }
  return 'off';
}

/** 宛先を控える。同じ端末から入り直したら上書きする。 */
async function save(sub: PushSubscription): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return false;

  const json = sub.toJSON();
  const keys = json.keys ?? {};
  if (!keys.p256dh || !keys.auth) return false;

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: window.navigator.userAgent.slice(0, 300),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );
  return !error;
}

/**
 * 配信元の公開鍵を、ブラウザが受け取れる形へ直す。
 *
 * 鍵は URL 用の base64（+ と / を - と _ に置き換え、末尾の = を落とした形）で
 * 届く。そのままでは atob が読めないため、元の base64 へ戻してから解く。
 */
function toBytes(base64Url: string): ArrayBuffer {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=');
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  // ブラウザは ArrayBuffer を求める。Uint8Array のままでは型が合わない。
  return bytes.buffer;
}
