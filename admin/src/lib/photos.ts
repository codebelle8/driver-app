/**
 * 写真の保存先とURLの規則。
 *
 * Supabase の画像変換機能は有料プラン限定のため、アップロード時に
 * 管理画面側で2種類を生成して保存する。
 *
 *   photos/{施設コード}/{ファイル名}.webp   … 詳細表示用 (長辺1200px)
 *   thumbs/{施設コード}/{ファイル名}.webp   … 一覧用     (長辺400px)
 *
 * photos.storage_path には詳細版のパスを保存し、
 * サムネイルは接頭辞を置き換えて導出する。
 *
 * ※ 'use server' のファイルは非同期関数しか export できないため、
 *    これらの同期ヘルパはこちらに分離している。
 */

export const BUCKET = 'facility-photos';

export const DETAIL_MAX = 1200;
export const THUMB_MAX = 400;

export function thumbPathOf(storagePath: string): string {
  return storagePath.replace(/^photos\//, 'thumbs/');
}

export function publicUrlOf(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

export function thumbUrlOf(storagePath: string): string {
  return publicUrlOf(thumbPathOf(storagePath));
}
