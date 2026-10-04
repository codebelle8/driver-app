/**
 * 情報提供（会員から施設の情報を送っていただく）。
 *
 * ご依頼（2026-10-05）。有料化のあと、情報提供の多い方を翌月無料にする
 * （発注元のご回答 2026-10-04）。その件数の元になる。
 * 件数に数えるのは、管理画面で「採用」されたものだけ。
 *
 * **送ったものは書き換えられない**
 *   採用の判断のあとで中身が変わると、何を採用したのかが分からなくなる。
 *   データベースの側でも、会員には書き換えの権限を渡していない
 *   （supabase/migrations/20261005000001_submissions.sql）。
 *
 * **写真はブラウザだけ**
 *   端末側（Expo Go・APK）で写真を選ぶには、新しい部品の追加と作り直しが
 *   要る（顔写真と同じ事情。lib/avatar.ts）。端末側では写真の欄を出さず、
 *   文と位置だけを送れる。
 *
 * **写真は非公開の置き場所へ**（submissions）
 *   車寄せの写真には、人の顔やナンバーが写りうる。読めるのは送った本人と
 *   管理者・編集者だけ。道筋は `<自分のid>/<この情報のid>_<番号>.jpg`。
 *   退会のときに `<自分のid>/` の一覧からまとめて消せるよう、平らに置く。
 */
import { chooseFile } from './avatar';
import { supabase } from './supabase';

/** 写真の置き場所 */
const BUCKET = 'submissions';

/** 送れる写真の枚数（データベースの制約と同じ） */
export const MAX_PHOTOS = 3;

/** 本文の上限（データベースの制約と同じ） */
export const MAX_BODY = 1000;

/**
 * 写真の長いほうの辺（px）。
 *
 * 入口の位置や看板の文字が読める大きさ。携帯の写真（3〜8MB）を
 * そのまま預かると、置き場所も通信も無駄になる。
 */
const LONG_EDGE = 1600;
const QUALITY = 0.82;

/**
 * 種類（発注元への提案 2026-10-05）。並びは画面に出す順。
 * データベースの制約と同じ値にすること。
 */
export const SUBMISSION_KINDS = ['wrong_place', 'new_entry', 'photo', 'caution', 'other'] as const;
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number];

/** 送れなかった理由 */
export type SendProblem =
  /** 通信できない */
  | 'offline'
  /** 24時間に送れる数を超えた */
  | 'tooMany'
  /** こちらでご利用を止めている */
  | 'blocked'
  /** 写真を上げられなかった */
  | 'photo'
  | 'unknown';

export type SendResult = { ok: true } | { ok: false; problem: SendProblem };

/** 写真を選んだ結果 */
export type PickedPhoto =
  | { ok: true; blob: Blob }
  /** 閉じただけ。何も言わない */
  | { ok: false; reason: 'cancelled' }
  /** 選ばれたが、画像として読めなかった */
  | { ok: false; reason: 'unreadable' };

/** この端末で写真を添えられるか */
export function canAttachPhotos(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

/** 写真を選んでもらい、送れる大きさへ縮めて返す */
export async function pickPhoto(): Promise<PickedPhoto> {
  if (!canAttachPhotos()) return { ok: false, reason: 'cancelled' };
  const file = await chooseFile();
  if (!file) return { ok: false, reason: 'cancelled' };
  const blob = await shrink(file);
  if (!blob) return { ok: false, reason: 'unreadable' };
  return { ok: true, blob };
}

/**
 * 長いほうの辺を LONG_EDGE へ縮める（小さければそのまま描き直す）。
 *
 * 描き直すのは、jpeg にそろえるためと、写真に埋め込まれた撮影位置などの
 * 付帯情報を落とすため。位置は本人が「添える」を選んだときだけ受け取る。
 */
function shrink(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, LONG_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', QUALITY);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** 端末で決める id。写真の道筋と行の id を同じにするため */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  /* randomUUID の無い古い環境。形だけ uuid にそろえる */
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

interface RawError {
  code?: string;
  message?: string;
  hint?: string;
}

function toProblem(error: RawError | null | undefined): SendProblem {
  const text = `${error?.message ?? ''} ${error?.hint ?? ''}`;
  if (text.includes('too_many_submissions')) return 'tooMany';
  /* 止められた会員は、送る権限の条件（RLS）で弾かれる */
  if (error?.code === '42501') return 'blocked';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(text)) return 'offline';
  return 'unknown';
}

export interface Submission {
  facilityId: string;
  entryPointId: string | null;
  kind: SubmissionKind;
  body: string;
  photos: Blob[];
  /** 本人が「いまいる場所を添える」を選んだときだけ */
  coords: { lat: number; lng: number } | null;
}

/**
 * 送る。
 *
 * 写真を先に上げ、そのあと行を作る。行を作れなかったら、上げた写真を
 * 片付ける（どの情報にも結びつかない写真を残さない）。
 */
export async function sendSubmission(userId: string, s: Submission): Promise<SendResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, problem: 'offline' };
  }

  const id = newId();
  const uploaded: string[] = [];

  try {
    for (const [i, blob] of s.photos.slice(0, MAX_PHOTOS).entries()) {
      const path = `${userId}/${id}_${i + 1}.jpg`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) {
        await removePhotos(uploaded);
        const p = toProblem(error);
        return { ok: false, problem: p === 'unknown' ? 'photo' : p };
      }
      uploaded.push(path);
    }

    const { error } = await supabase.from('submissions').insert({
      id,
      user_id: userId,
      facility_id: s.facilityId,
      entry_point_id: s.entryPointId,
      kind: s.kind,
      body: s.body.trim().slice(0, MAX_BODY),
      photo_paths: uploaded,
      lat: s.coords?.lat ?? null,
      lng: s.coords?.lng ?? null,
    });
    if (error) {
      await removePhotos(uploaded);
      return { ok: false, problem: toProblem(error) };
    }
    return { ok: true };
  } catch (e) {
    await removePhotos(uploaded);
    return { ok: false, problem: toProblem(e as RawError) === 'unknown' ? 'offline' : toProblem(e as RawError) };
  }
}

async function removePhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabase.storage.from(BUCKET).remove(paths).catch(() => undefined);
}

/**
 * 退会のとき、送った写真を片付ける。
 *
 * 行（submissions）は、アカウントを消すとデータベースが一緒に消す。
 * 写真の置き場所は、データベースの関数からは触れないため、ここで消す。
 * 消せなくても退会は止めない（他人から辿れる道は無い）。
 */
export async function removeMySubmissionPhotos(userId: string): Promise<void> {
  try {
    const { data } = await supabase.storage.from(BUCKET).list(userId, { limit: 1000 });
    if (data && data.length > 0) {
      await supabase.storage.from(BUCKET).remove(data.map((f) => `${userId}/${f.name}`));
    }
  } catch {
    // 片付けられなくても、退会は止めない
  }
}
