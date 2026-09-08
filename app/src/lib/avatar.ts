/**
 * 顔写真の選び取りと、送る前の縮小。
 *
 * **なぜ縮めるか**
 *   いまの携帯で撮った写真は1枚 3〜8MB ある。上部の帯に 28px で出す
 *   ためにそれを預かるのは、置き場所も通信も無駄になる。
 *   256px の四角にしてから送る。
 *
 * **真ん中で切る**
 *   縦長の写真をそのまま丸へ入れると、顔が外れて肩だけが映る。
 *   短いほうの辺に合わせ、中央を正方形に切る。
 *
 * **ブラウザだけ**
 *   端末側（Expo Go・APK）で写真を選ぶには、新しい部品の追加と
 *   作り直しが要る。この製品は PWA として配っており（docs/08-distribution.md）、
 *   まずブラウザで動く形にしている。端末側では変更の欄を出さない。
 */
import { Platform } from 'react-native';

/** 送るときの一辺（px）。丸で 28〜96px に出すので、これで足りる。 */
const SIDE = 256;

/** 画質。顔写真なので 0.85 で十分。 */
const QUALITY = 0.85;

/** この端末で顔写真を選べるか */
export function canPickAvatar(): boolean {
  return Platform.OS === 'web' && typeof document !== 'undefined';
}

/**
 * 写真を選んでもらい、正方形に縮めて返す。
 *
 * 選ばずに閉じた場合は null。
 */
export async function pickAvatar(): Promise<Blob | null> {
  if (!canPickAvatar()) return null;

  const file = await chooseFile();
  if (!file) return null;

  return await squareResize(file);
}

/** ファイルを選ぶ枠を出す */
function chooseFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.style.display = 'none';

    /*
      閉じたことを知る手立てが無い。

      キャンセルしても change は起きない。入力欄を残したままにすると
      次に選ぶときに二重になるため、window へ戻ってきた時点で片付ける。
    */
    const done = (value: File | null) => {
      input.remove();
      resolve(value);
    };

    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    window.addEventListener('focus', () => setTimeout(() => done(null), 500), { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

/** 中央を正方形に切って、SIDE px へ縮める */
function squareResize(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;

      const canvas = document.createElement('canvas');
      canvas.width = SIDE;
      canvas.height = SIDE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);

      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIDE, SIDE);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', QUALITY);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}
