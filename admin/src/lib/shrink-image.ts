/**
 * 送る前に、ブラウザの中で写真を縮める。
 *
 * **なぜ要るか**
 *   管理画面の保存はサーバー側の仕組み（Server Action）で受けている。
 *   **受け取れる大きさに上限があり、超えると「An unexpected response
 *   was received from the server」とだけ出て終わる。** 何が悪いのか
 *   分からない。実際に11MBの写真で再現した（ご報告 2026-09-14）。
 *
 *   いまのスマートフォンの写真は 3〜12MB ある。**現地で撮った写真を
 *   そのまま貼れないのでは、この画面の意味がない。**
 *
 *   上限を上げる手もあるが、配信側（Vercel）にも別の上限があり、
 *   根本は解決しない。**送る前に縮める。**
 *
 * **画質は落とさない**
 *   アプリに出すときも長辺1600pxまで縮めている（actions/photos.ts）。
 *   ここで2000pxまで落としても、最終的な見え方は変わらない。
 *   11MB が 0.5MB 前後になり、現地の電波でも送れるようになる。
 *
 * **縮められなかったら、そのまま送る**
 *   ブラウザが読めない形式（HEIC など）では canvas に描けない。
 *   その場合は元のまま送り、サーバー側の言い分を出す。黙って
 *   握りつぶさない。
 */

/** 長辺の上限。アプリ側は1600pxまで縮めるため、これで足りる。 */
const MAX_EDGE = 2000;

/** これより小さければ、そのまま送る。縮める意味がない。 */
const SKIP_UNDER = 1024 * 1024;

/** 縮めたあとの画質。写真の細部（看板の文字）が潰れない範囲。 */
const QUALITY = 0.82;

export async function shrinkImage(file: File): Promise<File> {
  if (file.size <= SKIP_UNDER) return file;
  if (!file.type.startsWith('image/')) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const long = Math.max(bitmap.width, bitmap.height);
    const scale = long > MAX_EDGE ? MAX_EDGE / long : 1;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', QUALITY);
    });
    if (!blob || blob.size >= file.size) return file;

    /*
      拡張子も合わせる。中身は JPEG になっているため、元が .png のまま
      だと、あとで見た人が形式を取り違える。
    */
    const base = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    // 読めない形式。元のまま送り、サーバー側の言い分に任せる。
    return file;
  }
}
