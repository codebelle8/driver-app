/**
 * 端末の現在地を、人が読める地名にする。
 *
 * **なぜ地名だけか**
 *   ドライバーが知りたいのは「いま自分がどのあたりか」であって、
 *   緯度経度ではない。座標は画面に出さない。
 *
 * **断られたときに何もしない理由**
 *   位置を許可しなくても、施設は名前と住所で探せる。
 *   位置は案内の足しにはなるが、なければ使えないという作りにはしない。
 *   そのため、断られたら黙って諦め、案内できる範囲の表示に戻す。
 *
 * **座標の行き先**
 *   端末の外へは出さない。地名への変換は端末自身に行わせる。
 */
import { Platform } from 'react-native';

/**
 * 位置情報の仕組みは、必要になった時点で読み込む。
 *
 * 先頭で読み込むと、この仕組みが使えない環境ではアプリ全体が
 * 起動しなくなる。現在地は「あれば助かる」ものであって、
 * 施設を探せなくしてまで先に読む理由がない。
 */
type LocationModule = typeof import('expo-location');

async function loadLocation(): Promise<LocationModule | null> {
  try {
    return (await import('expo-location')) as LocationModule;
  } catch {
    return null;
  }
}

/**
 * 現在地を取り直すまでの間隔。
 *
 * 走行中でも、区や町の名前はそう頻繁には変わらない。
 * 短くすると測位を繰り返すぶん電池を使う。
 */
const FRESH_MS = 60_000;

/** 測位に待てる上限。これを過ぎたら諦める。 */
const TIMEOUT_MS = 8_000;

let cached: { at: number; name: string | null } | null = null;

/**
 * 現在地の地名。取れなければ null。
 *
 * 呼ぶ側は null を「出さない」と解釈すればよく、
 * 許可・圏外・国外のどれで失敗したかを気にしなくてよい。
 */
export async function describePlace(): Promise<string | null> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.name;

  const name = await resolve();
  cached = { at: Date.now(), name };
  return name;
}

async function resolve(): Promise<string | null> {
  try {
    const Location = await loadLocation();
    if (!Location) return null;

    const granted = await ensurePermission(Location);
    if (!granted) return null;

    const at = await locate(Location);
    if (!at) return null;

    return await toPlaceName(Location, at.coords.latitude, at.coords.longitude);
  } catch {
    // 現在地は「あれば助かる」もので、失敗しても画面は成り立つ。
    return null;
  }
}

async function ensurePermission(Location: LocationModule): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  // 一度断られ、二度と聞くなと言われている場合は尋ねない。
  if (!current.canAskAgain) return false;

  const asked = await Location.requestForegroundPermissionsAsync();
  return asked.granted;
}

/**
 * 測位。
 *
 * 直前の位置が残っていればそれを使う。
 * 起動のたびに測り直すと、画面が出るまで数秒待たせることになる。
 */
async function locate(
  Location: LocationModule,
): Promise<Awaited<ReturnType<LocationModule["getCurrentPositionAsync"]>> | null> {
  const last = await Location.getLastKnownPositionAsync({ maxAge: FRESH_MS });
  if (last) return last;

  return withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    TIMEOUT_MS,
  );
}

/**
 * 座標を地名にする。
 *
 * 端末（iOS / Android）では端末自身の変換だけを使い、座標を外へ出さない。
 * 変換できなければ地名を出さない。地名は無くても困らないのに対し、
 * 現在地を他所へ渡すのは、断りなく行ってよいことではない。
 *
 * web には端末側の変換が無いため、国土地理院へ問い合わせる。
 * こちらは動作確認用で、配布するアプリの経路ではない。
 */
async function toPlaceName(
  Location: LocationModule,
  lat: number,
  lon: number,
): Promise<string | null> {
  if (Platform.OS === 'web') return await fromGsi(lat, lon);

  const [hit] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
  return hit ? format(hit) : null;
}

/**
 * 端末が返す住所から、短い地名を組み立てる。
 *
 * 端末によって、どの欄に何が入るかが揃わない。
 * 「千代田区」が city のことも subregion のこともある。
 * そのため欄の名前ではなく、市区町村・町名の順に拾えたものを使う。
 */
function format(a: {
  city: string | null;
  subregion: string | null;
  district: string | null;
  street: string | null;
  region: string | null;
  name: string | null;
}): string | null {
  const ward = a.city ?? a.subregion ?? null;
  const town = a.district ?? a.street ?? null;

  const parts = [ward, town].filter((x): x is string => Boolean(x));
  // 「千代田区千代田区」のような重なりを避ける
  const uniq = parts.filter((x, i) => parts.indexOf(x) === i);
  if (uniq.length > 0) return uniq.join('');

  return a.region ?? a.name ?? null;
}

/**
 * 国土地理院の逆ジオコーダ。
 *
 * 鍵も契約も要らず、日本国内なら町丁目まで返る。
 * 端末側の変換が使えない場合（web）と、取れなかった場合の控えに使う。
 */
async function fromGsi(lat: number, lon: number): Promise<string | null> {
  const url =
    'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress' +
    `?lat=${lat}&lon=${lon}`;

  const res = await withTimeout(fetch(url), TIMEOUT_MS);
  if (!res || !res.ok) return null;

  const data = (await res.json()) as { results?: { lv01Nm?: string } };
  const name = data.results?.lv01Nm;
  // 国外だと「－」が返る
  return name && name !== '－' ? name : null;
}

/** 応答が返らない相手を、いつまでも待たない */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    work,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
