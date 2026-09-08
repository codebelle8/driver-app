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
 *
 * **選ばれなかったのか、読めなかったのかを分ける**
 *   閉じただけなら黙って戻る。読めなかったのなら伝える。
 *   どちらも「何も起きない」にすると、壊れているのか自分が閉じたのかを
 *   利用者が判じることになる。
 */
import { Platform } from 'react-native';

/** 送るときの一辺（px）。丸で 28〜96px に出すので、これで足りる。 */
const SIDE = 256;

/** 画質。顔写真なので 0.85 で十分。 */
const QUALITY = 0.85;

/**
 * 窓へ戻ってきてから、選ばれた中身を見に行くまでの間。
 *
 * **短くしてはいけない。**
 *   ブラウザは「窓へ戻る（focus）」を先に出し、「選ばれた（change）」を
 *   後から出す。以前ここを 500ms にしていたところ、間に合わないうちに
 *   入力欄ごと片付けてしまい、**写真を選んでも何も起きなかった。**
 *
 *   待つあいだに何も起きなければ、そのとき入力欄に入っているものを
 *   見て決める。change を待たずに済むので、遅れても取りこぼさない。
 */
const AFTER_FOCUS_MS = 2500;

/** 顔写真を選んだ結果 */
export type Picked =
  | { ok: true; blob: Blob }
  /** 閉じただけ。何も言わない。 */
  | { ok: false; reason: 'cancelled' }
  /** 選ばれたが、画像として読めなかった。 */
  | { ok: false; reason: 'unreadable' };

/** この端末で顔写真を選べるか */
export function canPickAvatar(): boolean {
  return Platform.OS === 'web' && typeof document !== 'undefined';
}

/** 写真を選んでもらい、正方形に縮めて返す。 */
export async function pickAvatar(): Promise<Picked> {
  if (!canPickAvatar()) return { ok: false, reason: 'cancelled' };

  const file = await chooseFile();
  if (!file) return { ok: false, reason: 'cancelled' };

  const blob = await squareResize(file);
  if (!blob) return { ok: false, reason: 'unreadable' };
  return { ok: true, blob };
}

/** ファイルを選ぶ枠を出す */
function chooseFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';

    /*
      画面の外へ置く。display:none にすると、一部のブラウザで
      click() が黙って無視される。
    */
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    input.style.opacity = '0';

    let settled = false;
    const finish = (value: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };

    input.addEventListener('change', () => finish(input.files?.[0] ?? null));

    /* 閉じただけのとき。出さないブラウザもあるので、下の見張りも置く。 */
    input.addEventListener('cancel', () => finish(null));

    /*
      窓へ戻ってきたあとの見張り。

      閉じたことを知らせない古いブラウザのために置いている。
      **すぐには決めない。** 選ばれた中身が届くのは窓へ戻った後で、
      急いで片付けると、選んだ写真を捨てることになる。
      間を置いたうえで、そのとき入っているものを見て決める。
    */
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          const picked = input.files && input.files.length > 0 ? input.files[0] : null;
          finish(picked);
        }, AFTER_FOCUS_MS);
      },
      { once: true },
    );

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
