/*
 * 車寄せナビ 紹介サイト
 *
 * **動きは、発注元ご指定の参考サイト（四條畷学園 100周年）に倣っている。**
 * 参考サイトは GSAP・ScrollTrigger・Lenis で組まれているため、同じ部品を
 * 使い、動きの値（距離・速さ・ずらし方）もそこから写している。
 *
 *   参考サイト                          このサイト
 *   ─────────────────────────────────  ─────────────────────────────────
 *   標語だけが出て、ロゴが組み上がる      開くとすぐ、標語 → 目印 → 文字 → 目印が散る
 *   下へ送ると、ロゴの文字がぼやけて消え、 同じ。目印（ピン）が離れて大きくなり、
 *   丸い図柄が離れて MESSAGE の絵になる   「車寄せナビとは」のアプリのアイコンになる
 *   MESSAGE の巨大な英字が大きくなる       ENTRANCE・COVERAGE
 *   見出しが1文字ずつ下から浮かぶ          同じ（20px・1秒・Power4）。上へ戻しても出る
 *   塊が左から順に出る（0.3秒ずつ）        同じ。ほかの塊も、下からふわっと出る
 *   標語が傾いて、判を押すように出る       締めの「次の送迎から、迷わない。」
 *   葉が奥行きごとに違う速さで動く         目印が同じように動く
 *   フッターへ左右から葉が飛んでくる       目印が同じように飛んでくる
 *   下へ送るとヘッダーが隠れ、戻すと出る   同じ
 *   なめらかな送り（Lenis）               同じ
 *   先頭へ戻る丸い釦                       UP（右下に浮かべる）
 *
 * **ご指示（2026-09-20）で足した動き**（参考サイトには無いもの）
 *
 *   カーソル       地図の目印を上下に返した形。先（上）が押す位置（styles.css）
 *   押したとき     押した位置から、赤い輪が3つ広がる
 *   実例の端末     見えたら、アプリの立ち上がりの動画を流し、終わったら画面を見せる
 *                  （開いたときに全画面で流すのはやめた）
 *   標語           文字が両脇から回り込み、3秒とどまって引っ込む。くり返す
 *   問いかけ       1文字ずつ打ち込む
 *   ほかの文       1行ずつ、下からせり上がる（上へ戻しても出る）
 *   緑の帯の縁     海の波のように揺れる（styles.css の .sea）
 *   見出し・数字   下へ送ると弾み、踏みしめた足もとから目印が砂ぼこりのように舞う
 *
 * **端末の「動きを減らす」設定には、いまは従わない**（FOLLOW_REDUCED_MOTION）。
 */

/**
 * アプリの住所。**ここを1か所直せば、すべての「アプリを開く」が追従する。**
 *
 * いまは試験提供の住所。本番の住所に移るときは、ここだけを差し替える。
 */
const APP_URL = 'https://app.kurumayosenavi.com/';

/**
 * 施設数を読む先（ご指示 2026-10-30「自動で読み込む形に」）。アプリと同じデータベース。
 * 鍵はログイン前の鍵（アプリの中にも入っている公開の鍵）で、読めるのは公開中の
 * 施設だけ。アプリの「案内できる範囲」と同じ数になる（下書きは数えない）。
 */
const FACILITY_API = 'https://uiesfsdzpwzfbtknpckj.supabase.co/rest/v1/facilities?select=id&status=eq.published';
const PUBLIC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpZXNmc2R6cHd6ZmJ0a25wY2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDQyNjQsImV4cCI6MjEwMTY4MDI2NH0.wKDLi43-Oa-WPQVx2P_FXyPtfXP_HcWR7sTFT6m8PI8';

/**
 * 立ち上がりの動画。**アプリと同じ3本を、同じ順に流す。**
 * 「車寄せナビとは」の実例の端末の中で流す（ご指示 2026-09-20）。
 * 以前は開いたときに全画面で流していた（2026-09-19〜20）。
 */
const FILMS = ['assets/intro/1.mp4', 'assets/intro/2.mp4', 'assets/intro/3.mp4'];

/** 動画のあとに、ロゴだけを見せる時間。アプリと同じ2秒 */
const LOGO_MS = 2000;

/**
 * 動画が進まなくなったとき、諦めるまでの時間。
 * 電波の弱い場所で開かれると、読み込みの途中で止まることがある。
 * 真っ暗な画面のまま待たせない。
 */
const STALL_MS = 8000;

/**
 * 端末の「動きを減らす」設定に従うか。
 *
 * **いまは従わない（false）。** 参考サイトは、この設定にかかわらず動く。
 * また Windows で「アニメーションを表示する」を切ったパソコンもこの設定に
 * 当たり、従うと、そのパソコンでは動きをひとつも確かめられない
 * （2026-09-20、確認に使っているパソコンがそうだった）。
 *
 * true にすると、この設定の方には大きな動き（動画・目印が飛ぶ・視差・
 * ぼかし・判を押す・なめらかな送り・標語の回転・打ち込み・波・見出しの
 * 弾み）を出さず、塊と行は位置を動かさず濃さだけで出す（styles.css の .calm）。
 *
 * 確かめる用に、住所の末尾に ?calm を付けると true と同じになる
 * （tools/test-site.mjs が使う）。
 */
const FOLLOW_REDUCED_MOTION = false;

const html = document.documentElement;
const wantsCalm = FOLLOW_REDUCED_MOTION || new URLSearchParams(location.search).has('calm');
const reduceMotion = wantsCalm && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduceMotion) html.classList.add('calm');
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** 動きを付けるか（GSAP の受け持つ分）。部品が読めなかったときも付けない */
const motion = !reduceMotion && Boolean(window.gsap && window.ScrollTrigger);
if (motion) {
  html.classList.add('motion');
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * ご指示（2026-09-20）の動き（標語・打ち込み・行・弾み・砂ぼこり）を付けるか。
 * GSAP を使わずブラウザの仕組み（Web Animations）で動かすため、部品が
 * 読めなくても動く。
 */
const canAnimate = 'IntersectionObserver' in window && typeof Element.prototype.animate === 'function';
const lively = canAnimate && !reduceMotion;

/** 送りの向き。1 = 下へ、-1 = 上へ。見出しは、下へ送ったときだけ弾ませる */
let scrollDir = 1;
{
  let y0 = window.scrollY;
  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY;
      if (y !== y0) scrollDir = y > y0 ? 1 : -1;
      y0 = y;
    },
    { passive: true },
  );
}

/* --- アプリの住所 ---------------------------------------------------------- */

for (const a of $$('a[data-app]')) {
  a.href = APP_URL;
}

/* --- 施設数 ---------------------------------------------------------------- */

/**
 * HTML には書いた時点の数を入れておき、読めたら差し替える。読めないとき
 * （通信が無い・止まっている）は、書いた数のまま。
 *
 * 見出しの数字は1文字ずつに分けない（splitChars）。分けると、差し替えたときに
 * 文字の動きから外れる。1行ずつ出す文（よくあるご質問）は、組み直しの元
 * （lineSource）も差し替える。幅が変わって組み直したときに、元の数へ戻らないように。
 */
function showFacilityCount(n) {
  const text = String(n);
  for (const el of $$('[data-facility-count]')) {
    const old = el.textContent;
    if (old === text) continue;
    el.textContent = text;
    /* 1文字ずつに分けた見出しには、読み上げ用の文が別にある */
    const read = el.closest('.split')?.querySelector(':scope > .visually-hidden');
    if (read) read.textContent = read.textContent.replace(old, text);
  }
  for (const [el, html] of lineSource) {
    lineSource.set(el, html.replace(/(<span[^>]*data-facility-count[^>]*>)[^<]*/g, `$1${text}`));
  }
}

async function loadFacilityCount() {
  const stop = new AbortController();
  const timer = window.setTimeout(() => stop.abort(), 8000);
  try {
    const res = await fetch(FACILITY_API, {
      method: 'HEAD',
      headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${PUBLIC_KEY}`, Prefer: 'count=exact' },
      signal: stop.signal,
    });
    const n = Number(res.headers.get('content-range')?.split('/')[1]);
    if (res.ok && Number.isInteger(n) && n > 0) showFacilityCount(n);
  } catch (e) {
    /* 読めなければ、書いた数のまま */
  } finally {
    window.clearTimeout(timer);
  }
}

loadFacilityCount();

/* --- なめらかな送り（参考サイトと同じ Lenis） -------------------------------- */

let lenis = null;
if (motion && window.Lenis) {
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/** ヘッダーの高さ。ページ内の移動で、見出しがヘッダーの下に隠れないように */
const HEADER = 76;

/** 参考サイトのページ内の移動と同じ（1秒・power2.inOut） */
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function scrollToTarget(target) {
  if (lenis) {
    lenis.scrollTo(target, { offset: target === 0 ? 0 : -HEADER, duration: 1.1, easing: easeInOut });
    return;
  }
  if (target === 0) {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  } else {
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }
}

/* ページ内のリンク。本文へ飛ぶ案内（skip-link）だけは、ブラウザに任せる */
document.addEventListener('click', (e) => {
  const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
  if (!a || a.classList.contains('skip-link')) return;
  const hash = a.getAttribute('href');
  if (hash.length < 2) return;
  const target = hash === '#top' ? 0 : document.getElementById(hash.slice(1));
  if (target === null) return;
  e.preventDefault();
  scrollToTarget(target);
});

/* --- 最初の画面の出方 ------------------------------------------------------ */

const hero = $('.hero');
$$('.hero .reveal').forEach((el, i) => el.style.setProperty('--i', String(i)));

let introPlayed = false;

/**
 * 最初の画面を出す。
 *
 * 参考サイトの開き方に倣う。標語だけが先に出て、ロゴが組み上がり、
 * 葉が散る。ここでは、標語（両脇から回り込む）→ 目印（弾むように）→
 * 文字 → 目印の群れがロゴの後ろから散っていく → 問いかけを打ち込む →
 * 打ち終えたら答えが1行ずつ、の順。
 */
function showHero() {
  hero.classList.add('is-ready');
  if (introPlayed) return;
  introPlayed = true;
  startTagline();
  if (!motion) {
    /* GSAP が無いとき（または動きを減らす場合）。出方は CSS（.reveal）に任せ、
       問いかけが出てくるころに打ち込みを始める */
    window.setTimeout(typeQuestion, 1100);
    return;
  }

  const box = hero.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height * 0.36;
  const toCenter = (el, axis) => {
    const r = el.getBoundingClientRect();
    return axis === 'x' ? cx - (r.left + r.width / 2) : cy - (r.top + r.height / 2);
  };
  const sky = $$('.hero__sky .pin, .hero__sky .dot').filter((el) => el.offsetParent !== null);

  /* 答えは、打ち終えてから出す（showAnswer）。それまで隠しておく */
  gsap.set(['.hero__question', '.hero__answer', '.scroll-cue'], { autoAlpha: 0 });

  gsap
    .timeline({ defaults: { ease: 'power4.out' } })
    /* 標語の文字は、自分で回り込んでくる（startTagline）。囲みは見せておくだけ */
    .fromTo('.hero__tagline', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 })
    .fromTo('.hero__logo', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, '<0.3')
    .fromTo(
      '.hero__emblem',
      { autoAlpha: 0, scale: 0.6, rotation: -10 },
      { autoAlpha: 1, scale: 1, rotation: 0, duration: 1.1, ease: 'back.out(1.8)' },
      '<',
    )
    .fromTo('.hero__wordmark', { autoAlpha: 0, x: -24 }, { autoAlpha: 1, x: 0, duration: 1 }, '-=0.75')
    .fromTo(
      sky,
      {
        autoAlpha: 0,
        x: (i, el) => toCenter(el, 'x') * 0.85,
        y: (i, el) => toCenter(el, 'y') * 0.85,
        scale: 0.2,
        rotation: () => gsap.utils.random(-120, 120),
      },
      { autoAlpha: 1, x: 0, y: 0, scale: 1, rotation: 0, duration: 1.5, stagger: 0.035, ease: 'power3.out' },
      '-=0.85',
    )
    /* 案内役は、文面と同じころに左から */
    .fromTo('.guide--hero', { autoAlpha: 0, x: -24 }, { autoAlpha: 1, x: 0, duration: 1 }, '-=1.4')
    .addLabel('copy', '-=1.2')
    /* 問いかけは、囲みを見せてから1文字ずつ打つ。打ち終えたら答え */
    .set('.hero__question', { autoAlpha: 1, y: 0 }, 'copy')
    .call(() => typeQuestion().then(showAnswer), [], 'copy')
    .fromTo('.scroll-cue', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 'copy+=0.4');
}

/* --- 実例の端末：見えたら、アプリの立ち上がりを流して画面を見せる -------------- */

/**
 * ご指示（2026-09-20）「端末の絵の位置まで送ったら、立ち上がりの動画を流し、
 * いまの画面を見せる」「開いたときに動画を流すのはやめる」。
 *
 * **アプリの起動と同じ順に流す。** 動画3本（画面いっぱい。横長のため左右が
 * 切れる）→ ロゴを2秒 → 画面（浦安ブライトンホテル）。
 *
 * 端末が半分以上見えたら始め、画面の外へすっかり出たら最初に戻す。次に
 * 見えたとき、はじめから流れる。見えていないあいだは流さない。
 *
 * **流せないとき**（自動再生を断られた・動画が読めない・途中で止まった）は、
 * 待たせずに画面を見せる。動きを付けない場合も、はじめから画面を見せる。
 */
const phone = $('#case-phone');
const phoneVideo = $('.phone__video', phone);
/** idle（待ち）→ playing（動画）→ logo（ロゴ）→ app（画面） */
let phoneState = 'idle';
let phoneClip = 0;
let phoneLogoTimer = 0;
let phoneStallTimer = 0;

function phoneShowApp() {
  clearTimeout(phoneLogoTimer);
  clearTimeout(phoneStallTimer);
  phoneState = 'app';
  phoneVideo.pause();
  phone.classList.remove('is-logo');
  phone.classList.add('is-app');
}

/** 進まなくなったら諦めて画面を見せる。電波の弱い場所で、黒い画面のまま待たせない */
function phoneWatchStall() {
  clearTimeout(phoneStallTimer);
  phoneStallTimer = window.setTimeout(() => {
    if (phoneState === 'playing') phoneShowApp();
  }, STALL_MS);
}

function phonePlayClip(i) {
  phoneClip = i;
  if (phoneVideo.getAttribute('src') !== FILMS[i]) phoneVideo.src = FILMS[i];
  phoneWatchStall();
  const started = phoneVideo.play();
  if (started && typeof started.catch === 'function') {
    /* 自動再生を断る環境。止めたあと（元へ戻したとき）の断りは数えない */
    started.catch(() => {
      if (phoneState === 'playing') phoneShowApp();
    });
  }
  /* 次の1本を、いまのうちに読み込んでおく。切り替わりで間が空かないように */
  const next = FILMS[i + 1];
  if (next) {
    const pre = document.createElement('video');
    pre.preload = 'auto';
    pre.muted = true;
    pre.src = next;
  }
}

function phoneStart() {
  if (phoneState !== 'idle') return;
  phoneState = 'playing';
  phonePlayClip(0);
}

/**
 * 最初に戻す（1本目の頭。流す前の絵が見える）。
 * **すぐに戻す**（ふわっと戻さない）。画面の外で戻すので見えないが、ふわっと
 * 戻すと、すぐ送り返したときに、画面の上へ立ち上がりの層が重なっていく
 * 途中が見えてしまう。
 */
function phoneReset() {
  clearTimeout(phoneLogoTimer);
  clearTimeout(phoneStallTimer);
  phoneState = 'idle';
  phoneVideo.pause();
  const layers = [$('.phone__boot', phone), phoneVideo, $('.phone__logo', phone)];
  layers.forEach((el) => (el.style.transition = 'none'));
  phone.classList.remove('is-logo', 'is-app');
  void phone.offsetWidth; /* ここで一度描き直させ、移り変わりなしで戻す */
  layers.forEach((el) => (el.style.transition = ''));
  phoneVideo.src = FILMS[0];
}

phoneVideo.addEventListener('ended', () => {
  if (phoneState !== 'playing') return;
  if (phoneClip + 1 < FILMS.length) {
    phonePlayClip(phoneClip + 1);
    return;
  }
  /* 3本のあと、ロゴを2秒見せてから画面へ（アプリと同じ） */
  clearTimeout(phoneStallTimer);
  phoneState = 'logo';
  phone.classList.add('is-logo');
  phoneLogoTimer = window.setTimeout(phoneShowApp, LOGO_MS);
});
phoneVideo.addEventListener('timeupdate', () => {
  if (phoneState === 'playing') phoneWatchStall();
});
phoneVideo.addEventListener('error', () => {
  if (phoneState === 'playing') phoneShowApp();
});

if (lively) {
  /* 近づいたら、1本目を先に読み込んでおく（見えてから読み始めると、黒い画面で待たせる） */
  const near = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      near.disconnect();
      phoneVideo.preload = 'auto';
      if (phoneState === 'idle') phoneVideo.src = FILMS[0];
    },
    { rootMargin: '100% 0px' },
  );
  near.observe(phone);
  /* 半分以上見えたら流す */
  new IntersectionObserver(
    ([entry]) => {
      if (entry.intersectionRatio >= 0.5) phoneStart();
    },
    { threshold: [0, 0.5] },
  ).observe(phone);
  /* すっかり出ていったら、最初に戻す */
  new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting && phoneState !== 'idle') phoneReset();
  }).observe(phone);
} else {
  phone.classList.add('is-app');
}

/* --- ヘッダー -------------------------------------------------------------- */

const header = $('#site-header');
const nav = $('#site-nav');
const menuButton = $('#menu-button');
let lastY = window.scrollY;

/**
 * 地の色を付けるか、隠すか。
 *
 * 参考サイトと同じく、**下へ送ると隠れ、上へ戻すと出る。** 読んでいる
 * あいだは画面を広く使い、戻ろうとしたときにはすぐ手が届く。
 * 先頭の近くと、メニューを開いているあいだは、常に出しておく。
 */
function paintHeader() {
  const y = window.scrollY;
  const open = nav.classList.contains('is-open');
  header.classList.toggle('is-solid', y > 40 || open);
  if (motion) {
    if (open || y < 160) header.classList.remove('is-hidden');
    else if (y > lastY + 4) header.classList.add('is-hidden');
    else if (y < lastY - 4) header.classList.remove('is-hidden');
  }
  lastY = y;
}
window.addEventListener('scroll', paintHeader, { passive: true });
paintHeader();

function setMenu(open) {
  nav.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  html.style.overflow = open ? 'hidden' : '';
  if (open) lenis?.stop();
  else lenis?.start();
  paintHeader();
}
menuButton.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
nav.addEventListener('click', (e) => {
  if (e.target instanceof Element && e.target.closest('a')) setMenu(false);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nav.classList.contains('is-open')) {
    setMenu(false);
    menuButton.focus();
  }
});

/* --- 先頭へ戻る（UP） ------------------------------------------------------ */

const pageUp = $('#page-up');
/** 最初の画面を6割ほど過ぎたら出す。先頭にいるあいだは要らない */
const paintUp = () => pageUp.classList.toggle('is-shown', window.scrollY > window.innerHeight * 0.6);
window.addEventListener('scroll', paintUp, { passive: true });
paintUp();

/* --- 送りに合わせて、ふわっと出す ------------------------------------------- */

/**
 * 文字をひとつずつ包む。**改行（br）と、中の飾り（span）は残す。** 施設数は包まない。
 * 読み上げでは1文字ずつ区切られないよう、元の文を別に持たせる。
 * @param {string} cls 包んだ文字に付ける名前（見出し・標語は ch、打ち込みは tw）
 */
function splitChars(root, cls = 'ch') {
  let i = 0;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const ch of child.textContent.replace(/\s+/g, '')) {
          const span = document.createElement('span');
          span.className = cls;
          span.setAttribute('aria-hidden', 'true');
          span.style.setProperty('--i', String(i++));
          span.textContent = ch;
          frag.append(span);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE && child.hasAttribute('data-facility-count')) {
        /* 施設数は読み込んで差し替えるため、ひとかたまりで動かす */
        child.classList.add(cls);
        child.setAttribute('aria-hidden', 'true');
        child.style.setProperty('--i', String(i++));
      } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
        walk(child);
      }
    }
  };
  const label = root.textContent.replace(/\s+/g, '');
  walk(root);
  const read = document.createElement('span');
  read.className = 'visually-hidden';
  read.textContent = label;
  root.append(read);
}

/** 参考サイトの power4.out に近い曲線 */
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
/**
 * 一覧のずらしは、全体でこの長さ（ms）に収める。数の少ない一覧は参考サイト
 * どおり 0.3秒ずつ、多い一覧（施設の種類・カード）は詰めて、最後の1つが
 * 待たされすぎないように。
 */
const SPREAD_MAX = 1200;

/**
 * 塊ひとつ分の出方。見えたら再生し、画面の外へすっかり出たら最初へ戻す。
 *
 * **下へ送っても、上へ戻しても出る。** 戻すのは画面の外にいるあいだだけ
 * なので、消えるところは見えない。上へ戻したときは、上から入ってくる
 * 塊がふわっと出る。
 *
 * 動かすのは opacity と translate だけ。transform には触れないので、
 * 釦を指したときの浮き上がり（transform）や、GSAP の動きとぶつからない。
 */
function fader(targets, { from, stagger = 0, duration = 1000 }) {
  const each = targets.length > 1 ? Math.min(stagger, SPREAD_MAX / (targets.length - 1)) : 0;
  const anims = targets.map((el, i) => {
    const a = el.animate(
      [
        { opacity: 0, translate: from },
        { opacity: 1, translate: '0 0' },
      ],
      { duration, delay: i * each, easing: EASE_OUT, fill: 'both' },
    );
    a.pause();
    return a;
  });
  let shown = false;
  return {
    get shown() {
      return shown;
    },
    show() {
      if (shown) return;
      shown = true;
      anims.forEach((a) => a.play());
    },
    /** 出しきった形にすぐする。行を組み直したとき、見えていたものを見えたままにする */
    showNow() {
      shown = true;
      anims.forEach((a) => a.finish());
    },
    hide() {
      if (!shown) return;
      shown = false;
      anims.forEach((a) => {
        a.pause();
        a.currentTime = 0;
      });
    },
  };
}

/** 動きを減らす場合は、位置は動かさず濃さだけで出す */
const shift = (x, y) => (reduceMotion ? '0 0' : `${x} ${y}`);

/** 見張っている塊と、その出方 */
const faders = new Map();

/* 入ってきたら出す。下端の少し手前で出し始める（出る途中が見えるように） */
const entering = canAnimate
  ? new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) faders.get(entry.target)?.show();
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
  : null;
/* すっかり出ていったら戻す */
const leaving = canAnimate
  ? new IntersectionObserver((entries) => {
      for (const entry of entries) if (!entry.isIntersecting) faders.get(entry.target)?.hide();
    })
  : null;

/** 塊を見張りに加える。組み直した塊は、出方だけを差し替える */
function watchFade(el, f) {
  const known = faders.has(el);
  faders.set(el, f);
  if (!known) {
    entering.observe(el);
    leaving.observe(el);
  }
}

if (canAnimate) {
  /* 見出し。参考サイトの char-fade-up と同じ値（20px・1秒）。日本語は字数が
     多いので、1字ずつのずらしは 0.1秒 から 0.05秒 に詰めている。
     動きを減らす場合は、1字ずつにせず見出しごと出す */
  for (const el of $$('.split')) {
    if (reduceMotion) {
      watchFade(el, fader([el], { from: shift('0px', '0px'), duration: 900 }));
    } else {
      splitChars(el);
      watchFade(el, fader($$('.ch', el), { from: shift('0px', '20px'), stagger: 50 }));
    }
  }

  /* 一覧。参考サイトの js-anime-fade-right（左から 20px・0.3秒ずつ） */
  for (const group of $$('[data-anime="fade-right"]')) {
    watchFade(group, fader([...group.children], { from: shift('-20px', '0px'), stagger: 300 }));
  }

  /* そのほかの塊（見出しの上の英字・釦・フッターなど）は、下から */
  for (const el of $$('[data-reveal]')) {
    watchFade(el, fader([el], { from: shift('0px', '24px') }));
  }

  /* 「車寄せナビとは」の文章と絵。動きのある場合は、目印が飛んでくる動き
     （下の GSAP）が受け持つので、ここでは扱わない */
  if (!motion) {
    const message = $('.message');
    watchFade(message, fader([message], { from: shift('0px', '24px') }));
  }
}

/* --- 文を1行ずつ出す ----------------------------------------------------------- */

/**
 * 1行ずつ出す文（ご指示 2026-09-20「ほかの文は、上下に送るにつれて
 * 1行ずつ現れるように」）。
 * 見出しと数字（弾む）、最初の画面の標語と問いかけ（別の動き）、短い札
 * （見出しの上の英字・施設の種類・釦）は、ここに入れない。
 */
const LINE_TEXT = [
  '.message__lead',
  '.pain p',
  '.case__label',
  '.case__quote',
  '.case__note',
  '.card__kicker',
  '.card p:not(.card__kicker)',
  '.flow__lead',
  '.step p',
  '.area__note',
  '.notice-box p',
  '.qa summary',
  '.qa p',
  '.closing__lead',
  '.site-footer__copy',
].join(', ');

/** 組み替えてよい中身か。文字と、文字を飾るものだけ（絵や釦を含むものは組み替えない） */
const INLINE_ONLY = /^(STRONG|EM|B|I|SMALL|MARK|SPAN|BR)$/;

/** 組み替える前の中身。幅が変わったら、ここから組み直す */
const lineSource = new Map();

/**
 * 文を、実際に折り返した位置で行に分ける。
 *
 * 1文字ずつ包んで位置を測り、上下の位置が変わったところを行の変わり目に
 * する。行ごとに枠（.ln）と中身（.ln__in）で包み直す。太字などの飾りが
 * 行をまたぐときは、Range で切り出すと両側に分かれて保たれる。文字の包みは、
 * 測り終えたら外す。**折り返しは測ったときと同じなので、見た目は変わらない。**
 *
 * @returns 行の中身（.ln__in）の並び。見えていない文（閉じた答え）は空
 */
function splitLines(el) {
  if (lineSource.has(el)) el.innerHTML = lineSource.get(el);
  else lineSource.set(el, el.innerHTML);
  if (el.getClientRects().length === 0) return [];

  const texts = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) texts.push(walker.currentNode);
  const chars = [];
  for (const t of texts) {
    if (!t.data.trim()) continue;
    const frag = document.createDocumentFragment();
    for (const ch of t.data) {
      if (/\s/.test(ch)) {
        frag.append(ch);
        continue;
      }
      const span = document.createElement('span');
      span.className = 'lc';
      span.textContent = ch;
      frag.append(span);
      chars.push(span);
    }
    t.replaceWith(frag);
  }
  if (!chars.length) return [];

  const lines = [];
  let top = -Infinity;
  for (const span of chars) {
    const r = span.getBoundingClientRect();
    if (r.top > top + r.height * 0.5) {
      lines.push([]);
      top = r.top;
    }
    lines[lines.length - 1].push(span);
  }

  const box = document.createElement('span');
  box.className = 'lines';
  const range = document.createRange();
  for (const line of lines) {
    range.setStartBefore(line[0]);
    range.setEndAfter(line[line.length - 1]);
    const inner = document.createElement('span');
    inner.className = 'ln__in';
    inner.append(range.extractContents());
    const ln = document.createElement('span');
    ln.className = 'ln';
    ln.append(inner);
    box.append(ln);
  }
  /* 残るのは、行の間の空白と改行（br）だけ。改行は行の枠が受け持つ */
  el.replaceChildren(box);
  for (const span of box.querySelectorAll('.lc')) span.replaceWith(span.textContent);
  box.normalize();
  return $$('.ln__in', box);
}

/** 行の出方。1行ずつ、枠の下からせり上がる（0.09秒ずつ） */
const lineFader = (lines) => fader(lines, { from: shift('0px', '110%'), stagger: 90, duration: 900 });

/**
 * 最初の画面の答え（「車寄せナビは…」）も1行ずつ出すが、送りではなく、
 * 問いかけを打ち終えたときに出す（showAnswer）。
 */
const heroAnswer = $('.hero__answer');
let answerFader = null;
let answerOpen = false;

let lineTargets = [];
let laidWidth = 0;

/** 1つの文を組み、出方を付ける。見えていた文は、見えたままにする */
function layoutLines(el) {
  const lines = splitLines(el);
  if (!lines.length) return;
  const f = lineFader(lines);
  if (el === heroAnswer) {
    answerFader = f;
    if (answerOpen) f.showNow();
    return;
  }
  if (faders.get(el)?.shown) f.showNow();
  watchFade(el, f);
}

function layoutAllLines() {
  laidWidth = window.innerWidth;
  lineTargets.forEach(layoutLines);
  /* 行の組み直しで高さが1px 変わることがある。送りの動きの位置を測り直す */
  if (motion) ScrollTrigger.refresh();
}

if (canAnimate) {
  lineTargets = $$(LINE_TEXT).filter((el) => [...el.querySelectorAll('*')].every((n) => INLINE_ONLY.test(n.tagName)));
  if (motion) lineTargets.push(heroAnswer);

  /* 書体が届いてから測る（届く前と後で、文字の幅と折り返しが変わる）。
     届くのが遅いときは待ちすぎず、届いたら測り直す */
  const fonts = document.fonts?.ready ?? Promise.resolve();
  let fontsIn = false;
  fonts.then(() => {
    fontsIn = true;
  });
  Promise.race([fonts, sleep(2500)]).then(() => {
    layoutAllLines();
    if (!fontsIn) fonts.then(layoutAllLines);
  });

  /* 幅が変わったら組み直す。高さだけの変化（スマートフォンの住所欄の出入り）では組み直さない */
  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (window.innerWidth !== laidWidth) layoutAllLines();
    }, 200);
  });

  /* よくある質問の答えは、閉じているあいだは測れない。開いたときに組んで出す */
  for (const qa of $$('.qa')) {
    qa.addEventListener('toggle', () => {
      if (!qa.open) return;
      for (const el of $$('p', qa).filter((p) => lineTargets.includes(p))) {
        layoutLines(el);
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.92 && r.bottom > 0) faders.get(el)?.show();
      }
    });
  }
}

/* --- 見出しと数字：下へ送ると弾み、足もとから目印が舞う ---------------------- */

/**
 * ご指示（2026-09-20）「小見出しと数字は、下へ送ったときに一瞬大きくなって
 * 元の大きさに戻る。そのとき、ほこりっぽい床を踏みしめたときに舞う砂
 * ぼこりのように目印の形が現れ、ゆっくり消える」。
 *
 * 持ち上がって（1.16倍）、踏みしめて（0.97倍）、元に戻る。踏みしめた瞬間に、
 * 文字の足もとから目印が舞い上がる。数字（施設数）は、見出しが着地したあとに
 * もう一度弾む。締めの一文は、判を押す動き（GSAP）が着地したときに舞わせる。
 */
const POP_TARGETS = '.section-title, h3, .step__no, .count';
const POP_MS = 850;

let dustLayer = null;
const DUST_ON_WHITE = ['var(--green)', 'var(--amber)', 'var(--navy)', 'var(--mint-2)'];
const DUST_ON_GREEN = ['var(--white)', 'var(--amber)', 'var(--mint)'];

/** 文字そのものの広がり。見出しの枠は横幅いっぱいのことがあるため、文字だけを測る */
function textBox(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  /* 読み上げ用の隠した文（1px）は数えない */
  const rects = [...range.getClientRects()].filter((r) => r.width > 2 && r.height > 2);
  if (!rects.length) return null;
  return {
    left: Math.min(...rects.map((r) => r.left)),
    right: Math.max(...rects.map((r) => r.right)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
  };
}

/** 足もとから、目印の形の砂ぼこりを舞い上げる */
function kickDust(el) {
  if (!lively) return;
  const box = textBox(el);
  if (!box) return;
  if (!dustLayer) {
    dustLayer = document.createElement('div');
    dustLayer.className = 'dust-layer';
    dustLayer.setAttribute('aria-hidden', 'true');
    document.body.append(dustLayer);
  }
  const colors = el.closest('.features') ? DUST_ON_GREEN : DUST_ON_WHITE;
  const big = el.matches('.section-title, .closing__title');
  const count = big ? 14 : el.matches('.count, .step__no') ? 10 : 7;
  const width = box.right - box.left;
  for (let i = 0; i < count; i++) {
    const size = big ? 11 + Math.random() * 13 : 9 + Math.random() * 8;
    const x = box.left + width * (0.04 + Math.random() * 0.92);
    const side = x < box.left + width / 2 ? -1 : 1;
    /* 外へ散りながら舞い上がり、ゆっくり漂って消える */
    const dx = side * (16 + Math.random() * (big ? 90 : 55));
    const dy = -(34 + Math.random() * (big ? 96 : 60));
    const tilt = -25 + Math.random() * 50;
    const turn = tilt + side * (25 + Math.random() * 70);
    const color = colors[i % colors.length];
    const p = document.createElement('span');
    p.className = 'dust';
    p.style.setProperty('--s', `${size.toFixed(1)}px`);
    p.style.setProperty('--c', color);
    if (color === 'var(--white)') p.style.setProperty('--hole', 'var(--green)');
    p.style.left = `${(x + window.scrollX - size / 2).toFixed(1)}px`;
    p.style.top = `${(box.bottom + window.scrollY - size).toFixed(1)}px`;
    dustLayer.append(p);
    p.animate(
      [
        { opacity: 0, transform: `translate(0, 0) rotate(${tilt}deg) scale(0.25)` },
        {
          opacity: 1,
          transform: `translate(${dx * 0.5}px, ${dy * 0.72}px) rotate(${(tilt + turn) / 2}deg) scale(1)`,
          offset: 0.2,
        },
        { opacity: 0.85, transform: `translate(${dx * 0.85}px, ${dy}px) rotate(${turn}deg) scale(0.95)`, offset: 0.55 },
        { opacity: 0, transform: `translate(${dx}px, ${dy - 16}px) rotate(${turn}deg) scale(0.85)` },
      ],
      {
        duration: 1600 + Math.random() * 900,
        delay: Math.random() * 110,
        easing: 'cubic-bezier(0.1, 0.7, 0.3, 1)',
        fill: 'backwards',
      },
    ).finished.then(
      () => p.remove(),
      () => p.remove(),
    );
  }
}

/** 弾ませ、踏みしめた瞬間に砂ぼこりを舞わせる */
function pop(el) {
  const number = el.matches('.count, .step__no');
  /* 見出しの1文字ずつの出方が落ち着くころに。数字（施設数）は見出しのあとに */
  const delay = el.matches('.count') ? 700 : el.matches('.section-title') ? 280 : 160;
  const align = getComputedStyle(el).textAlign;
  el.style.transformOrigin =
    number || align === 'center' ? '50% 70%' : align === 'right' || align === 'end' ? '100% 70%' : '0 70%';
  el.animate(
    [
      { scale: '1', easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
      { scale: number ? '1.3' : '1.16', offset: 0.34, easing: 'cubic-bezier(0.6, 0, 0.9, 0.6)' },
      { scale: '0.97', offset: 0.62, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
      { scale: '1' },
    ],
    { duration: POP_MS, delay },
  );
  window.setTimeout(() => kickDust(el), delay + POP_MS * 0.6);
}

if (lively) {
  const popTargets = $$(POP_TARGETS);
  /* GSAP が無いときは、締めの一文も同じように弾ませる（判を押す動きの代わり） */
  if (!motion) popTargets.push($('.closing__title'));

  /* 弾ませてよいもの。画面の外へすっかり出たら、次に備えて加える */
  const armed = new Set();
  const popAt = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !armed.has(entry.target)) continue;
        /* 下へ送って、下から入ってきたときだけ（上へ戻したときは弾ませない） */
        const fromBelow = entry.boundingClientRect.top > entry.rootBounds.top + entry.rootBounds.height * 0.5;
        if (scrollDir > 0 && fromBelow) {
          armed.delete(entry.target);
          pop(entry.target);
        }
      }
    },
    /* 画面に入って少ししたら弾ませる。深く入るまで待つと、通り過ぎてから
       弾んでいるように見える（ご指摘 2026-09-21） */
    { rootMargin: '0px 0px -12% 0px' },
  );
  const rearm = new IntersectionObserver((entries) => {
    for (const entry of entries) if (!entry.isIntersecting) armed.add(entry.target);
  });
  for (const el of popTargets) {
    popAt.observe(el);
    rearm.observe(el);
  }
}

/* --- 押した位置に、赤い輪が3つ広がる ------------------------------------------ */

/**
 * ご指示（2026-09-20）「マウスを押すたびに、押した位置を正確に示す、
 * 広がる赤い円を3つ出す」。
 *
 * 押した点から、3つの輪が少しずつ遅れて広がり、薄れて消える。同じ大きさ
 * まで広がる輪を 0.13秒ずつずらすので、どの瞬間にも大きさの違う輪が
 * 3重に見える。マウスで押したときだけ（指で触れたときは出さない）。
 * 押すのを邪魔しないよう、輪は押せないもの（styles.css の .click-layer）。
 */
const CLICK_RINGS = 3;
const CLICK_GAP_MS = 130;
const CLICK_MS = 700;

if (lively) {
  const clickLayer = document.createElement('div');
  clickLayer.className = 'click-layer';
  clickLayer.setAttribute('aria-hidden', 'true');
  document.body.append(clickLayer);
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      for (let i = 0; i < CLICK_RINGS; i++) {
        const ring = document.createElement('span');
        ring.className = 'click-ring';
        ring.style.left = `${e.clientX}px`;
        ring.style.top = `${e.clientY}px`;
        clickLayer.append(ring);
        ring
          .animate(
            /* 大きさ（幅・高さ）で広げる。縮尺で広げると、縁の線まで細くなって薄く見える */
            [
              { width: '4px', height: '4px', opacity: 1 },
              { width: '40px', height: '40px', opacity: 1, offset: 0.5 },
              { width: '64px', height: '64px', opacity: 0 },
            ],
            { duration: CLICK_MS, delay: i * CLICK_GAP_MS, easing: 'cubic-bezier(0.2, 0.7, 0.35, 1)', fill: 'backwards' },
          )
          .finished.then(
            () => ring.remove(),
            () => ring.remove(),
          );
      }
    },
    /* 先に受け取る。ほかの処理が伝わりを止めても、輪は出る */
    { capture: true, passive: true },
  );
}

/* --- 標語：文字が両脇から回り込み、3秒とどまって引っ込む ---------------------- */

/**
 * ご指示（2026-09-20）「緑の文字は、両脇から回転しながら魅力的に現れ、
 * 3秒表示したら引っ込み、また現れる。これをくり返す」。
 *
 * 左半分の文字は左から、右半分は右から、転がるように回りながら入り、
 * 端の文字から先に着いて、最後に中央で合わさる。出そろってから3秒とどまり、
 * 中央の文字から先に、両脇へ回りながら引っ込む。
 * 最初の画面が見えていないあいだは、次の回を始めない。
 */
const TAGLINE_HOLD = 3000;
const tagline = $('.hero__tagline span');
let taglineOn = false;

function startTagline() {
  if (!lively || taglineOn) return;
  taglineOn = true;
  splitChars(tagline);
  const chars = $$('.ch', tagline);
  const mid = (chars.length - 1) / 2;
  const moves = chars.map((el, i) => {
    const side = i <= mid ? -1 : 1;
    const far = mid ? Math.abs(i - mid) / mid : 0; /* 中央 0 〜 端 1 */
    /* 左の文字は右へ転がって入る（時計回り）。右の文字は左へ（反時計回り） */
    const away = `translateX(${side * (60 + far * 110)}px) rotate(${side * 300}deg) scale(0.3)`;
    return { el, far, away };
  });

  let heroSeen = true;
  let heroBack = null;
  new IntersectionObserver(([entry]) => {
    heroSeen = entry.isIntersecting;
    if (heroSeen && heroBack) {
      heroBack();
      heroBack = null;
    }
  }).observe(hero);

  (async () => {
    let gone = [];
    for (;;) {
      if (!heroSeen) await new Promise((resolve) => (heroBack = resolve));
      const come = moves.map(({ el, far, away }) =>
        el.animate(
          [{ opacity: 0, transform: away }, { opacity: 1, offset: 0.45 }, { opacity: 1, transform: 'none' }],
          { duration: 1500, delay: (1 - far) * 700, easing: 'cubic-bezier(0.3, 1.2, 0.55, 1)', fill: 'both' },
        ),
      );
      gone.forEach((a) => a.cancel());
      await Promise.all(come.map((a) => a.finished));
      await sleep(TAGLINE_HOLD);
      gone = moves.map(({ el, far, away }) =>
        el.animate(
          [{ opacity: 1, transform: 'none' }, { opacity: 1, offset: 0.4 }, { opacity: 0, transform: away }],
          { duration: 850, delay: far * 420, easing: 'cubic-bezier(0.5, 0, 0.75, 0.2)', fill: 'both' },
        ),
      );
      come.forEach((a) => a.cancel());
      await Promise.all(gone.map((a) => a.finished));
      await sleep(450);
    }
  })();
}

/* --- 右側の縦の一文：1文字ずつせり上がり、出そろったら上へ抜けて次の文へ ------- */

/**
 * ご指示（2026-10-13）。「みんなで、このアプリをもっと良くしていく。」「みんなが、
 * このアプリの管理者であり、利用者。」を、サイトの右側に、1文字ずつ上へ流れて
 * 出そろうように。くり返し回す。おしゃれで今風に（文は英語でいただき、日本語にして
 * kara さんにご確認いただいたもの）。
 *
 * 1文字ずつ、自分の枠の下からせり上がる（上から順に）。出そろったら
 * RAIL_HOLD とどまり、上の文字から順に枠の上へ抜けていく。続けて次の文。
 * 札にマウスを重ねているあいだは止まる（読み終えるまで待てるように）。
 * 画面を見ていないあいだ（別のタブ）は、とどまる時間を数えない。
 * 動きを減らす場合（.calm）は、位置を動かさず、濃さだけで1文字ずつ出す。
 */
const RAIL_START = 2400; /* 開いてから。最初の画面の組み上がりと重ねない */
const RAIL_ENTER = 620;
const RAIL_ENTER_GAP = 75;
const RAIL_HOLD = 4000;
const RAIL_LEAVE = 520;
const RAIL_LEAVE_GAP = 40;
const RAIL_REST = 350;
const rail = $('#vrail');

/** 1文字ずつ枠に入れる。読み上げには、元の文を1つにまとめて渡す */
function splitRail(line) {
  const text = line.textContent.trim();
  line.textContent = '';
  const chars = Array.from(text).map((c) => {
    const cell = document.createElement('span');
    cell.className = 'vrail__cell';
    cell.setAttribute('aria-hidden', 'true');
    const ch = document.createElement('span');
    ch.className = 'vrail__ch';
    ch.textContent = c;
    cell.append(ch);
    line.append(cell);
    return ch;
  });
  const read = document.createElement('span');
  read.className = 'visually-hidden';
  read.textContent = text;
  line.append(read);
  return chars;
}

async function startRail() {
  if (!rail) return;
  if (!canAnimate) {
    /* 動きが使えない環境では、1つ目の文をそのまま出す */
    rail.classList.add('is-still');
    return;
  }
  /* 書体が届くのを少し待つ（出ている途中で字形が替わらないように）。届かなければ端末の書体で */
  const sample = $$('.vrail__line', rail)
    .map((l) => l.textContent)
    .join('');
  await Promise.race([document.fonts?.load(`600 16px "Klee One"`, sample), sleep(3000)]).catch(() => undefined);

  const lines = $$('.vrail__line', rail).map(splitRail);
  const dots = $$('.vrail__dots i', rail);
  const below = reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(105%)' };
  const shown = { opacity: 1, transform: 'none' };
  const above = reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-105%)' };
  lines.flat().forEach((ch) => {
    ch.style.opacity = '0';
    if (!reduceMotion) ch.style.transform = 'translateY(105%)';
  });
  rail.classList.add('is-split', 'is-on');

  /*
    止める理由（どれか1つでもあれば止める）。
      hover … マウスを重ねているあいだ（指で触れたときは止めない。離す合図が来ないため）
      away  … 脇の写真に道を譲って、隠れているあいだ（戻ったら続きから）
  */
  const holds = new Set();
  let paused = false;
  let running = [];
  const setHold = (key, on) => {
    if (on) holds.add(key);
    else holds.delete(key);
    if (paused === holds.size > 0) return;
    paused = holds.size > 0;
    running.forEach((a) => (paused ? a.pause() : a.play()));
  };
  const card = $('.vrail__card', rail);
  card.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') setHold('hover', true);
  });
  card.addEventListener('pointerleave', () => setHold('hover', false));

  /*
    **脇の写真（案内役・端末の絵）に道を譲る。** 広い画面では、写真が右の余白まで
    張り出していて、札と重なる。重なっているあいだは、札を右へ引いて隠す。
    札が引いた分（16px）で重なりが外れて、出たり隠れたりをくり返さないよう、
    札の左に 24px の余裕を見て判定する。
  */
  const photos = $$('.guide img');
  let awayQueued = false;
  const paintAway = () => {
    awayQueued = false;
    const c = card.getBoundingClientRect();
    const away = photos.some((img) => {
      const r = img.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      return r.right > c.left - 24 && r.left < c.right && r.bottom > c.top && r.top < c.bottom;
    });
    rail.classList.toggle('is-away', away);
    setHold('away', away);
  };
  const queueAway = () => {
    if (awayQueued) return;
    awayQueued = true;
    requestAnimationFrame(paintAway);
  };
  window.addEventListener('scroll', queueAway, { passive: true });
  window.addEventListener('resize', queueAway);
  /* 写真は、送り終えてから下からふわっと出てくる（送りの合図が来ない）。間をおいても見る */
  window.setInterval(() => {
    if (!document.hidden) queueAway();
  }, 300);
  paintAway();

  /** 止めているあいだと、画面を見ていないあいだは数えない待ち */
  const hold = (ms) =>
    new Promise((resolve) => {
      let left = ms;
      let last = performance.now();
      const id = window.setInterval(() => {
        const now = performance.now();
        if (!paused && !document.hidden) left -= now - last;
        last = now;
        if (left <= 0) {
          window.clearInterval(id);
          resolve();
        }
      }, 100);
    });
  const run = (chars, frames, duration, gap, easing) => {
    const anims = chars.map((ch, i) => ch.animate(frames, { duration, delay: i * gap, easing, fill: 'both' }));
    if (paused) anims.forEach((a) => a.pause());
    return anims;
  };
  const settle = (anims) => Promise.all(anims.map((a) => a.finished.catch(() => undefined)));

  for (let n = 0; ; n = (n + 1) % lines.length) {
    const chars = lines[n];
    dots.forEach((d, i) => d.classList.toggle('is-on', i === n));
    chars.forEach((ch) => ch.getAnimations().forEach((a) => a.cancel()));
    const enter = run(chars, [below, shown], RAIL_ENTER, RAIL_ENTER_GAP, EASE_OUT);
    running = enter;
    await settle(enter);
    await hold(RAIL_HOLD);
    const leave = run(chars, [shown, above], RAIL_LEAVE, RAIL_LEAVE_GAP, 'cubic-bezier(0.6, 0, 0.8, 0.2)');
    running = leave;
    enter.forEach((a) => a.cancel());
    await settle(leave);
    await hold(RAIL_REST);
  }
}

/* --- 問いかけ：1文字ずつ打ち込む ----------------------------------------------- */

/**
 * ご指示（2026-09-20）「その下の文は、1文字ずつ打ち込んでいるように」。
 * 打つ前の文字は場所を取ったまま隠し（styles.css の .tw）、打つたびに文が
 * 動かないようにする。人が打つように間を少しずつ変え、読点・句点・改行
 * では少し長く置く。打っている位置で縦棒が点滅する。
 */
const question = $('.hero__question');
let typing = null;
if (lively) {
  splitChars(question, 'tw');
  question.classList.add('is-typing');
}

/** 打ち込む。打ち終えたら解決する。2度目からは、最初の約束を返す */
function typeQuestion() {
  if (!lively) return Promise.resolve();
  if (typing) return typing;
  const chars = $$('.tw', question);
  typing = new Promise((resolve) => {
    let i = 0;
    const next = () => {
      chars[i - 1]?.classList.remove('is-caret');
      if (i >= chars.length) {
        /* 打ち終えたら、縦棒を少し点滅させてから消す */
        const last = chars[chars.length - 1];
        last?.classList.add('is-caret');
        window.setTimeout(() => last?.classList.remove('is-caret'), 2700);
        resolve();
        return;
      }
      const el = chars[i++];
      el.classList.add('is-on', 'is-caret');
      const ch = el.textContent;
      let wait = 32 + Math.random() * 30;
      if ('、，'.includes(ch)) wait += 170;
      if ('。？！'.includes(ch)) wait += 240;
      const after = el.nextSibling;
      if (after?.nodeName === 'BR' && getComputedStyle(after).display !== 'none') wait += 140;
      window.setTimeout(next, wait);
    };
    next();
  });
  return typing;
}

/** 打ち終えたら、答えの囲みを出し、中の文を1行ずつ出す */
function showAnswer() {
  answerOpen = true;
  gsap
    .timeline({ defaults: { ease: 'power4.out' } })
    .fromTo('.hero__answer', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.9 })
    .call(() => answerFader?.show(), [], 0.2);
}

/* --- できること：カードが左へ流れ続ける ---------------------------------------- */

/**
 * ご指示（2026-09-21）「カードが左へ流れて、ぐるぐる回るように」
 * 「上の矢印も効くように」。
 *
 * **同じ並びをもう一組うしろに足し、一組ぶん進んだら位置を戻す。** 戻す
 * 瞬間には同じ絵が並んでいるので、切れ目が見えない。
 *
 * **流すのも、矢印で送るのも、この描き直しが1か所で受け持つ。** ブラウザの
 * なめらかな送り（scrollBy の smooth）と混ぜると、流れと送りが引っ張り合う。
 *
 * **止めるのは、読もうとしているときだけ。** マウスを動かしたとき・押したとき・
 * 指で触ったとき・キーボードで入ったときは止め、動かさなくなれば流れに戻る。
 * 送っているあいだ、カーソルは画面の中で止まったままなので、カードがその下に
 * 入っただけでは止めない（止めていたため、通り過ぎるまで流れなかった。
 * ご指摘 2026-09-21）。
 *
 * **画面に入る少し手前から流し始める**（下から現れたときには、もう流れている）。
 * 画面の外にあるあいだは止める。動きを減らす場合は流さない（矢印は効く）。
 */
const cards = $('#cards');
const prev = $('[data-carousel="prev"]');
const next = $('[data-carousel="next"]');

/** 1秒に流れる量。読みながら追える速さ */
const FLOW_SPEED = 45;
/** 矢印で送ったあと、流れに戻るまでの間 */
const FLOW_HOLD = 700;
/** マウスを動かしたあと、流れに戻るまでの間 */
const POINTER_HOLD = 1500;

/* もう一組足す。読み上げからは外す（同じ中身を2回読ませない） */
const firstCopy = cards.children.length;
for (const card of [...cards.children]) {
  const copy = card.cloneNode(true);
  copy.setAttribute('aria-hidden', 'true');
  copy.classList.add('is-copy');
  /* 元の絵はもう読み込んである。写しは待たずに出す */
  for (const img of $$('img', copy)) img.loading = 'eager';
  cards.append(copy);
}

/** 一組ぶんの長さ。1枚目と、その写しの左端の差 */
let loopWidth = 0;
const measureLoop = () => {
  const a = cards.children[0];
  const b = cards.children[firstCopy];
  loopWidth = a && b ? b.offsetLeft - a.offsetLeft : 0;
};
measureLoop();

/** 矢印1回ぶん（カード1枚と、その間） */
function step() {
  const card = cards.querySelector('.card');
  if (!card) return 300;
  const gap = parseFloat(getComputedStyle(cards).columnGap || '24') || 24;
  return card.getBoundingClientRect().width + gap;
}

let pos = cards.scrollLeft;
let target = null;
let holdUntil = 0;
let moveHold = 0;
let touching = false;
let seen = true;
let running = false;
let lastSet = pos;
let prevTime = 0;

/** 一組ぶん進んだら戻す（戻したことが見えないように） */
function wrapAround() {
  if (loopWidth <= 0) return;
  if (pos >= loopWidth) {
    pos -= loopWidth;
    if (target !== null) target -= loopWidth;
  } else if (pos < 0) {
    pos += loopWidth;
    if (target !== null) target += loopWidth;
  }
}

function frame(now) {
  const dt = prevTime ? Math.min((now - prevTime) / 1000, 0.05) : 0;
  prevTime = now;

  if (target !== null) {
    if (reduceMotion) {
      pos = target;
      target = null;
      holdUntil = now + FLOW_HOLD;
    } else {
      pos += (target - pos) * Math.min(1, dt * 7);
      if (Math.abs(target - pos) < 0.5) {
        pos = target;
        target = null;
        holdUntil = now + FLOW_HOLD;
      }
    }
  } else if (lively && seen && !touching && now > holdUntil && now > moveHold) {
    pos += FLOW_SPEED * dt;
  }

  wrapAround();
  cards.scrollLeft = pos;
  lastSet = cards.scrollLeft;

  if (lively || target !== null) requestAnimationFrame(frame);
  else running = false;
}

function kick() {
  if (running) return;
  running = true;
  prevTime = 0;
  requestAnimationFrame(frame);
}

/** 矢印。端でも止まらない（一組ぶんで戻るため、いつでも押せる） */
const go = (dir) => {
  target = (target ?? pos) + dir * step();
  kick();
};
prev.addEventListener('click', () => go(-1));
next.addEventListener('click', () => go(1));
prev.disabled = false;
next.disabled = false;

/* 指やマウスで送られたら、その位置に合わせて、しばらく流さない */
cards.addEventListener(
  'scroll',
  () => {
    if (Math.abs(cards.scrollLeft - lastSet) < 2) return;
    pos = cards.scrollLeft;
    target = null;
    holdUntil = performance.now() + 1200;
  },
  { passive: true },
);

/*
  読もうとしているあいだは止める。
  **マウスは「動かしたとき」だけ。** 送っているあいだカーソルは止まったままで、
  カードがその下に入っただけでは、読もうとしているとは限らない。
*/
cards.addEventListener(
  'pointermove',
  (e) => {
    if (e.pointerType !== 'mouse') return;
    moveHold = performance.now() + POINTER_HOLD;
  },
  { passive: true },
);
for (const on of ['pointerdown', 'touchstart', 'focusin']) {
  cards.addEventListener(on, () => (touching = true), { passive: true });
}
for (const off of ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'focusout']) {
  cards.addEventListener(off, () => {
    touching = false;
    kick();
  }, { passive: true });
}

window.addEventListener('resize', () => {
  measureLoop();
  wrapAround();
});

if (canAnimate) {
  /* 画面に入る少し手前から流し始め、出たら止める */
  new IntersectionObserver(
    ([entry]) => {
      seen = entry.isIntersecting;
      if (seen) kick();
    },
    { rootMargin: '25% 0px' },
  ).observe(cards);
}
if (lively) kick();

/* =========================================================================
   ここから下は、送りに合わせた動き。動きを付けない場合は何もしない
   ========================================================================= */

if (motion) {
  /* --- 最初の画面を離れるとき -------------------------------------------- */

  /*
    参考サイトの値：ロゴは 0.7倍まで縮み、10px ぼやけて消える。
    ここでは目印だけを残し、文字・標語・文面を同じように消す。
  */
  /* 送ると薄れるのは、写真そのもの（外枠は出方（.reveal）で使っている。
     外枠を薄めると、出方の始まりの値を取り込んでしまい、先頭へ戻しても戻らない） */
  gsap.to(['.hero__wordmark img', '.hero__tagline span', '.hero__copy', '.guide--hero img'], {
    autoAlpha: 0,
    scale: 0.7,
    filter: 'blur(10px)',
    ease: 'back.inOut(0.1)',
    scrollTrigger: { trigger: hero, start: 'top+=12% top', end: 'bottom center', scrub: true },
  });
  gsap.to('.scroll-cue > *', {
    autoAlpha: 0,
    ease: 'none',
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top+=70%', scrub: true },
  });
  /* 空の目印は、奥にあるように少し遅れて上がる */
  gsap.to('.hero__sky', {
    y: -160,
    ease: 'none',
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 1 },
  });

  /* --- 目印が離れて、次の節の大きな絵になる -------------------------------- */

  /*
    参考サイトのいちばんの見せ場。ロゴの丸い図柄が、送るにつれて離れ、
    大きくなりながら MESSAGE の絵の位置へ移る。

    ここでは、ロゴの目印（ピン）が離れ、途中でアプリのアイコンに
    替わりながら、「車寄せナビとは」の大きな絵の位置へ収まる。

    **位置は、ページ全体の中での場所で持つ。** 画面の中の位置で持つと、
    送るたびに計算がずれる。変形（transform）を含まない寸法を使う。
  */
  const flyer = $('#flyer');
  const emblem = $('.hero__emblem img');
  const mark = $('#message-mark');
  const layoutBox = (el) => {
    let x = 0;
    let y = 0;
    for (let n = el; n; n = n.offsetParent) {
      x += n.offsetLeft;
      y += n.offsetTop;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  };
  let from = layoutBox(emblem);
  let to = layoutBox(mark);
  const measure = () => {
    from = layoutBox(emblem);
    to = layoutBox(mark);
  };
  ScrollTrigger.addEventListener('refreshInit', measure);

  /** 動き出したら、元の目印を隠して、移る層に替える。先頭へ戻ったら元へ */
  const swap = (moving) => {
    flyer.style.visibility = moving ? 'visible' : 'hidden';
    emblem.style.visibility = moving ? 'hidden' : 'visible';
  };

  gsap
    .timeline({
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        endTrigger: mark,
        end: 'center center',
        scrub: 0.6,
        invalidateOnRefresh: true,
        onUpdate: (self) => swap(self.progress > 0.002),
      },
    })
    .fromTo(
      flyer,
      { x: () => from.x, y: () => from.y, width: () => from.w, height: () => from.h },
      { x: () => to.x, y: () => to.y, width: () => to.w, height: () => to.h, ease: 'power1.inOut', duration: 1 },
      0,
    )
    /* アイコンを先に重ねきってから、下の目印を消す。両方が半ば透けると、
       白地の上で灰色くにごって見える */
    .to('.flyer__icon', { opacity: 1, duration: 0.25, ease: 'none' }, 0.15)
    .to('.flyer__emblem', { autoAlpha: 0, duration: 0.05, ease: 'none' }, 0.4);
  swap(false);

  /* 文章は、絵が近づくにつれて大きくなりながら現れる（参考サイトは 0.6倍から） */
  gsap.fromTo(
    '.message__text',
    { autoAlpha: 0, scale: 0.8, y: 40 },
    {
      autoAlpha: 1,
      scale: 1,
      y: 0,
      ease: 'power1.out',
      scrollTrigger: { trigger: '.message', start: 'top 92%', end: 'center 55%', scrub: 0.6 },
    },
  );

  /* --- 背に敷いた巨大な英字 --------------------------------------------- */

  /* 参考サイトの MESSAGE と同じく、大きくなりながら現れ、過ぎると薄れる */
  $$('.giant').forEach((giant) => {
    gsap
      .timeline({
        scrollTrigger: { trigger: giant.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      })
      .fromTo(giant, { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1.1, duration: 3, ease: 'none' })
      .to(giant, { autoAlpha: 0, scale: 1.2, duration: 1, ease: 'none' });
  });

  /* --- 締めの見出しは、判を押すように（参考サイトの「次の100年に向けて。」） */

  gsap
    .timeline({
      scrollTrigger: { trigger: '.closing__title', start: 'top 85%', toggleActions: 'play none none reverse' },
    })
    .fromTo(
      '.closing__title',
      { autoAlpha: 0, scale: 0.6, rotation: -10 },
      { autoAlpha: 1, rotation: 0, scale: 1.2, duration: 1, ease: 'back.inOut(0.8)' },
    )
    .to('.closing__title', { scale: 1, duration: 0.4, ease: 'back.inOut(0.8)' })
    /* 判が着地したところで、足もとから目印が舞う（見出しの弾みと同じ）。
       上へ戻して巻き戻るときは舞わせない */
    .call(() => scrollDir > 0 && kickDust($('.closing__title')), [], 1.25);

  /* --- 散らした目印：奥行きごとに違う速さで動く ----------------------------- */

  $$('.deco [data-depth]').forEach((el) => {
    const depth = Number(el.dataset.depth) || 1;
    const section = el.closest('section');
    gsap.fromTo(
      el,
      { autoAlpha: 0 },
      {
        autoAlpha: 1,
        duration: 0.7,
        ease: 'power1.out',
        /* 上へ戻して節を離れると薄れ、また下へ送ると出る */
        scrollTrigger: { trigger: section, start: 'top 85%', toggleActions: 'play none none reverse' },
      },
    );
    gsap.fromTo(
      el,
      { y: depth * 60 },
      {
        y: depth * -60,
        ease: 'none',
        scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 1.2 },
      },
    );
  });

  /* --- フッターへ、左右から目印が飛んでくる --------------------------------- */

  const footer = $('.site-footer');
  [
    ['.footer-pin--left', -1],
    ['.footer-pin--right', 1],
  ].forEach(([sel, side]) => {
    /* 参考サイトは曲線の道筋（motionPath）で飛ばす。ここでは2つの区切りで近い弧を描く */
    gsap
      /* 上へ戻してフッターが見えなくなったら元へ。また下へ送ると、もう一度飛んでくる */
      .timeline({ scrollTrigger: { trigger: footer, start: '-30% bottom', toggleActions: 'play none none reset' } })
      .fromTo(
        sel,
        { autoAlpha: 0, x: `${side * 40}vw`, y: '-10vh', scale: 0.5, rotation: side * 90 },
        { autoAlpha: 1, x: `${side * 18}vw`, y: '-26vh', scale: 0.8, rotation: side * 30, duration: 1, ease: 'power2.in' },
      )
      .to(sel, { x: 0, y: 0, scale: 1, rotation: 0, duration: 1.1, ease: 'power2.out' });
  });

  /* 書体が遅れて届くと、文字の幅が変わって位置がずれる。届いたら測り直す */
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh());
}

/* --- 開いたら、すぐ最初の画面を出す（最後に。上の準備が済んでから） ---------- */

showHero();
if (motion) requestAnimationFrame(() => ScrollTrigger.refresh());
window.setTimeout(startRail, RAIL_START);
