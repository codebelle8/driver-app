import { supabase } from './supabase';

/**
 * ご意見箱（2026-11-02）。会員から、アプリへのご意見・ご要望を受け付ける。
 *
 * 「探す」画面の右下の絵から開く。情報提供（施設ごとの情報）とは別の表
 * （feedback。20261102000001_feedback.sql）に入れる。件数は何にも数えない。
 *
 * **文字だけ。** 写真は付けない。ブラウザでも端末（APK）でも同じように送れる。
 */

/** 本文の上限（データベースの制約と同じ） */
export const MAX_BODY = 1000;

/** 種類（データベースの制約と同じ順） */
export const FEEDBACK_KINDS = ['feature', 'trouble', 'other'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** 状態（管理者が切り替える）。送った直後は new */
export type FeedbackStatus = 'new' | 'considering' | 'done' | 'declined';

export interface FeedbackRow {
  id: string;
  kind: FeedbackKind;
  body: string;
  status: FeedbackStatus;
  created_at: string;
}

export type SendProblem = 'offline' | 'tooMany' | 'blocked' | 'unknown';
export type SendResult = { ok: true } | { ok: false; problem: SendProblem };

interface RawError {
  code?: string;
  message?: string;
  hint?: string;
}

function toProblem(error: RawError | null | undefined): SendProblem {
  const text = `${error?.message ?? ''} ${error?.hint ?? ''}`;
  if (text.includes('too_many_feedback')) return 'tooMany';
  /* 止められた会員は、送る権限の条件（RLS）で弾かれる */
  if (error?.code === '42501') return 'blocked';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(text)) return 'offline';
  return 'unknown';
}

/** 送る */
export async function sendFeedback(userId: string, kind: FeedbackKind, body: string): Promise<SendResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, problem: 'offline' };
  }
  try {
    const { error } = await supabase.from('feedback').insert({
      user_id: userId,
      kind,
      body: body.trim().slice(0, MAX_BODY),
    });
    return error ? { ok: false, problem: toProblem(error) } : { ok: true };
  } catch (e) {
    const p = toProblem(e as RawError);
    return { ok: false, problem: p === 'unknown' ? 'offline' : p };
  }
}

/**
 * 自分の送ったご意見（新しい順に50件）。読めなければ空で返す
 * （データベースを更新する前・通信できないときも、画面は止めない）。
 */
export async function fetchMyFeedback(userId: string): Promise<FeedbackRow[]> {
  try {
    const { data, error } = await supabase
      .from('feedback')
      .select('id, kind, body, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return [];
    return (data ?? []) as FeedbackRow[];
  } catch {
    return [];
  }
}
