/**
 * チャット「情報交換」の未読（2026-10-05）。
 *
 * ご指示「チャットに新しい書き込みが届いたら知らせ、未読があることを示す」。
 *
 * **どこに出すか**
 *   * 下のタブ（広い画面は左のメニュー）の「チャット」に未読の数
 *   * チャットの一覧の「情報交換」に「未読 ○」
 *   * ほかの画面を見ているあいだに届いたら、短い知らせ（帯）を出す。
 *     書き込みのたびに出すとうるさいので、TOAST_GAP_MS に1回まで。
 *     チャットの画面を開いているときは出さない
 *
 * **既読は「情報交換」を開いたとき。** 読み込んだいちばん新しい書き込みの
 * 時刻（サーバーの時刻）までを既読にする。端末の時計は使わない（ずれていると
 * 取りこぼす）。**自分の書き込みは数えない。**
 *
 * **既読の位置は端末に置く**（データベースは変えない）。1つのアカウントで
 * 使える端末は1台なので、端末の控えで足りる。アカウントごとに分けて持つ
 * （同じ端末で別の方が入っても、前の方の既読を引き継がない）。
 *
 * **はじめて使うとき**は、その時点でいちばん新しい書き込みまでを既読にする。
 * この版へ上がった途端に、これまでの書き込みが全部未読に見えないように。
 * 書き込みがまだ1件も無ければ、これから届くものはすべて未読になる。
 *
 * **数え直す合図**: Realtime の合図・アプリが表に出たとき・POLL_MS ごと。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAccount } from './account-context';
import { watchChat } from './chat';
import { useT } from './i18n/context';
import { notify } from './notice';
import { supabase } from './supabase';

const KEY = (userId: string) => `kn_chat_read_at:${userId}`;

/** 間隔での数え直し（Realtime が届かない環境のため） */
const POLL_MS = 60_000;

/** 短い知らせを出す間隔の下限 */
const TOAST_GAP_MS = 5 * 60_000;

/** 書き込みが1件も無いときの既読の位置（これより後はすべて未読） */
const BEGINNING = '1970-01-01T00:00:00.000Z';

/** 既読の位置（無ければ、いまいちばん新しい書き込みの時刻で始める） */
async function readAt(userId: string): Promise<string | null> {
  const kept = await AsyncStorage.getItem(KEY(userId)).catch(() => null);
  if (kept) return kept;
  const { data, error } = await supabase
    .from('chat_messages')
    .select('created_at')
    .eq('channel', 'general')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return null;
  const start = data?.[0]?.created_at ?? BEGINNING;
  await AsyncStorage.setItem(KEY(userId), start).catch(() => undefined);
  return start;
}

/** 未読の数。数えられなければ null（圏外など。そのときは前の数のまま） */
async function countUnread(userId: string): Promise<number | null> {
  try {
    const since = await readAt(userId);
    if (!since) return null;
    const { count, error } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'general')
      .gt('created_at', since)
      .neq('user_id', userId);
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

interface ChatUnreadValue {
  /** 未読の数 */
  unread: number;
  /** この時刻（サーバーの時刻）までを既読にする。チャットの画面が呼ぶ */
  markRead: (upTo: string) => Promise<void>;
}

const ChatUnreadContext = createContext<ChatUnreadValue>({
  unread: 0,
  markRead: async () => {},
});

export function ChatUnreadProvider({ children }: { children: ReactNode }) {
  const { account } = useAccount();
  const userId = account?.userId ?? null;
  const t = useT();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  /* 知らせの判断に使う控え（効果の作り直しを避けるため ref で持つ） */
  const last = useRef(0);
  const lastToast = useRef(0);
  /** 入ってから最初の数え上げを済ませたか。最初の分では知らせない */
  const primed = useRef(false);
  const here = useRef(pathname);
  const words = useRef(t);
  useEffect(() => {
    here.current = pathname;
  }, [pathname]);
  useEffect(() => {
    words.current = t;
  }, [t]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const n = await countUnread(userId);
    if (n === null) return;
    /*
      最初の数え上げでは知らせない。開いた時点で溜まっていた未読は、
      札の数で分かる。知らせるのは、使っているあいだに届いたときだけ。
    */
    if (!primed.current) {
      primed.current = true;
      last.current = n;
      setUnread(n);
      return;
    }
    const inChat = here.current === '/chat' || here.current.startsWith('/chat-room');
    if (n > last.current && !inChat && Date.now() - lastToast.current > TOAST_GAP_MS) {
      lastToast.current = Date.now();
      notify(words.current.chat.newMessage, words.current.chat.newMessageBody);
    }
    last.current = n;
    setUnread(n);
  }, [userId]);

  useEffect(() => {
    /* ログアウトしたら数えない（出す数は下で 0 にする） */
    last.current = 0;
    primed.current = false;
    if (!userId) return;
    /* 最初の数え上げは、描き終えてから（効果の中で状態を直に変えない） */
    const first = setTimeout(refresh, 0);
    const stop = watchChat(() => refresh());
    const timer = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => {
      clearTimeout(first);
      stop();
      clearInterval(timer);
      sub.remove();
    };
  }, [userId, refresh]);

  const markRead = useCallback(
    async (upTo: string) => {
      if (!userId) return;
      const kept = await AsyncStorage.getItem(KEY(userId)).catch(() => null);
      if (!kept || new Date(upTo).getTime() > new Date(kept).getTime()) {
        await AsyncStorage.setItem(KEY(userId), upTo).catch(() => undefined);
      }
      last.current = 0;
      await refresh();
    },
    [userId, refresh],
  );

  return (
    <ChatUnreadContext.Provider value={{ unread: userId ? unread : 0, markRead }}>{children}</ChatUnreadContext.Provider>
  );
}

export function useChatUnread(): ChatUnreadValue {
  return useContext(ChatUnreadContext);
}

/** 札に出す形（100以上は 99+） */
export function unreadLabel(n: number): string {
  return n > 99 ? '99+' : String(n);
}
