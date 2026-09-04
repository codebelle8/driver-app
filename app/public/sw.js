/*
  オフラインで動かすための常駐処理。

  **なぜ要るか**
    このアプリが使われるのは地下駐車場や高架下で、目的地に近づくほど
    電波が悪くなる。到着直前に「読み込み中」で止まっては意味がない。
    アプリ本体を端末に控え、通信できなくても開けるようにする。

    施設のデータそのものは端末のデータベース (SQLite) に入っており、
    ここで扱うのはアプリの本体（HTML・JS・画像・フォント）にあたる。

  **控え方を2通りに分けている**
    アプリ本体   … 先に控えを返し、裏で新しいものを取りに行く
                   （毎回問い合わせると、電波の悪い場所で待たされる）
    地図のタイル … 一度取ったものを控え、同じ場所は取りに行かない
    それ以外     … 通信を試し、駄目なら控えを返す

  **Supabase への問い合わせは控えない**
    施設の内容は変わる。古い内容を返すと、閉鎖された入口へ
    案内してしまう。通信できないときは、端末のデータベースの
    内容で動く作りになっている。
*/

const VERSION = 'v3';
const SHELL = `kurumayose-shell-${VERSION}`;
const TILES = `kurumayose-tiles-${VERSION}`;
const RUNTIME = `kurumayose-runtime-${VERSION}`;

/** 最初から控えておくもの。これだけで画面が出る。 */
const PRECACHE = ['/', '/manifest.webmanifest'];

/** 地図のタイル。控えの上限を決め、際限なく貯めない。 */
const TILE_HOSTS = ['cyberjapandata.gsi.go.jp'];
const TILE_LIMIT = 400;

/**
 * 画面の本体を待つ上限（ミリ秒）。
 *
 * これを過ぎたら控えへ切り替える。地下駐車場や高架下で
 * 開かれることを考えると、長く待たせるほうが害になる。
 */
const NAVIGATE_TIMEOUT = 2500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      // 1つでも取れないと全部が失敗する。取れたぶんで進める。
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith('kurumayose-') && !n.endsWith(VERSION))
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** 控えが増えすぎないよう、古いものから捨てる */
async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  for (const key of keys.slice(0, keys.length - limit)) {
    await cache.delete(key);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  /*
    範囲要求には手を出さない。

    動画は「先頭の数十キロだけ」「続きだけ」と分けて読まれる (Range)。
    控えた全体を返すと、求められた範囲と食い違って再生できない。
    ブラウザに任せる。
  */
  if (request.headers.has('range')) return;

  const url = new URL(request.url);

  // Supabase は控えない。古い案内を返さないため。
  if (url.hostname.endsWith('.supabase.co')) return;

  // 地図のタイル。一度取ったものはそのまま使う。
  if (TILE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(TILES).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const res = await fetch(request);
          if (res.ok) {
            await cache.put(request, res.clone());
            void trim(TILES, TILE_LIMIT);
          }
          return res;
        } catch {
          // 取れなければ地図が出ないだけ。画面は成り立つ。
          return new Response('', { status: 504 });
        }
      }),
    );
    return;
  }

  /*
    画面の移動。通信できるときは新しいほうを返す。

    **なぜ控えを先に返さないか**
      以前は控えた本体を先に返し、裏で新しくしていた。そのため
      配備しても、次にもう一度開くまで古い画面が出ていた。
      実際、上部の写真を4枚の入れ替えにした後も、古い1枚のままに
      見える状態になっていた。

      本体（index.html）は数KBで、待っても一瞬にしかならない。
      中の JS や画像は名前に版が入っており、新しい本体さえ届けば
      正しいものを読みに行く。

    **待ちすぎない**
      電波の悪い場所では、応答が来ないまま何秒も止まりうる。
      NAVIGATE_TIMEOUT で見切りをつけ、控えへ切り替える。
      控えが無ければ通信の結果をそのまま待つ。
  */
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match('/');

        const fresh = fetch(request)
          .then((res) => {
            if (res.ok) void cache.put('/', res.clone());
            return res;
          })
          .catch(() => null);

        // 控えがあるときだけ、見切りをつけて切り替える
        const raced = hit
          ? await Promise.race([
              fresh,
              new Promise((r) => setTimeout(() => r(null), NAVIGATE_TIMEOUT)),
            ])
          : await fresh;

        return raced ?? hit ?? new Response('', { status: 504 });
      }),
    );
    return;
  }

  /*
    動画は控えない。

    大きく、範囲要求で読まれるため、控えても正しく返せない。
    アプリ本体とは違い、無くても画面は成り立つ。
  */
  if (url.pathname.endsWith('.mp4')) return;

  // 同じ場所から配る資材（JS・画像・フォント）
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) {
          // 控えを返しつつ、裏で新しくしておく
          void fetch(request)
            .then((res) => {
              if (res.ok) void cache.put(request, res.clone());
            })
            .catch(() => undefined);
          return hit;
        }
        try {
          const res = await fetch(request);
          if (res.ok) await cache.put(request, res.clone());
          return res;
        } catch {
          return new Response('', { status: 504 });
        }
      }),
    );
  }
});
