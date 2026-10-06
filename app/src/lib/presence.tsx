/**
 * チャットのオンライン状態（2026-10-06）。
 *
 * ご指示「チャットで、アイコンの横にオンライン状態を出す」。
 *
 * **オンライン = いまアプリを開いている方**（どの画面でもよい）。
 *   Supabase Realtime の Presence（その場の出席簿）に名乗り、アプリを閉じる・
 *   裏へ回すと名簿から外れる。データベースには何も書かない（記録が残らない）。
 *
 * **名乗る名前は「目印」**（chat_feed の me.key）。会員の id そのものではなく、
 * id から作った別の文字列。書き込みにも同じ目印が付くので、両方を突き合わせて
 * 「この書き込みの方はいまオンライン」と分かる。
 *
 * **出したくない方は、設定で切れる**（端末に置く。1アカウント1台）。切ると
 * 名乗らない（オフラインに見える）。ほかの方のオンライン状態は見られる。
 *
 * **オフラインと言えるのは、名簿が届いているときだけ**（ready。2026-10-06）。
 * 自分の通信が切れているあいだは、ほかの方が本当にいないのか分からない。
 * そのときは印を出さない（誰も「オフライン」と決めつけない）。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { useAccount } from './account-context';
import { loadFeed } from './chat';
import { supabase } from './supabase';

const HIDE_KEY = (userId: string) => `kn_presence_hidden:${userId}`;
const CHANNEL = 'kn-chat-presence';

interface PresenceValue {
  /** いまオンラインの方の目印 */
  online: Set<string>;
  /** 名簿が届いているか。false のあいだは、オンラインかどうか分からない */
  ready: boolean;
  /** 自分のオンライン状態を出さない設定か */
  hidden: boolean;
  setHidden: (v: boolean) => Promise<void>;
}

const PresenceContext = createContext<PresenceValue>({
  online: new Set(),
  ready: false,
  hidden: false,
  setHidden: async () => {},
});

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { account } = useAccount();
  const userId = account?.userId ?? null;
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [hidden, setHiddenState] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const channel = useRef<RealtimeChannel | null>(null);
  const hiddenRef = useRef(false);

  /* 設定と自分の目印を読む */
  useEffect(() => {
    let alive = true;
    if (!userId) return;
    (async () => {
      const kept = await AsyncStorage.getItem(HIDE_KEY(userId)).catch(() => null);
      const f = await loadFeed('general', undefined, 1);
      if (!alive) return;
      hiddenRef.current = kept === '1';
      setHiddenState(kept === '1');
      setKey(f?.me.key ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  /* 出席簿に入る（見るのは常に。名乗るのは、出す設定で・表にいるときだけ） */
  useEffect(() => {
    if (!userId || !key) return;
    const ch = supabase.channel(CHANNEL, { config: { presence: { key } } });
    channel.current = ch;
    ch.on('presence', { event: 'sync' }, () => {
      setOnline(new Set(Object.keys(ch.presenceState())));
      setReady(true);
    });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED' && !hiddenRef.current && AppState.currentState !== 'background') {
        ch.track({ at: Date.now() }).catch(() => undefined);
      }
      /* つなぎ直しのあいだは分からない。つながれば sync が届いて戻る */
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setReady(false);
    });
    /* ブラウザが圏外を知らせたら、すぐに「分からない」へ（通信の切断に気づくより早い） */
    const lost = () => setReady(false);
    /*
      戻ったとき。短い圏外ではつながりが切れずに残っていることがあり、そのときは
      名簿の知らせ（sync）が来ない。つながっていれば、いまの名簿を読み直す。
      切れていたなら、つなぎ直しのあとに sync が来て戻る。
    */
    const back = () => {
      if (ch.state !== 'joined') return;
      setOnline(new Set(Object.keys(ch.presenceState())));
      setReady(true);
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('offline', lost);
      window.addEventListener('online', back);
    }
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        if (!hiddenRef.current) ch.track({ at: Date.now() }).catch(() => undefined);
      } else if (s === 'background') {
        ch.untrack().catch(() => undefined);
      }
    });
    return () => {
      sub.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('offline', lost);
        window.removeEventListener('online', back);
      }
      setReady(false);
      channel.current = null;
      supabase.removeChannel(ch).catch(() => undefined);
    };
  }, [userId, key]);

  const setHidden = useCallback(
    async (v: boolean) => {
      if (!userId) return;
      hiddenRef.current = v;
      setHiddenState(v);
      await AsyncStorage.setItem(HIDE_KEY(userId), v ? '1' : '0').catch(() => undefined);
      const ch = channel.current;
      if (!ch) return;
      if (v) await ch.untrack().catch(() => undefined);
      else await ch.track({ at: Date.now() }).catch(() => undefined);
    },
    [userId],
  );

  return (
    <PresenceContext.Provider
      value={{ online: userId ? online : new Set(), ready: !!userId && ready, hidden, setHidden }}
    >
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence(): PresenceValue {
  return useContext(PresenceContext);
}
