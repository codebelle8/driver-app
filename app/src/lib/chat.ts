/**
 * チャット：会員どうしの書き込み（「情報交換」チャンネル）。
 *
 * ご指示（2026-10-05）。チャットの第2段。
 *
 * **全員に見える掲示板の形だけ。1対1のやりとり（DM）は作らない**
 * （電気通信事業法の届出に当たらないようにするため。弁護士のご確認事項）。
 *
 * **決まりはデータベースが持つ**（supabase/migrations/20261005000005_chat.sql）
 *   * 書けるのは自分の名前で・1件500字まで・1分に5件／1日に100件まで
 *   * 止められた会員（blocked）と、書き込みを止められた会員は書けない
 *   * 運営（管理者・編集者）が非表示にしたものは、会員には返らない
 *   * 通報は他人の書き込みに1人1回。誰が通報したかは会員には見えない
 *
 * **新しい書き込みは2通りで拾う**
 *   Supabase Realtime の合図（行が増えた・変わった）で読み直す。届かない
 *   環境（会社の網・電波の弱い場所）もあるので、開いているあいだは
 *   一定の間隔でも読み直す。
 */
import { supabase } from './supabase';

/** チャンネル。いまは「情報交換」だけ */
export type ChatChannel = 'general';

/** 1件の上限（データベースの制約と同じ） */
export const MAX_MESSAGE = 500;

/** 一度に読む件数（日数で区切らないとき） */
export const PAGE = 50;

/**
 * 10日ずつ読む（2026-10-08 ご指示）。
 *
 *   最初は直近の10日ぶん。上へスクロールしたら、その前の10日ぶんを取りに行く。
 *   90日ぶんを一度に端末へ送らないので、会員が増えても軽いまま。
 *   10日のあいだが少なくても画面が空にならないよう、少なくとも MIN_MESSAGES 件、
 *   多すぎるときは WINDOW_LIMIT 件まで（続きはスクロールで読む）。
 *
 * **90日を過ぎた書き込みは、データベースが返さない**（会員の画面から外れる）。
 */
export const WINDOW_DAYS = 10;
export const MIN_MESSAGES = 20;
export const WINDOW_LIMIT = 300;

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  /** 自分の書き込みか */
  mine: boolean;
  /** 表示名。無ければ null（画面で「名前未設定の会員」） */
  name: string | null;
  avatarPath: string | null;
  /**
   * 書いた方の目印（オンライン状態と結びつける。2026-10-06）。
   * 会員の id ではなく、id から作った別の文字列。データベースの更新前は ''。
   */
  author: string;
}

export interface ChatFeed {
  /** 新しい順 */
  messages: ChatMessage[];
  /**
   * 返した中でいちばん古いものより前に、まだ書き込みがあるか（90日の線まで）。
   * データベースの更新前は null（呼ぶ側が件数で見る）。
   */
  more: boolean | null;
  /** 会員の画面に残す日数（90）。更新前は null */
  retentionDays: number | null;
  me: {
    canPost: boolean;
    /** 運営が書き込みを止めている */
    muted: boolean;
    /** ご利用を止めている */
    blocked: boolean;
    /** 表示名があるか */
    hasName: boolean;
    /** 自分の目印（オンラインの出席簿に名乗るときに使う）。更新前は null */
    key: string | null;
  };
}

export type ChatProblem = 'offline' | 'tooMany' | 'notAllowed' | 'already' | 'unknown';

interface RawError {
  code?: string;
  message?: string;
  hint?: string;
}

function toProblem(error: RawError | null | undefined): ChatProblem {
  const text = `${error?.message ?? ''} ${error?.hint ?? ''}`;
  if (text.includes('too_many_messages')) return 'tooMany';
  /* 同じ書き込みを2回通報した */
  if (error?.code === '23505') return 'already';
  /* 止められている（書く権限の条件で弾かれる） */
  if (error?.code === '42501') return 'notAllowed';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(text)) return 'offline';
  return 'unknown';
}

/**
 * 読む。before を渡すと、それより前の書き込み（さかのぼり）。
 * window を渡すと日数で区切る（直近10日ぶん、など）。
 */
export async function loadFeed(
  channel: ChatChannel = 'general',
  before?: string,
  limit = PAGE,
  window?: { days: number; min: number },
): Promise<ChatFeed | null> {
  try {
    const { data, error } = await supabase.rpc('chat_feed', {
      p_channel: channel,
      p_before: before ?? null,
      p_limit: limit,
      ...(window ? { p_days: window.days, p_min: window.min } : {}),
    });
    if (error || !data || typeof data !== 'object') return null;
    const j = data as {
      messages?: {
        id: string;
        body: string;
        created_at: string;
        mine: boolean;
        name: string | null;
        avatar_path: string | null;
        author?: string;
      }[];
      me?: { can_post?: boolean; muted?: boolean; blocked?: boolean; has_name?: boolean; key?: string };
      more?: boolean;
      retention_days?: number;
    };
    return {
      messages: (j.messages ?? []).map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.created_at,
        mine: !!m.mine,
        name: m.name ?? null,
        avatarPath: m.avatar_path ?? null,
        author: m.author ?? '',
      })),
      more: typeof j.more === 'boolean' ? j.more : null,
      retentionDays: typeof j.retention_days === 'number' ? j.retention_days : null,
      me: {
        canPost: !!j.me?.can_post,
        muted: !!j.me?.muted,
        blocked: !!j.me?.blocked,
        hasName: !!j.me?.has_name,
        key: j.me?.key ?? null,
      },
    };
  } catch {
    return null;
  }
}

export type ChatResult = { ok: true } | { ok: false; problem: ChatProblem };

/** 書く */
export async function postMessage(userId: string, body: string, channel: ChatChannel = 'general'): Promise<ChatResult> {
  const text = body.trim().slice(0, MAX_MESSAGE);
  if (!text) return { ok: false, problem: 'unknown' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, problem: 'offline' };
  try {
    const { error } = await supabase.from('chat_messages').insert({ user_id: userId, channel, body: text });
    return error ? { ok: false, problem: toProblem(error) } : { ok: true };
  } catch (e) {
    const p = toProblem(e as RawError);
    return { ok: false, problem: p === 'unknown' ? 'offline' : p };
  }
}

/** 自分の書き込みを消す */
export async function deleteMessage(id: string): Promise<ChatResult> {
  try {
    const { error } = await supabase.from('chat_messages').delete().eq('id', id);
    return error ? { ok: false, problem: toProblem(error) } : { ok: true };
  } catch (e) {
    return { ok: false, problem: toProblem(e as RawError) };
  }
}

/** 他人の書き込みを通報する（1人1回） */
export async function reportMessage(messageId: string, userId: string): Promise<ChatResult> {
  try {
    const { error } = await supabase
      .from('chat_reports')
      .insert({ message_id: messageId, reporter_id: userId });
    return error ? { ok: false, problem: toProblem(error) } : { ok: true };
  } catch (e) {
    return { ok: false, problem: toProblem(e as RawError) };
  }
}

/**
 * 新しい書き込みの合図を受ける。戻り値を呼ぶと外れる。
 *
 * 中身は使わない（名前を添えて読むため、合図のたびに loadFeed で読み直す）。
 * 受け取れない環境でも、呼ぶ側の間隔での読み直しで追いつく。
 */
export function watchChat(onChange: () => void): () => void {
  try {
    const ch = supabase
      .channel(`chat-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => onChange())
      .subscribe();
    return () => {
      supabase.removeChannel(ch).catch(() => undefined);
    };
  } catch {
    return () => undefined;
  }
}
