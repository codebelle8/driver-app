'use server';

import { revalidatePath } from 'next/cache';
import sharp from 'sharp';

import { requireStaff } from '@/lib/auth';
import { BUCKET, DETAIL_MAX, THUMB_MAX, thumbPathOf } from '@/lib/photos';
import { createClient } from '@/lib/supabase/server';
import type { PhotoKind } from '@/lib/supabase/database.types';
import { pickIds } from '@/lib/validation';
import type { ActionState } from './facilities';

/**
 * 画像を詳細版と一覧版の2つに変換する。
 *
 * 追加と差し替えで同じ処理が要るため、切り出してある。
 * ここで失敗した場合は、保存にもデータベースにも一切触れていない状態で返す。
 */
async function processImage(file: File) {
  // rotate() で EXIF の向きを反映する。
  // スマートフォンの写真は横向きに撮っても縦のまま保存されることがあり、
  // これを入れないと管理画面とアプリで上下が逆になる。
  const base = sharp(Buffer.from(await file.arrayBuffer())).rotate();

  const detailResult = await base
    .clone()
    .resize({ width: DETAIL_MAX, height: DETAIL_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const thumb = await base
    .clone()
    .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();

  return {
    detail: detailResult.data,
    thumb,
    width: detailResult.info.width,
    height: detailResult.info.height,
  };
}

/**
 * 保存領域から画像の実体を消す。
 *
 * **消えたかどうかを必ず確かめる。**
 *   Storage の削除は、権限が無くても HTTP 200 と空配列を返す。
 *   戻り値を見ないと「消したつもり」で通過し、参照されないファイルだけが
 *   際限なく積み上がる。150施設ぶんの差し替えでは容量に直結する。
 *
 * 呼ぶ側は、対応する行の削除・更新が成功したことを先に確かめておくこと。
 * 行が残ったままファイルだけ消すと、一覧に出るのに開けない写真になる。
 */
async function removeFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storagePath: string,
): Promise<{ ok: boolean; reason?: string }> {
  const paths = [storagePath, thumbPathOf(storagePath)];
  const { data, error } = await supabase.storage.from(BUCKET).remove(paths);

  if (error) return { ok: false, reason: error.message };
  if (!data || data.length === 0) {
    return {
      ok: false,
      reason: '保存領域の削除権限がありません（storage.objects の削除ポリシーをご確認ください）',
    };
  }
  return { ok: true };
}

/**
 * ここへ届く大きさの上限（next.config.ts と合わせる）。
 *
 * 超えるとサーバーが受け取る前に切れるため、本来ここまで来ない。
 * それでも書いておくのは、**理由を日本語で返せる最後の場所**だから。
 */
const MAX_BYTES = 4 * 1024 * 1024;

/** 受け取ったものが画像として扱えるか */
function checkFile(file: FormDataEntryValue | null): string | null {
  if (!(file instanceof File) || file.size === 0) return '画像ファイルを選択してください';
  if (!file.type.startsWith('image/')) {
    return '画像ファイルを選択してください（JPEG / PNG / WebP）';
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `写真が大きすぎます（${mb}MB）。4MB までにしてください`;
  }
  return null;
}

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
  const fileError = checkFile(file);
  if (fileError) return { errors: { file: fileError }, message: fileError };

  const supabase = await createClient();

  const { data: facility } = await supabase
    .from('facilities')
    .select('code')
    .eq('id', facilityId)
    .single();

  if (!facility) return { message: '施設が見つかりませんでした' };

  let detail: Buffer;
  let thumb: Buffer;
  let width: number;
  let height: number;

  try {
    ({ detail, thumb, width, height } = await processImage(file as File));
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

  /*
    並びの最後に置く。

    列の既定値は 0 のため、採番しないと追加した写真がすべて 0 になり、
    並べ替えても順序が定まらなくなる。
  */
  const owner =
    typeof entryPointId === 'string' && entryPointId
      ? { column: 'entry_point_id' as const, value: entryPointId }
      : { column: 'facility_id' as const, value: facilityId };

  const { data: last } = await supabase
    .from('photos')
    .select('sort_order')
    .eq(owner.column, owner.value)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('photos').insert({
    sort_order: (last?.sort_order ?? -1) + 1,
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

/**
 * 写真の順番を1つ動かす。
 *
 * ドライバーは上から順に見るため、並び順は「手前の目印 → 進入路 → 車寄せ」
 * のように現地で目にする順であってほしい。登録した順とは限らない。
 *
 * 隣と番号を入れ替える方式にしている。全体を振り直すより書き込みが2件で済み、
 * 途中で失敗しても並びが壊れない。
 */
export async function movePhoto(formData: FormData): Promise<void> {
  await requireStaff();

  const id = formData.get('id');
  const facilityId = formData.get('facility_id');
  const direction = formData.get('direction');
  if (typeof id !== 'string' || typeof facilityId !== 'string') return;
  if (direction !== 'up' && direction !== 'down') return;

  const supabase = await createClient();

  const { data: photo } = await supabase
    .from('photos')
    .select('id, sort_order, entry_point_id, facility_id')
    .eq('id', id)
    .single();
  if (!photo) return;

  // 同じ入口（入口に紐づかないものは同じ施設）の中だけで入れ替える
  const column = photo.entry_point_id ? 'entry_point_id' : 'facility_id';
  const value = photo.entry_point_id ?? photo.facility_id;
  if (!value) return;

  const { data: neighbours } = await supabase
    .from('photos')
    .select('id, sort_order')
    .eq(column, value)
    .order('sort_order')
    .order('id');
  if (!neighbours) return;

  const at = neighbours.findIndex((n) => n.id === photo.id);
  const to = direction === 'up' ? at - 1 : at + 1;
  // 端では動かせない。押せないようにもしているが、二重に守る。
  if (at < 0 || to < 0 || to >= neighbours.length) return;

  const other = neighbours[to];

  /*
    番号が同じだと入れ替えても並びが変わらない。
    取り込み時の値がすべて 0 の施設もあり得るため、
    ここで並び全体を 0 から振り直してから入れ替える。
  */
  const renumbered = neighbours.map((n, i) => ({ id: n.id, sort_order: i }));
  const needsRenumber = neighbours.some((n, i) => n.sort_order !== i);
  if (needsRenumber) {
    for (const r of renumbered) {
      await supabase.from('photos').update({ sort_order: r.sort_order }).eq('id', r.id);
    }
  }

  await supabase.from('photos').update({ sort_order: to }).eq('id', photo.id);
  await supabase.from('photos').update({ sort_order: at }).eq('id', other.id);

  revalidatePath(`/facilities/${facilityId}`);
  revalidatePath('/');
}

/**
 * 写真の画像だけを入れ替える。
 *
 * 種別・説明・順番・並びの位置はそのまま引き継ぐ。
 * 削除して登録し直すと、これらを毎回付け直すことになり、
 * 150施設ぶんの仮画像を実写真へ置き換える作業が現実的でなくなる。
 *
 * 仮画像の印は外す。実写真に入れ替わった時点で仮ではなくなるため。
 */
export async function replacePhoto(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();

  const id = formData.get('id');
  const facilityId = formData.get('facility_id');
  const file = formData.get('file');

  if (typeof id !== 'string' || typeof facilityId !== 'string') {
    return { message: '写真が特定できませんでした' };
  }
  const fileError = checkFile(file);
  if (fileError) return { errors: { file: fileError }, message: fileError };

  const supabase = await createClient();

  const { data: photo } = await supabase
    .from('photos')
    .select('storage_path, kind')
    .eq('id', id)
    .single();
  if (!photo) return { message: '写真が見つかりませんでした' };

  const { data: facility } = await supabase
    .from('facilities')
    .select('code')
    .eq('id', facilityId)
    .single();
  if (!facility) return { message: '施設が見つかりませんでした' };

  let detail: Buffer;
  let thumb: Buffer;
  let width: number;
  let height: number;

  try {
    ({ detail, thumb, width, height } = await processImage(file as File));
  } catch {
    return { errors: { file: '画像を読み込めませんでした。別のファイルでお試しください。' } };
  }

  /*
    元のパスへ上書きせず、新しいパスへ置く。

    同じパスへ上書きすると、閲覧側や CDN に残った古い画像が
    しばらく表示され続ける。差し替えたのに変わらない、という状態になる。
  */
  const newPath = `photos/${facility.code}/${photo.kind}_${Date.now()}.webp`;
  const options = { contentType: 'image/webp', upsert: false };

  const putDetail = await supabase.storage.from(BUCKET).upload(newPath, detail, options);
  if (putDetail.error) {
    return { message: `差し替えに失敗しました: ${putDetail.error.message}` };
  }

  const putThumb = await supabase.storage
    .from(BUCKET)
    .upload(thumbPathOf(newPath), thumb, options);
  if (putThumb.error) {
    await supabase.storage.from(BUCKET).remove([newPath]);
    return { message: `差し替えに失敗しました: ${putThumb.error.message}` };
  }

  const { error } = await supabase
    .from('photos')
    .update({ storage_path: newPath, width, height, is_placeholder: false })
    .eq('id', id);

  if (error) {
    // 記録できなければ、置いたばかりの画像は残さない
    await supabase.storage.from(BUCKET).remove([newPath, thumbPathOf(newPath)]);
    return { message: `差し替えに失敗しました: ${error.message}` };
  }

  // 記録が新しい画像へ移ったあとに、古い画像を消す。
  // 先に消すと、記録の更新が失敗したときに画像だけ無くなる。
  const cleaned = await removeFiles(supabase, photo.storage_path);

  revalidatePath(`/facilities/${facilityId}`);
  revalidatePath('/');

  // 差し替え自体は成立している。消し残りは伝えるだけにとどめ、
  // 作業を止めない。
  return cleaned.ok
    ? { ok: true, message: '写真を差し替えました。' }
    : { ok: true, message: `写真を差し替えました。ただし古い画像が残りました: ${cleaned.reason}` };
}

/**
 * 写真を消す。1件でも、選んだぶんをまとめてでも。
 *
 * getAll で受けているのは、まとめて消すときに同じ名前の隠し入力を
 * 選んだ数だけ並べるため。1件のときは要素が1つの配列になるだけで、
 * 経路は変わらない。
 */
export async function deletePhoto(formData: FormData): Promise<void> {
  await requireStaff();

  const ids = pickIds(formData);
  const facilityId = formData.get('facility_id');
  if (ids.length === 0 || typeof facilityId !== 'string') return;

  const supabase = await createClient();

  /*
    行が消えたことを確かめてからファイルを消す。

    delete() は、権限が無くて1行も消えなかった場合もエラーにならない。
    確かめずにファイルを消すと、一覧には残るのに開けない写真ができる。
    調査員は公開済みの写真を消せないため、これは実際に起こり得る。

    まとめて消す場合も同じで、消せた行だけがここへ返る。
    選んだ数ではなく返ってきた行を辿ることで、消せなかったぶんの
    ファイルまで巻き添えにしない。
  */
  const { data: deleted } = await supabase
    .from('photos')
    .delete()
    .in('id', ids)
    .select('storage_path');

  for (const row of deleted ?? []) {
    await removeFiles(supabase, row.storage_path);
  }

  revalidatePath(`/facilities/${facilityId}`);
  revalidatePath('/');
}
