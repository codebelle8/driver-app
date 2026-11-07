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
 *
 * **画像を1枚添えられる**（ご指示 2026-11-08。supabase/migrations/20261108000001_chat_images.sql）
 *   * 文だけ・画像だけ・文と画像のどれでも書ける。画像は1日に20枚まで
 *   * 置き場所は非公開（chat-images）。隠された書き込みや90日を過ぎた書き込みの
 *     画像は、データベースが会員に渡さない。読めるときだけ期限つきの URL をもらう
 *   * 送る前に長いほうの辺を IMAGE_EDGE へ縮め、jpeg に描き直す（撮影位置も落ちる）
 *   * 写真を選べるのはブラウザだけ（顔写真・情報提供の写真と同じ事情。lib/avatar.ts）
 */
import { Platform } from 'react-native';

import { chooseFile, shrinkImage } from './avatar';
import { newId } from './submissions';
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

/** 画像の置き場所（非公開） */
const IMAGE_BUCKET = 'chat-images';

/**
 * 画像の長いほうの辺（px）。書き込みの中では 240px ほどで出し、押すと
 * 画面いっぱいに広げる。看板の文字が読める大きさで、1枚 100〜300KB に収まる。
 */
const IMAGE_EDGE = 1280;
const IMAGE_QUALITY = 0.8;

/**
 * 期限つき URL の長さ（秒）。チャットを開いているあいだに切れないよう1時間。
 * 切れる5分前を過ぎたら、もらい直す。
 */
const SIGN_SECONDS = 60 * 60;
const RESIGN_BEFORE_MS = 5 * 60_000;

/** 添えた画像 */
export interface ChatImage {
  /** 置き場所の中の道筋（<書いた人のid>/<書き込みのid>.jpg） */
  path: string;
  width: number;
  height: number;
}

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
  /** 添えた画像。無ければ null（文だけの書き込み） */
  image: ChatImage | null;
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

export type ChatProblem =
  | 'offline'
  | 'tooMany'
  /** 画像は1日に20枚まで */
  | 'tooManyImages'
  /** 画像を上げられなかった */
  | 'image'
  | 'notAllowed'
  | 'already'
  | 'unknown';

interface RawError {
  code?: string;
  message?: string;
  hint?: string;
}

function toProblem(error: RawError | null | undefined): ChatProblem {
  const text = `${error?.message ?? ''} ${error?.hint ?? ''}`;
  if (text.includes('too_many_messages')) return 'tooMany';
  if (text.includes('too_many_images')) return 'tooManyImages';
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
        image_path?: string | null;
        image_width?: number | null;
        image_height?: number | null;
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
        image:
          m.image_path && m.image_width && m.image_height
            ? { path: m.image_path, width: m.image_width, height: m.image_height }
            : null,
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

/** 送る前の画像（縮めたもの） */
export interface ChatImageDraft {
  blob: Blob;
  width: number;
  height: number;
}

export type PickedChatImage =
  | { ok: true; image: ChatImageDraft }
  /** 閉じただけ。何も言わない */
  | { ok: false; reason: 'cancelled' }
  /** 選ばれたが、画像として読めなかった */
  | { ok: false; reason: 'unreadable' };

/** この端末で画像を添えられるか（いまはブラウザだけ） */
export function canAttachChatImage(): boolean {
  return Platform.OS === 'web' && typeof document !== 'undefined';
}

/** 画像を選んでもらい、送れる大きさへ縮めて返す */
export async function pickChatImage(): Promise<PickedChatImage> {
  if (!canAttachChatImage()) return { ok: false, reason: 'cancelled' };
  const file = await chooseFile();
  if (!file) return { ok: false, reason: 'cancelled' };
  const shrunk = await shrinkImage(file, IMAGE_EDGE, IMAGE_QUALITY);
  if (!shrunk) return { ok: false, reason: 'unreadable' };
  return { ok: true, image: shrunk };
}

/**
 * 書く。画像があれば先に上げ、そのあと行を作る。行を作れなかったら、
 * 上げた画像を片付ける（どの書き込みにも付かない画像を残さない）。
 *
 * 書き込みの id は、ここで決める。画像の道筋（<自分のid>/<書き込みのid>.jpg）と
 * 合っているかを、データベースが確かめる。
 */
export async function postMessage(
  userId: string,
  body: string,
  image: ChatImageDraft | null = null,
  channel: ChatChannel = 'general',
): Promise<ChatResult> {
  const text = body.trim().slice(0, MAX_MESSAGE);
  if (!text && !image) return { ok: false, problem: 'unknown' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, problem: 'offline' };

  const id = newId();
  const path = image ? `${userId}/${id}.jpg` : null;
  try {
    if (image && path) {
      const { error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, image.blob, { contentType: 'image/jpeg', upsert: false });
      if (error) {
        const p = toProblem(error);
        return { ok: false, problem: p === 'unknown' ? 'image' : p };
      }
    }
    /* 画像の列は、画像があるときだけ送る（データベースの更新前でも、文は書けるように） */
    const { error } = await supabase.from('chat_messages').insert({
      id,
      user_id: userId,
      channel,
      body: text,
      ...(image && path ? { image_path: path, image_width: image.width, image_height: image.height } : {}),
    });
    if (error) {
      if (path) await removeImage(path);
      return { ok: false, problem: toProblem(error) };
    }
    return { ok: true };
  } catch (e) {
    if (path) await removeImage(path);
    const p = toProblem(e as RawError);
    return { ok: false, problem: p === 'unknown' ? 'offline' : p };
  }
}

async function removeImage(path: string): Promise<void> {
  await supabase.storage.from(IMAGE_BUCKET).remove([path]).catch(() => undefined);
}

/**
 * 自分の書き込みを消す。画像も置き場所から消す。
 * 消せなくても構わない（書き込みが消えた時点で、ほかの会員には読めない。
 * 残ったものは、管理画面を開いたときにデータベースの控えから消す）。
 */
export async function deleteMessage(id: string, image: ChatImage | null = null): Promise<ChatResult> {
  try {
    const { error } = await supabase.from('chat_messages').delete().eq('id', id);
    if (error) return { ok: false, problem: toProblem(error) };
    if (image) await removeImage(image.path);
    return { ok: true };
  } catch (e) {
    return { ok: false, problem: toProblem(e as RawError) };
  }
}

/** もらった期限つき URL（道筋ごと）。開き直しても同じ URL を使い、画像を読み直させない */
const signed = new Map<string, { url: string; until: number }>();

/**
 * 画像の期限つき URL をまとめてもらう。読めない画像（隠された・消された）は入らない。
 * 戻り値は 道筋 → URL。
 */
export async function chatImageUrls(paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const need = [...new Set(paths)].filter((p) => {
    const s = signed.get(p);
    return !s || s.until - now < RESIGN_BEFORE_MS;
  });
  if (need.length > 0) {
    try {
      const { data } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(need, SIGN_SECONDS);
      for (const d of data ?? []) {
        if (d.path && d.signedUrl && !d.error) signed.set(d.path, { url: d.signedUrl, until: now + SIGN_SECONDS * 1000 });
      }
    } catch {
      // 読めなかった画像は出さない（次に読み直したときに、もう一度もらう）
    }
  }
  const out = new Map<string, string>();
  for (const p of paths) {
    const s = signed.get(p);
    if (s) out.set(p, s.url);
  }
  return out;
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
