'use server';

import { revalidatePath } from 'next/cache';
import sharp from 'sharp';

import { requireStaff } from '@/lib/auth';
import { BUCKET, DETAIL_MAX, THUMB_MAX, thumbPathOf } from '@/lib/photos';
import { createClient } from '@/lib/supabase/server';
import type { PhotoKind } from '@/lib/supabase/database.types';
import type { ActionState } from './facilities';

export async function uploadPhoto(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const facilityId = formData.get('facility_id');
  const entryPointId = formData.get('entry_point_id');
  const kind = formData.get('kind');
  const caption = formData.get('caption');
  const file = formData.get('file');

  if (typeof facilityId !== 'string') return { message: '施設が特定できませんでした' };
  if (!(file instanceof File) || file.size === 0) {
    return { errors: { file: '画像ファイルを選択してください' } };
  }
  if (!file.type.startsWith('image/')) {
    return { errors: { file: '画像ファイルを選択してください（JPEG / PNG / WebP）' } };
  }

  const supabase = await createClient();

  const { data: facility } = await supabase
    .from('facilities')
    .select('code')
    .eq('id', facilityId)
    .single();

  if (!facility) return { message: '施設が見つかりませんでした' };

  let detail: Buffer;
  let thumb: Buffer;
  let width: number | null = null;
  let height: number | null = null;

  try {
    const input = Buffer.from(await file.arrayBuffer());

    // rotate() で EXIF の向きを反映する。
    // スマートフォンの写真は横向きに撮っても縦のまま保存されることがあり、
    // これを入れないと管理画面とアプリで上下が逆になる。
    const base = sharp(input).rotate();

    const detailImage = base.clone().resize({
      width: DETAIL_MAX,
      height: DETAIL_MAX,
      fit: 'inside',
      withoutEnlargement: true,
    });

    const detailResult = await detailImage.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    detail = detailResult.data;
    width = detailResult.info.width;
    height = detailResult.info.height;

    thumb = await base
      .clone()
      .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
  } catch {
    return { errors: { file: '画像を読み込めませんでした。別のファイルでお試しください。' } };
  }

  const stamp = Date.now();
  const kindValue = (typeof kind === 'string' ? kind : 'other') as PhotoKind;
  const detailPath = `photos/${facility.code}/${kindValue}_${stamp}.webp`;

  const options = { contentType: 'image/webp', upsert: false };

  const uploadDetail = await supabase.storage.from(BUCKET).upload(detailPath, detail, options);
  if (uploadDetail.error) {
    return { message: `アップロードに失敗しました: ${uploadDetail.error.message}` };
  }

  const uploadThumb = await supabase.storage
    .from(BUCKET)
    .upload(thumbPathOf(detailPath), thumb, options);
  if (uploadThumb.error) {
    // 詳細版だけ残ると容量を無駄にするため、片方が失敗したら巻き戻す
    await supabase.storage.from(BUCKET).remove([detailPath]);
    return { message: `アップロードに失敗しました: ${uploadThumb.error.message}` };
  }

  const { error } = await supabase.from('photos').insert({
    facility_id: entryPointId ? null : facilityId,
    entry_point_id: typeof entryPointId === 'string' && entryPointId ? entryPointId : null,
    kind: kindValue,
    storage_path: detailPath,
    width,
    height,
    caption: typeof caption === 'string' && caption.trim() ? caption.trim() : null,
    is_placeholder: false,
  });

  if (error) {
    await supabase.storage.from(BUCKET).remove([detailPath, thumbPathOf(detailPath)]);
    if (error.code === '23505') {
      return { message: '進入案内図は1つの入口につき1枚までです。既存の案内図を削除してから追加してください。' };
    }
    return { message: `登録に失敗しました: ${error.message}` };
  }

  revalidatePath(`/facilities/${facilityId}`);
  revalidatePath('/');
  return { ok: true, message: '写真を追加しました。' };
}

export async function deletePhoto(formData: FormData): Promise<void> {
  await requireStaff();

  const id = formData.get('id');
  const facilityId = formData.get('facility_id');
  if (typeof id !== 'string' || typeof facilityId !== 'string') return;

  const supabase = await createClient();

  const { data: photo } = await supabase
    .from('photos')
    .select('storage_path')
    .eq('id', id)
    .single();

  await supabase.from('photos').delete().eq('id', id);

  if (photo) {
    await supabase.storage
      .from(BUCKET)
      .remove([photo.storage_path, thumbPathOf(photo.storage_path)]);
  }

  revalidatePath(`/facilities/${facilityId}`);
  revalidatePath('/');
}
