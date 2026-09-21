/**
 * 紹介サイト（site/）を確かめる。
 *
 *   npx serve -l 4300 site           （別の窓で）
 *   node tools/test-site.mjs
 *   node tools/test-site.mjs https://公開後の住所/
 *
 * **Edge で見る。** 同梱の Chromium は H.264 の動画を再生できない。
 * 立ち上がりの動画が流れるかどうかを確かめられないため、Windows に
 * 入っている Edge を使う（channel: 'msedge'）。
 *
 * **何を見るか**
 *   開いたとき … 全画面の動画を流さず、すぐ最初の画面が出る／開き直すと先頭から
 *   実例の端末 … 見えるまでは流さない／見えたら3本 → ロゴ → いまの画面／
 *              離れると最初に戻り、また見えるとはじめから／途中で離れると止まる／
 *              自動再生を断られても、動画が壊れていても、画面が出る
 *   文面     … 発注元の文面が、そのまま載っている
 *   リンク   … 「アプリを開く」がすべて同じ住所／ページ内の飛び先がある
 *   崩れ     … 5つの幅で横にはみ出さない／画像がすべて読める
 *   操作     … 横送り（左へ流れ続ける・切れ目なくつながる・矢印・触ると止まる）／
 *              メニュー・よくある質問
 *   動き     … 参考サイトに倣った動き。目印がロゴから次の節の絵へ収まる／
 *              ヘッダーが隠れて戻る／UP／**どこで止めても、画面の中に透明の
 *              まま残るものが無い**（パソコンとスマートフォンの両方）
 *              塊が**下へ送っても、上へ戻しても**ふわっと出る／目印が浮き沈みし、
 *              ふくらんではしぼむ
 *   足した動き … ご指示（2026-09-20）。カーソルが目印を上下に返した形（先が
 *              押す位置）／マウスで押すと赤い輪が3つ広がる／標語が回り込み、
 *              3秒とどまって引っ込み、くり返す／問いかけを1文字ずつ打つ／
 *              文が1行ずつ出る（行の分け方が正しい・文字が変わらない・
 *              幅を変えても1行ずつ）／緑の帯の縁が波打つ／見出しと数字が
 *              下へ送ったときだけ弾み、目印の砂ぼこりが舞って消える
 *   案内役の写真 … 広い画面では余白に3枚、よくあるご質問には吹き出しを添えて。
 *              本文に掛からない／狭い画面では脇の3枚を出さない
 *   動きを減らす設定 … **いまは従わない**（設定の方にも同じ動きが出る）。
 *              従う場合（?calm）は、大きな動きを止め、濃さだけで出す
 */
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? 'http://localhost:4300/').replace(/\/?$/, '/');
const APP_URL = 'https://kurumayose-navi.vercel.app/';

/** 発注元からいただいた文面（2026-09-19）。**画面に出た文字と突き合わせる。** */
const CLIENT_TEXT = [
  'ナビアプリによる車寄せやエントランスの位置情報が実際の送迎先とずれている事があり、お客様からお𠮟りを受けてしまったり送迎時間が長く成ったりする事がありませんか？',
  '車寄せナビはプロドライバーに寄り添った車寄せやエントランスの案内をナビの案内を正確に導くお手伝いをします。',
];

let pass = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL  ${label}`);
    if (detail) console.error(`        ${detail}`);
  }
};

const browser = await chromium.launch({ channel: 'msedge' });

/** まっさらな窓。訪問の控え（sessionStorage）を持ち越さない */
async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return { ctx, page, errors };
}

/* ---------------------------------------------------------------------------
   送りに合わせた出方と、目印の動きを確かめる手立て
   --------------------------------------------------------------------------- */

/** 出方を見る塊（見出しの上の英字）。ページの中ほどにあり、上へも下へも送れる */
const FADE_TARGET = '#flow .eyebrow';

/**
 * 送ってから、描くたびに（1コマごとに）濃さと位置を取る。
 * **途中の値が並ぶこと＝ふわっと出ていること。**
 *
 * 取るのはページの中で行う。検査の側から1回ずつ取りに行くと、その往復が
 * 遅れた回に途中の値を取りこぼし、ちゃんとふわっと出ているのに落ちた
 * （2026-09-20、確認用の住所で1度）。
 */
async function sampleFade(page, sel, y, ms = 700) {
  const r = await page.evaluate(
    async ({ s, y: to, ms: span }) => {
      window.scrollTo(0, to);
      const el = document.querySelector(s);
      const all = [];
      const t0 = performance.now();
      while (performance.now() - t0 < span) {
        await new Promise(requestAnimationFrame);
        const cs = getComputedStyle(el);
        all.push({ o: Number(cs.opacity), tr: cs.translate });
      }
      await new Promise((done) => setTimeout(done, 900));
      return { all, end: Number(getComputedStyle(el).opacity) };
    },
    { s: sel, y, ms },
  );
  return { ...r, steps: r.all.filter((x) => x.o > 0.02 && x.o < 0.98) };
}

/**
 * 塊が、下へ送って下から入ってきたときも、上へ戻して上から入ってきた
 * ときも、ふわっと出るか。
 * @param {boolean} moves 位置も動くはずか（動きを減らす設定では、濃さだけ）
 */
async function checkFades(page, label, moves) {
  const y = await page.evaluate(
    (s) => document.querySelector(s).getBoundingClientRect().top + window.scrollY - window.innerHeight / 2,
    FADE_TARGET,
  );
  const opacity = () =>
    page.evaluate((s) => Number(getComputedStyle(document.querySelector(s)).opacity), FADE_TARGET);
  const trail = (r) => r.all.map((x) => x.o.toFixed(2)).join(' ');

  /* 遅れて読む写真を、先に読ませておく。読み込みと測定が重なると、
     出ている途中の値を取りこぼす（確認用の住所で1度落ちた） */
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  check(`${label}：画面の外の塊は、まだ出ていない`, (await opacity()) < 0.02);

  /* 下へ送って、下から入れる */
  let r = await sampleFade(page, FADE_TARGET, y);
  check(`${label}：下へ送ると、塊がふわっと出る`, r.steps.length >= 3 && r.end > 0.98, trail(r));
  const still = (tr) => tr === 'none' || tr === '0px' || tr === '0px 0px';
  const moved = r.all.some((x) => x.o > 0.02 && !still(x.tr));
  check(
    moves ? `${label}：出るとき、下から浮かび上がる` : `${label}：出るとき、位置は動かさない（濃さだけ）`,
    moves ? moved : !moved,
    r.all.map((x) => x.tr).join(' | '),
  );

  /* 行き過ぎて画面の上へ出すと、元へ戻っている（消えるところは画面の外） */
  await page.evaluate((yy) => window.scrollTo(0, yy + 2600), y);
  await page.waitForTimeout(500);
  check(`${label}：画面の上へ出た塊は、次に備えて元へ戻る`, (await opacity()) < 0.02);

  /* 上へ戻して、上から入れる */
  r = await sampleFade(page, FADE_TARGET, y);
  check(`${label}：上へ戻しても、塊がふわっと出る`, r.steps.length >= 3 && r.end > 0.98, trail(r));
}

/** 目印が浮き沈みし、ふくらんではしぼむか */
async function checkPins(page, label) {
  const counts = await page.evaluate(() => {
    const shown = [...document.querySelectorAll('.pin')].filter((p) => getComputedStyle(p).display !== 'none');
    /* 1つの目印に、形と穴 × 浮く・ふくらむ で4つの動きがある */
    const moving = shown.filter(
      (p) => p.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length >= 4,
    );
    return { all: shown.length, moving: moving.length };
  });
  check(`${label}：目印がすべて動いている`, counts.moving === counts.all && counts.all > 0, JSON.stringify(counts));

  const read = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.pin')]
        .filter((p) => getComputedStyle(p).display !== 'none')
        .map((p) => {
          const b = getComputedStyle(p, '::before');
          return { y: parseFloat(b.translate.split(' ')[1] ?? '0') || 0, k: Number(b.scale) || 1 };
        }),
    );
  const samples = [];
  for (let i = 0; i < 8; i++) {
    samples.push(await read());
    await page.waitForTimeout(450);
  }
  const span = (a) => Math.max(...a) - Math.min(...a);
  const ys = samples.map((s) => s[0].y);
  const ks = samples.map((s) => s[0].k);
  check(`${label}：目印が浮き沈みする`, span(ys) > 6, ys.map((v) => v.toFixed(1)).join(' '));
  check(`${label}：目印がふくらんではしぼむ`, span(ks) > 0.06, ks.map((v) => v.toFixed(2)).join(' '));
  const maxK = Math.max(...samples.flat().map((s) => s.k));
  check(`${label}：ふくらみすぎない（1.2倍まで）`, maxK <= 1.2, `max=${maxK.toFixed(3)}`);
}

/**
 * **どこで止めても、画面の中に透明のまま残るものが無いこと。**
 *
 * 送りに合わせた動きで最も起きやすい壊れ方。きっかけが来ないまま、
 * 透明のまま置き去りになる。塊は画面の外へ出ると元へ戻る（次にまた出す
 * ため）ので、下まで送ってからすべてを数えても確かめられない。止まる
 * たびに、画面の中にあるものだけを数える。
 */
async function checkNothingStuck(page, label) {
  const bottom = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const step = await page.evaluate(() => Math.round(window.innerHeight * 0.7));
  const stuck = new Set();
  for (let y = 0; y < bottom + step; y += step) {
    await page.evaluate((yy) => window.scrollTo(0, yy), Math.min(y, bottom));
    /* 一覧は最後の1つが 1.2秒 遅れて出はじめ、1秒かけて出る。出そろうまで待つ */
    await page.waitForTimeout(2400);
    const found = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-anime] > *, .split, .split .ch, [data-reveal], .message, .closing__title, .deco [data-depth], .footer-pin, .ln__in',
        ),
      ]
        .filter((el) => getComputedStyle(el).display !== 'none')
        /* 閉じたよくある質問の答えは、見えていない（開くと出る。checkLines で見る） */
        .filter((el) => !el.closest('details:not([open])'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const h = window.innerHeight;
          return r.width > 0 && r.top >= h * 0.05 && r.bottom <= h * 0.8 && r.left >= 0 && r.right <= window.innerWidth;
        })
        .filter((el) => Number(getComputedStyle(el).opacity) < 0.95 || getComputedStyle(el).visibility === 'hidden')
        .map((el) => `${el.className || el.tagName}「${el.textContent.trim().slice(0, 10)}」@${Math.round(window.scrollY)}`),
    );
    found.forEach((f) => stuck.add(f));
  }
  check(
    `${label}：どこで止めても、画面の中に見えないまま残るものが無い`,
    stuck.size === 0,
    [...stuck].slice(0, 8).join(' / '),
  );
}

/* ---------------------------------------------------------------------------
   ご指示（2026-09-20）の動きを確かめる手立て
   --------------------------------------------------------------------------- */

/** カーソルが地図の目印の形で、押せるものの上では別の目印になるか */
async function checkCursor(page, label) {
  const c = await page.evaluate(() => ({
    body: getComputedStyle(document.body).cursor,
    text: getComputedStyle(document.querySelector('.message__lead')).cursor,
    link: getComputedStyle(document.querySelector('.pill')).cursor,
    faq: getComputedStyle(document.querySelector('.qa summary')).cursor,
  }));
  /* 押す位置は、上の先（14, 2） */
  const pin = (v) => v.startsWith('url("data:image/svg+xml') && /\) 14 2, (auto|pointer)$/.test(v);
  check(`${label}：カーソルが地図の目印の形`, pin(c.body) && pin(c.text), c.body.slice(-60));
  check(
    `${label}：押せるものの上では、別の色の目印（押せると分かる）`,
    pin(c.link) && pin(c.faq) && c.link !== c.body && c.link.endsWith('pointer'),
    c.link.slice(-40),
  );

  /*
    **上下を返した形（先が上）で、その先が押す位置か。** 絵を実際に描いて
    測る。上の方が細く（先）、下の方が太い（丸み）こと。押す位置の点が
    目印の中にあること（外にあると、押したつもりの位置とずれる）。
  */
  for (const [name, v] of [['ふだん', c.body], ['押せるもの', c.link]]) {
    const shape = await page.evaluate(async (css) => {
      const img = new Image();
      img.src = css.match(/url\("([^"]+)"\)/)[1];
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 28;
      canvas.height = 36;
      const g = canvas.getContext('2d');
      g.drawImage(img, 0, 0, 28, 36);
      const d = g.getImageData(0, 0, 28, 36).data;
      const width = (y) => [...Array(28).keys()].filter((x) => d[(y * 28 + x) * 4 + 3] > 128).length;
      return { top: width(6), bottom: width(26), hot: d[(3 * 28 + 14) * 4 + 3] };
    }, v);
    check(
      `${label}：カーソル（${name}）は上下を返した形で、上の先が押す位置`,
      shape.top < shape.bottom && shape.hot > 128,
      JSON.stringify(shape),
    );
  }
}

/**
 * 押した位置に、赤い輪が3つ広がる。
 * 輪の動きは短い（0.7秒）ため、途中で止めて測る（止めずに測ると、測る
 * あいだに終わってしまう）。
 */
async function checkClickRings(page, label) {
  const at = await page.evaluate(() => ({ x: Math.round(innerWidth * 0.8), y: Math.round(innerHeight * 0.72) }));
  const freeze = (ms) =>
    page.evaluate((t) => {
      const rings = [...document.querySelectorAll('.click-ring')];
      rings.forEach((r) =>
        r.getAnimations().forEach((a) => {
          a.pause();
          a.currentTime = t;
        }),
      );
      return rings.map((r) => {
        const b = r.getBoundingClientRect();
        const cs = getComputedStyle(r);
        return {
          cx: b.left + b.width / 2,
          cy: b.top + b.height / 2,
          w: b.width,
          o: Number(cs.opacity),
          color: cs.borderTopColor,
          events: cs.pointerEvents === 'none' && getComputedStyle(r.parentElement).pointerEvents === 'none',
        };
      });
    }, ms);

  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  const early = await freeze(200);
  const later = await freeze(450);
  await page.mouse.up();
  check(`${label}：押すと、輪が3つ出る`, early.length === 3, `${early.length} 個`);
  check(
    `${label}：輪は、押した位置が中心`,
    early.every((r) => Math.abs(r.cx - at.x) <= 1.5 && Math.abs(r.cy - at.y) <= 1.5),
    JSON.stringify(early.map((r) => [Math.round(r.cx), Math.round(r.cy)])),
  );
  check(`${label}：輪は赤`, early.every((r) => r.color === 'rgb(229, 36, 27)'), early[0]?.color);
  check(
    `${label}：輪は少しずつ遅れて広がり、大きさの違う3重になる`,
    early.length === 3 && early[0].w > early[1].w && early[1].w > early[2].w,
    early.map((r) => Math.round(r.w)).join(' > '),
  );
  check(
    `${label}：輪は広がりながら薄れる`,
    later.every((r, i) => r.w > early[i].w) && later[0].o < early[0].o,
    JSON.stringify({ w: later.map((r) => Math.round(r.w)), o: later.map((r) => r.o.toFixed(2)) }),
  );
  check(`${label}：輪は押すのを邪魔しない（押せないもの）`, early.every((r) => r.events));

  /* 止めずに押す。輪は自然に消え、残らない */
  await page.evaluate(() =>
    document.querySelectorAll('.click-ring').forEach((r) => r.getAnimations().forEach((a) => a.play())),
  );
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(1400);
  const left = await page.evaluate(() => document.querySelectorAll('.click-ring').length);
  check(`${label}：輪は消えて、残らない`, left === 0, `残り ${left}`);
}

/**
 * 最初の画面を、開いた直後から 12秒ほど見続ける。標語の文字と、問いかけの
 * 打ち込みと、答えの出方を、同じ時間の並びで取る。
 */
async function watchHero(page) {
  const t0 = Date.now();
  const out = [];
  while (Date.now() - t0 < 12000) {
    const s = await page.evaluate(() => {
      const ch = [...document.querySelectorAll('.hero__tagline .ch')];
      const pick = ch.length ? [ch[0], ch[Math.floor(ch.length / 2)], ch[ch.length - 1]] : [];
      const read = (el) => {
        const cs = getComputedStyle(el);
        const m = cs.transform === 'none' ? [1, 0] : cs.transform.slice(7, -1).split(',').map(Number);
        return { o: Number(cs.opacity), turned: Math.abs(m[1]) > 0.2, still: cs.transform === 'none' || (m[0] === 1 && m[1] === 0) };
      };
      return {
        chars: ch.length,
        tag: pick.map(read),
        typed: document.querySelectorAll('.hero__question .tw.is-on').length,
        total: document.querySelectorAll('.hero__question .tw').length,
        carets: document.querySelectorAll('.hero__question .tw.is-caret').length,
        answer: Number(getComputedStyle(document.querySelector('.hero__answer')).opacity),
      };
    });
    out.push({ t: Date.now() - t0, ...s });
    await page.waitForTimeout(60);
  }
  return out;
}

/** 標語：両脇から回り込み、出そろって3秒とどまり、引っ込み、また出る */
function checkTagline(frames, label) {
  check(`${label}：標語を1文字ずつに分けている（16文字）`, frames[0].chars === 16, `chars=${frames[0].chars}`);
  const turning = frames.some((f) => f.tag.some((c) => c.o > 0.1 && c.turned));
  check(`${label}：標語の文字が、回りながら入ってくる`, turning);

  /* 3文字（左端・中央・右端）とも、出そろって止まっているあいだ */
  const all = (f) => f.tag.length === 3 && f.tag.every((c) => c.o > 0.99 && c.still);
  const none = (f) => f.tag.length === 3 && f.tag.every((c) => c.o < 0.05);
  let runStart = -1;
  let hold = 0;
  let holdEnd = -1;
  for (const f of frames) {
    if (all(f)) {
      if (runStart < 0) runStart = f.t;
    } else if (runStart >= 0) {
      if (f.t - runStart > hold) {
        hold = f.t - runStart;
        holdEnd = f.t;
      }
      runStart = -1;
    }
  }
  /* 3秒とどまる。測りは1コマ（最大 0.1秒）ずつで、引っ込み始めも端の文字の
     ずらしのぶん遅れる。3秒に対して 0.3〜1秒の幅を見る */
  check(`${label}：標語は出そろって、3秒とどまる`, hold >= 2700 && hold <= 4000, `${hold}ms`);
  const gone = frames.find((f) => f.t > holdEnd && none(f));
  check(`${label}：3秒たつと、引っ込む`, Boolean(gone), gone ? `${gone.t}ms` : '引っ込まない');
  const again = gone && frames.some((f) => f.t > gone.t && all(f));
  check(`${label}：引っ込んだあと、また現れる（くり返す）`, Boolean(again));
}

/** 問いかけ：1文字ずつ打ち込み、打ち終えてから答えが出る */
function checkTyping(frames, label) {
  const total = frames[0].total;
  check(`${label}：問いかけを1文字ずつに分けている`, total >= 70, `total=${total}`);
  const typed = frames.map((f) => f.typed);
  const rising = typed.every((n, i) => i === 0 || n >= typed[i - 1]);
  const partial = new Set(typed.filter((n) => n > 0 && n < total)).size;
  check(
    `${label}：問いかけが1文字ずつ打たれていく`,
    rising && partial >= 20 && typed[typed.length - 1] === total,
    `途中の段階 ${partial}、最後 ${typed[typed.length - 1]}/${total}`,
  );
  check(
    `${label}：打っている位置に縦棒が1本出る`,
    frames.some((f) => f.typed > 0 && f.typed < total && f.carets === 1),
  );
  const early = frames.filter((f) => f.typed < total).map((f) => f.answer);
  check(
    `${label}：打ち終えるまで、答えは出ない`,
    early.every((o) => o < 0.05),
    `答えの濃さ max=${Math.max(...early).toFixed(2)}`,
  );
  check(`${label}：打ち終えると、答えが出る`, frames[frames.length - 1].answer > 0.95);
}

/**
 * 文を1行ずつ出す。
 *   * 行の分け方：組み替えた1行が、本当に1行に収まっている
 *   * 文字が変わっていない（元の HTML と突き合わせる。太字も）
 *   * 1行ずつずれて出る。上へ戻したときも出る
 */
async function checkLines(page, label) {
  const shape = await page.evaluate(async () => {
    const lines = [...document.querySelectorAll('.ln')].filter((ln) => ln.getClientRects().length);
    const tall = lines.filter((ln) => ln.getBoundingClientRect().height > parseFloat(getComputedStyle(ln).lineHeight) * 1.5);
    const src = new DOMParser().parseFromString(await (await fetch(location.href)).text(), 'text/html');
    const path = (el) => {
      const steps = [];
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        steps.unshift(`:scope > :nth-child(${[...n.parentElement.children].indexOf(n) + 1})`);
      }
      return steps;
    };
    const find = (steps) => steps.reduce((node, s) => node?.querySelector(s), src.body);
    const norm = (t) => t.replace(/\s+/g, '');
    const blocks = [...document.querySelectorAll('.lines')].map((b) => b.parentElement);
    const changed = blocks.filter((el) => {
      const orig = find(path(el));
      if (!orig) return true;
      const bold = (root) => norm([...root.querySelectorAll('strong')].map((s) => s.textContent).join(''));
      return norm(orig.textContent) !== norm(el.textContent) || bold(orig) !== bold(el);
    });
    return {
      blocks: blocks.length,
      lines: lines.length,
      tall: tall.map((ln) => ln.textContent.trim().slice(0, 16)),
      changed: changed.map((el) => el.textContent.trim().slice(0, 16)),
    };
  });
  check(`${label}：文を行に組み替えている`, shape.blocks >= 30 && shape.lines > shape.blocks, JSON.stringify({ b: shape.blocks, l: shape.lines }));
  check(`${label}：組み替えた行は、どれも1行に収まっている`, shape.tall.length === 0, shape.tall.join(' / '));
  check(`${label}：組み替えても、文字と太字は元のまま`, shape.changed.length === 0, shape.changed.join(' / '));

  /* 1行ずつずれて出る。下へ送って下から入れる */
  const sel = '.case__note';
  const y = await page.evaluate(
    (s) => document.querySelector(s).getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.55,
    sel,
  );
  /* 送ってから、1コマごとに各行の濃さを取る（ページの中で。sampleFade と同じ理由） */
  const sample = (to) =>
    page.evaluate(
      async ({ s, to: yy }) => {
        window.scrollTo(0, yy);
        const out = [];
        const t0 = performance.now();
        while (performance.now() - t0 < 800) {
          await new Promise(requestAnimationFrame);
          out.push([...document.querySelectorAll(`${s} .ln__in`)].map((el) => Number(getComputedStyle(el).opacity)));
        }
        await new Promise((done) => setTimeout(done, 1500));
        const end = [...document.querySelectorAll(`${s} .ln__in`)].every((el) => Number(getComputedStyle(el).opacity) > 0.98);
        return { out: out.filter((_, i) => i % 3 === 0), end };
      },
      { s: sel, to },
    );
  const staggered = (r) => r.out.some((o) => o.length >= 2 && o[0] - o[o.length - 1] > 0.3);

  await page.evaluate((yy) => window.scrollTo(0, Math.max(0, yy - window.innerHeight * 1.5)), y);
  await page.waitForTimeout(400);
  let r = await sample(y);
  check(`${label}：下へ送ると、文が1行ずつ出る`, staggered(r) && r.end, JSON.stringify(r.out.slice(0, 6)));

  /* 画面の上へ出してから、上へ戻して上から入れる */
  await page.evaluate((yy) => window.scrollTo(0, yy + window.innerHeight * 2), y);
  await page.waitForTimeout(500);
  const reset = await page.evaluate(
    (s) => [...document.querySelectorAll(`${s} .ln__in`)].every((el) => Number(getComputedStyle(el).opacity) < 0.02),
    sel,
  );
  check(`${label}：画面の上へ出た文は、次に備えて元へ戻る`, reset);
  r = await sample(y);
  check(`${label}：上へ戻しても、文が1行ずつ出る`, staggered(r) && r.end, JSON.stringify(r.out.slice(0, 6)));

  /* よくある質問：開くと、答えが1行ずつ出る（閉じているあいだは測れないため、開いたときに組む） */
  const qa = page.locator('.qa').nth(1);
  await qa.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await qa.locator('summary').click();
  const opened = [];
  for (let i = 0; i < 14; i++) {
    opened.push(
      await qa.evaluate((d) => [...d.querySelectorAll('p .ln__in')].map((el) => Number(getComputedStyle(el).opacity))),
    );
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(1500);
  const shown = await qa.evaluate((d) =>
    [...d.querySelectorAll('p .ln__in')].every((el) => Number(getComputedStyle(el).opacity) > 0.98),
  );
  /* 2行の答えもあるため、差は 0.15 で見る（1行ずつずれていれば足りる） */
  const oneByOne = opened.some((o) => o.length >= 2 && o[0] - o[o.length - 1] > 0.15);
  check(`${label}：よくある質問を開くと、答えが1行ずつ出る`, oneByOne && shown, JSON.stringify(opened.slice(0, 5)));
}

/** 緑の帯の縁（上下）が、3枚の波で流れているか */
async function checkSea(page, label) {
  const a = await page.evaluate(() =>
    [...document.querySelectorAll('.sea__layer')].map((l) => ({
      running: l.getAnimations().filter((x) => x.playState === 'running').length,
      tf: getComputedStyle(l).transform,
    })),
  );
  await page.waitForTimeout(600);
  const b = await page.evaluate(() => [...document.querySelectorAll('.sea__layer')].map((l) => getComputedStyle(l).transform));
  check(`${label}：緑の帯の上下の縁に、波が3枚ずつある`, a.length === 6);
  check(
    `${label}：波が流れ、揺れている`,
    a.every((l, i) => l.running === 2 && l.tf !== b[i]),
    JSON.stringify(a.map((l) => l.running)),
  );
}

/**
 * 見出しと数字：下へ送ると弾み、目印の砂ぼこりが舞って消える。
 * 上へ戻したときは弾まない。弾んでも、画面は横に揺れない。
 */
async function checkPop(page, label) {
  const sel = '#area-title';
  const y = await page.evaluate(
    (s) => document.querySelector(s).getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.6,
    sel,
  );
  const watch = async (ms) => {
    const out = [];
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      out.push(
        await page.evaluate((s) => {
          const h = document.querySelector(s);
          return {
            k: Number(getComputedStyle(h).scale) || 1,
            n: Number(getComputedStyle(h.querySelector('.count')).scale) || 1,
            dust: document.querySelectorAll('.dust').length,
            over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        }, sel),
      );
      await page.waitForTimeout(40);
    }
    return out;
  };

  const vh = await page.evaluate(() => window.innerHeight);

  /* 見出しを画面の下の外に置いてから、下へ少しずつ送って入れる */
  await page.evaluate((yy) => window.scrollTo(0, Math.max(0, yy)), y - vh);
  await page.waitForTimeout(3500); /* ほかの見出しの砂ぼこりが消えるのを待つ */
  for (let yy = y - 400; yy <= y; yy += 80) {
    await page.evaluate((v) => window.scrollTo(0, v), yy);
    await page.waitForTimeout(30);
  }
  const down = await watch(1900);
  const kMax = Math.max(...down.map((f) => f.k));
  const nMax = Math.max(...down.map((f) => f.n));
  const dustMax = Math.max(...down.map((f) => f.dust));
  check(`${label}：下へ送ると、見出しが一瞬大きくなる`, kMax >= 1.1, `max=${kMax.toFixed(3)}`);
  check(`${label}：数字（193）も弾む`, nMax >= 1.2, `max=${nMax.toFixed(3)}`);
  check(`${label}：弾んだあと、元の大きさに戻る`, down[down.length - 1].k === 1, `last=${down[down.length - 1].k}`);
  check(`${label}：弾んだとき、目印の砂ぼこりが舞う`, dustMax >= 8, `max=${dustMax}`);
  check(`${label}：弾んでも、画面は横に揺れない`, down.every((f) => f.over <= 0), `max=${Math.max(...down.map((f) => f.over))}px`);
  await page.waitForTimeout(3200);
  const left = await page.evaluate(() => document.querySelectorAll('.dust').length);
  check(`${label}：砂ぼこりは、ゆっくり消えて残らない`, left === 0, `残り ${left}`);

  /* 見出しを画面の上の外へ出してから、上へ戻して上から入れる。弾まない */
  await page.evaluate((yy) => window.scrollTo(0, yy), y + vh * 1.6);
  await page.waitForTimeout(3500);
  for (let yy = y + vh * 1.6; yy >= y; yy -= 80) {
    await page.evaluate((v) => window.scrollTo(0, v), yy);
    await page.waitForTimeout(30);
  }
  const up = await watch(1500);
  check(
    `${label}：上へ戻したときは、弾まない`,
    Math.max(...up.map((f) => f.k)) <= 1.001,
    `max=${Math.max(...up.map((f) => f.k)).toFixed(3)}`,
  );
}

/** 実例の端末（アプリの立ち上がり）の様子 */
/**
 * 案内役の写真（ご指示 2026-09-21）。
 * 広い画面では余白に3枚（最初の画面・対応エリアの左右）、よくあるご質問の
 * ものはどの幅でも出す。**本文に掛からないこと**と、横にはみ出さないことを見る。
 *
 * **それぞれ、その写真が見えている場所で測る。** 塊は画面の外へ出ると元へ
 * 戻る作りなので、別の節まで送ってから数えると、出ていないように見える。
 */
async function checkGuide(page, label, wide) {
  const look = (sel) =>
    page.evaluate((s2) => {
      const el = document.querySelector(s2);
      const cs = getComputedStyle(el);
      const img = el.querySelector('img');
      return {
        out: cs.display === 'none',
        seen: cs.display !== 'none' && Number(cs.opacity) > 0.9,
        loaded: img.complete && img.naturalWidth > 0,
      };
    }, sel);
  const to = async (sel) => {
    await page.evaluate((s2) => {
      const box = document.querySelector(s2).getBoundingClientRect();
      window.scrollTo(0, box.top + window.scrollY - 60);
    }, sel);
    await page.waitForTimeout(2200);
  };

  /* よくあるご質問（どの幅でも出す） */
  await to('#faq');
  const faq = await look('.guide--faq');
  check(`${label}：よくあるご質問に、説明している写真が出ている`, faq.seen && faq.loaded, JSON.stringify(faq));

  /* 対応エリアの左右 */
  await to('#area');
  const left = await look('.guide--area-left');
  const right = await look('.guide--area-right');
  const gaps = wide
    ? await page.evaluate(() => {
        /* 二つの箱の、横の空き。0 より大きければ掛かっていない */
        const gap = (a, b) => {
          const x = document.querySelector(a).getBoundingClientRect();
          const y = document.querySelector(b).getBoundingClientRect();
          return Math.round(Math.max(x.left, y.left) - Math.min(x.right, y.right));
        };
        return {
          left: gap('.guide--area-left', '.chips'),
          leftNotice: gap('.guide--area-left', '.notice-box'),
          right: gap('.guide--area-right', '.chips'),
          rightNotice: gap('.guide--area-right', '.notice-box'),
        };
      })
    : null;

  /* 最初の画面（先頭へ戻して見る） */
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1600);
  const hero = await look('.guide--hero');
  const heroGap = wide
    ? await page.evaluate(() => {
        const x = document.querySelector('.guide--hero').getBoundingClientRect();
        const y = document.querySelector('.hero__answer').getBoundingClientRect();
        return Math.round(Math.max(x.left, y.left) - Math.min(x.right, y.right));
      })
    : null;

  if (wide) {
    check(
      `${label}：最初の画面と対応エリアの余白にも、案内役が出ている`,
      [hero, left, right].every((g) => g.seen && g.loaded),
      JSON.stringify({ hero, left, right }),
    );
    check(
      `${label}：写真が本文に掛からない`,
      heroGap >= 8 && Object.values(gaps).every((g) => g >= 8),
      JSON.stringify({ hero: heroGap, ...gaps }),
    );
  } else {
    check(
      `${label}：余白が無いので、脇の3枚は出さない`,
      hero.out && left.out && right.out,
      JSON.stringify({ hero, left, right }),
    );
  }
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${label}：写真を入れても、横にはみ出さない`, over <= 0, `${over}px`);
}

const phoneState = (page) =>
  page.evaluate(() => {
    const p = document.getElementById('case-phone');
    const v = p.querySelector('.phone__video');
    const boot = getComputedStyle(p.querySelector('.phone__boot'));
    return {
      logo: p.classList.contains('is-logo'),
      app: p.classList.contains('is-app'),
      src: (v.getAttribute('src') || '').split('/').pop(),
      paused: v.paused,
      /* 立ち上がりの層が、画面の絵を覆っているか */
      boot: boot.visibility === 'visible' && Number(boot.opacity) > 0.5,
    };
  });

/** 実例の端末が、画面の真ん中に来るまで送る */
const toPhone = (page) =>
  page.evaluate(() => {
    const r = document.getElementById('case-phone').getBoundingClientRect();
    window.scrollTo(0, r.top + window.scrollY + r.height / 2 - window.innerHeight / 2);
  });

try {
  console.log(`紹介サイトの検査: ${BASE}\n`);

  /* =================================================================== */
  console.log('--- 開いたとき ---');
  /* =================================================================== */
  {
    /* ご指示（2026-09-20）「開いたときに動画を流すのはやめる」 */
    const { ctx, page, errors } = await fresh();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const s = await page.evaluate(() => ({
      overlay: document.querySelectorAll('#film, .film').length,
      playing: [...document.querySelectorAll('video')].filter((v) => !v.paused).length,
      replay: document.querySelectorAll('#replay, .replay').length,
      ready: document.querySelector('.hero').classList.contains('is-ready'),
      locked: getComputedStyle(document.documentElement).overflow === 'hidden',
      header: Number(getComputedStyle(document.getElementById('site-header')).opacity),
    }));
    check('開いたときに、全画面の動画を流さない', s.overlay === 0 && s.playing === 0, JSON.stringify(s));
    check('開くとすぐ、最初の画面が出る（待たせない）', s.ready && !s.locked && s.header > 0.95, JSON.stringify(s));
    check('「動画をもう一度見る」は外した', s.replay === 0, JSON.stringify(s));

    /*
      **開き直すと、先頭から出ること。** ブラウザが元の位置へ戻そうとして、
      先頭にいたのに 176px 下へずれて開いていた（最初の画面が半分消える）。
      毎回ではなく、書体の届く早さ次第で起きたり起きなかったりした。
      途中まで送ってから開き直しても、先頭から出す。
    */
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const reloadedAt = await page.evaluate(() => window.scrollY);
    check('開き直すと、先頭から出る', reloadedAt === 0, `scrollY=${reloadedAt}`);
    check('開いたとき、画面に誤りが出ない', errors.length === 0, errors.join(' / '));
    await ctx.close();
  }

  {
    /*
      **動きを減らす設定には、いまは従わない**（main.js の FOLLOW_REDUCED_MOTION）。
      Windows で「アニメーションを表示する」を切ったパソコンもこの設定に当たり、
      従うと、そのパソコンでは動きを確かめられない。
    */
    const { ctx, page } = await fresh({ reducedMotion: 'reduce' });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const m = await page.evaluate(() => ({
      motion: document.documentElement.classList.contains('motion'),
      calm: document.documentElement.classList.contains('calm'),
    }));
    check('動きを減らす設定でも、動きの部品が働く（いまは設定に従わない）', m.motion && !m.calm, JSON.stringify(m));
    await ctx.close();
  }

  /* =================================================================== */
  console.log('\n--- 実例の端末（アプリの立ち上がり） ---');
  /* =================================================================== */
  {
    /*
      ご指示（2026-09-20）「端末の絵の位置まで送ったら、立ち上がりの動画を
      流し、いまの画面を見せる」。アプリの起動と同じ順（動画3本 → ロゴ2秒 →
      画面）で、17秒ほどかかる。
    */
    const { ctx, page, errors } = await fresh();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    let s = await phoneState(page);
    check('端末が見えるまでは、動画を流さない', s.paused && !s.app && s.boot, JSON.stringify(s));

    await toPhone(page);
    await page.waitForTimeout(1200);
    s = await phoneState(page);
    check('端末まで送ると、立ち上がりの動画が流れる', !s.paused && s.src === '1.mp4' && s.boot, JSON.stringify(s));

    /* 立ち上がりの層は、画面の絵をちょうど覆う（1px 大きく、枠からははみ出さない） */
    const fit = await page.evaluate(() => {
      const p = document.getElementById('case-phone');
      const a = p.querySelector('.phone__boot').getBoundingClientRect();
      const b = p.querySelector(':scope > img').getBoundingClientRect();
      return {
        left: +(b.left - a.left).toFixed(1),
        top: +(b.top - a.top).toFixed(1),
        right: +(a.right - b.right).toFixed(1),
        bottom: +(a.bottom - b.bottom).toFixed(1),
      };
    });
    check('動画は、端末の画面をちょうど覆う', Object.values(fit).every((d) => d >= 0 && d <= 2.5), JSON.stringify(fit));

    const seen = new Set();
    let sawLogo = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      s = await phoneState(page);
      if (s.src) seen.add(s.src);
      if (s.logo && !s.app) sawLogo = true;
      if (s.app) break;
      await page.waitForTimeout(250);
    }
    check('3本が順に流れる', ['1.mp4', '2.mp4', '3.mp4'].every((f) => seen.has(f)), [...seen].join(','));
    check('動画のあと、ロゴが出る（アプリと同じ）', sawLogo);
    await page.waitForTimeout(1000);
    s = await phoneState(page);
    check('終わると、いまの画面（浦安ブライトンホテル）が見える', s.app && !s.boot && s.paused, JSON.stringify(s));

    /* 画面の外へ出して戻すと、はじめから流れる */
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);
    s = await phoneState(page);
    check('画面の外へ出ると、最初に戻る', !s.app && s.paused && s.boot && s.src === '1.mp4', JSON.stringify(s));
    await toPhone(page);
    await page.waitForTimeout(1200);
    s = await phoneState(page);
    check('また見えると、はじめから流れる', !s.paused && s.src === '1.mp4', JSON.stringify(s));

    /* 途中で離れると止まる。見えないところで流し続けない */
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);
    s = await phoneState(page);
    check('途中で離れると、動画は止まる', s.paused, JSON.stringify(s));
    check('端末の動画のあいだ、画面に誤りが出ない', errors.length === 0, errors.join(' / '));
    await ctx.close();
  }

  {
    /* スマートフォンの幅でも、同じように流れ、画面をちょうど覆う */
    const { ctx, page } = await fresh({ viewport: { width: 390, height: 844 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await toPhone(page);
    await page.waitForTimeout(1500);
    const s = await phoneState(page);
    const fit = await page.evaluate(() => {
      const p = document.getElementById('case-phone');
      const a = p.querySelector('.phone__boot').getBoundingClientRect();
      const b = p.querySelector(':scope > img').getBoundingClientRect();
      return [b.left - a.left, b.top - a.top, a.right - b.right, a.bottom - b.bottom].map((d) => +d.toFixed(1));
    });
    check(
      'スマートフォン：端末まで送ると動画が流れ、画面をちょうど覆う',
      !s.paused && s.src === '1.mp4' && fit.every((d) => d >= 0 && d <= 2.5),
      JSON.stringify({ s, fit }),
    );
    await ctx.close();
  }

  {
    /* 自動再生を断る環境（省電力の設定など）。黒い画面のまま待たせない */
    const { ctx, page } = await fresh();
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('refused', 'NotAllowedError'));
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await toPhone(page);
    await page.waitForTimeout(1500);
    const s = await phoneState(page);
    check('自動再生を断られても、待たせずに画面を見せる', s.app && !s.boot, JSON.stringify(s));
    await ctx.close();
  }

  {
    /* 動画が読めない（電波が切れた・置き場所の誤り） */
    const { ctx, page } = await fresh();
    await page.route('**/*.mp4', (r) => r.abort());
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await toPhone(page);
    await page.waitForTimeout(2500);
    const s = await phoneState(page);
    check('動画が読めなくても、画面を見せる', s.app && !s.boot, JSON.stringify(s));
    await ctx.close();
  }

  /* =================================================================== */
  console.log('\n--- 文面とリンク ---');
  /* =================================================================== */
  {
    const { ctx, page, errors } = await fresh();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    /* 問いかけは1文字ずつ打たれ、答えは打ち終えてから出る。出そろってから読む */
    for (let t = 0; t < 40; t++) {
      await page.waitForTimeout(300);
      const done = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.hero__answer')).opacity) > 0.95);
      if (done) break;
    }
    await page.waitForTimeout(1500);

    const heroText = (await page.locator('.hero__copy').innerText()).replace(/\s+/g, '');
    for (const [i, t] of CLIENT_TEXT.entries()) {
      check(`発注元の文面 ${i + 1} が、そのまま載っている`, heroText.includes(t), heroText.slice(0, 160));
    }
    check('「𠮟」が別の字に置き換わっていない', heroText.includes('𠮟'));

    const apps = await page.locator('a[data-app]').evaluateAll((as) => as.map((a) => a.href));
    check(
      `「アプリを開く」${apps.length} か所が、すべて同じ住所`,
      apps.length >= 4 && apps.every((h) => h === APP_URL),
      apps.join(' '),
    );

    const broken = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="#"]')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h.length > 1 && !document.getElementById(h.slice(1))),
    );
    check('ページ内の飛び先が、すべてある', broken.length === 0, broken.join(' '));

    /* 遅れて読む画像も含めて、全部を画面に入れてから確かめる */
    const h = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < h; y += 600) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => {
      document.getElementById('cards').scrollLeft = 99999;
    });
    await page.waitForTimeout(1500);
    const imgs = await page.evaluate(() =>
      [...document.images].map((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 })),
    );
    const bad = imgs.filter((i) => !i.ok);
    check(`画像 ${imgs.length} 枚が、すべて読める`, bad.length === 0, bad.map((b) => b.src).join(' '));

    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    const ogRes = await page.request.get(new URL(og, BASE).href);
    check('共有用の画像がある', ogRes.ok(), og);

    check('画面に誤りが出ない', errors.length === 0, errors.join(' / '));
    await ctx.close();
  }

  /* =================================================================== */
  console.log('\n--- 崩れ ---');
  /* =================================================================== */
  for (const width of [320, 390, 768, 1024, 1440]) {
    const { ctx, page } = await fresh({ viewport: { width, height: 844 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`幅 ${width}px で、横にはみ出さない`, over <= 0, `${over}px はみ出し`);
    await ctx.close();
  }

  /* =================================================================== */
  console.log('\n--- 操作 ---');
  /* =================================================================== */
  {
    const { ctx, page } = await fresh();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('#features').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    /*
      ご指示（2026-09-21）「カードが左へ流れて、ぐるぐる回るように」
      「上の矢印も効くように」。
    */
    const at = () => page.evaluate(() => document.getElementById('cards').scrollLeft);
    const flowA = await at();
    await page.waitForTimeout(2000);
    const flowB = await at();
    check('横送り：カードが左へ流れ続ける', flowB - flowA > 50, `${Math.round(flowA)} → ${Math.round(flowB)}`);

    /* 一組ぶん進んだところ（つなぎ目）。切れ目なく先頭へつながるか */
    const loop = await page.evaluate(() => {
      const c = document.getElementById('cards');
      return c.children[c.children.length / 2].offsetLeft - c.children[0].offsetLeft;
    });
    await page.evaluate((l) => {
      document.getElementById('cards').scrollLeft = l - 40;
    }, loop);
    /* 触ったあとは少し止まる。流れに戻るまで待つ */
    await page.waitForTimeout(2600);
    const wrapped = await at();
    const gaps = await page.evaluate(() => {
      const cs = [...document.querySelectorAll('#cards .card')].map((el) => el.getBoundingClientRect());
      const out = [];
      for (let i = 1; i < cs.length; i++) out.push(Math.round(cs[i].left - cs[i - 1].right));
      return out;
    });
    check('横送り：端まで行っても、切れ目なく先頭へつながる', wrapped < loop * 0.5, `つなぎ目 ${loop} → ${Math.round(wrapped)}`);
    check(
      '横送り：つながったところに、すき間ができない',
      gaps.every((g) => Math.abs(g - gaps[0]) <= 1),
      gaps.join(' '),
    );

    /* 矢印。端でも止まらないので、どちらも押せる */
    check(
      '横送り：矢印は、どちらも押せる',
      !(await page.locator('[data-carousel="prev"]').isDisabled()) &&
        !(await page.locator('[data-carousel="next"]').isDisabled()),
    );
    const card = await page.evaluate(() => {
      const c = document.getElementById('cards');
      const gap = parseFloat(getComputedStyle(c).columnGap) || 24;
      return c.querySelector('.card').getBoundingClientRect().width + gap;
    });
    let from = await at();
    await page.locator('[data-carousel="next"]').click();
    await page.waitForTimeout(900);
    let to = await at();
    check('横送り：「次へ」でカード1枚ぶん送られる', to - from > card * 0.7, `${Math.round(to - from)}px / 1枚 ${Math.round(card)}px`);
    from = to;
    await page.locator('[data-carousel="prev"]').click();
    await page.waitForTimeout(900);
    to = await at();
    check('横送り：「前へ」で1枚ぶん戻る', from - to > card * 0.6, `${Math.round(from - to)}px`);

    /* 読んでいるあいだ（触っているあいだ）は止まる */
    await page.locator('#cards').hover();
    await page.waitForTimeout(700);
    const holdA = await at();
    await page.waitForTimeout(1200);
    const holdB = await at();
    check('横送り：触っているあいだは止まる', Math.abs(holdB - holdA) <= 2, `${Math.round(holdA)} → ${Math.round(holdB)}`);
    await page.mouse.move(10, 10);

    const qa = page.locator('.qa').first();
    await qa.locator('summary').click();
    check('よくある質問：押すと答えが開く', await qa.evaluate((d) => d.open));
    await ctx.close();
  }

  {
    const { ctx, page } = await fresh({ viewport: { width: 390, height: 844 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const button = page.locator('#menu-button');
    check('スマートフォンでは、メニューの釦が出る', await button.isVisible());
    await button.click();
    await page.waitForTimeout(500);
    check(
      'メニューを開くと、項目が見える',
      (await button.getAttribute('aria-expanded')) === 'true' &&
        (await page.getByRole('link', { name: 'できること' }).first().isVisible()),
    );
    /*
      **画面いっぱいに開いていること。** ヘッダーに backdrop-filter を掛けて
      いたため、メニューの基準がヘッダーの箱（76px）になり、項目が画面の
      外へはみ出していた（2026-09-19 に直した）。見えるかどうかだけでは
      気づけない。高さで見る。
    */
    const menuBox = await page.evaluate(() => ({
      h: document.getElementById('site-nav').getBoundingClientRect().height,
      vh: window.innerHeight,
    }));
    check('メニューが、画面いっぱいに開く', menuBox.h >= menuBox.vh - 1, JSON.stringify(menuBox));
    check('メニューを開いても、ロゴが見えている', await page.locator('.site-header__logo img').isVisible());

    await page
      .getByRole('link', { name: 'できること' })
      .first()
      .click({ timeout: 5000 })
      .catch(() => undefined);
    await page.waitForTimeout(1600);
    check(
      '項目を押すと、メニューが閉じてその場所へ移る',
      (await button.getAttribute('aria-expanded')) === 'false' &&
        (await page.evaluate(() => Math.abs(document.getElementById('features').getBoundingClientRect().top) < 140)),
    );
    await ctx.close();
  }

  /* =================================================================== */
  console.log('\n--- 動き（参考サイトに倣ったもの） ---');
  /* =================================================================== */
  for (const [label, viewport] of [
    ['パソコン', { width: 1440, height: 900 }],
    ['スマートフォン', { width: 390, height: 844 }],
  ]) {
    const { ctx, page, errors } = await fresh({ viewport });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    /* 問いかけを打ち終え、答えが出るまで待つ（数秒かかる） */
    for (let t = 0; t < 40; t++) {
      await page.waitForTimeout(300);
      const done = await page.evaluate(
        () => Number(getComputedStyle(document.querySelector('.hero__answer')).opacity) > 0.95,
      );
      if (done) break;
    }
    await page.waitForTimeout(1200);

    const m = await page.evaluate(() => ({
      motion: document.documentElement.classList.contains('motion'),
      lenis: document.documentElement.classList.contains('lenis'),
    }));
    check(`${label}：動きの部品が働いている`, m.motion && m.lenis, JSON.stringify(m));

    const heroShown = await page.evaluate(() =>
      [...document.querySelectorAll('.hero .reveal, .hero__emblem, .hero__wordmark')]
        .filter((el) => !el.hidden)
        .every((el) => Number(getComputedStyle(el).opacity) > 0.95),
    );
    check(`${label}：最初の画面が出そろう`, heroShown);

    /* 先頭では、目印は元の場所にある */
    let f = await page.evaluate(() => ({
      flyer: getComputedStyle(document.getElementById('flyer')).visibility,
      emblem: getComputedStyle(document.querySelector('.hero__emblem img')).visibility,
    }));
    check(`${label}：先頭では、目印はロゴの中にある`, f.flyer === 'hidden' && f.emblem === 'visible', JSON.stringify(f));

    /* 「車寄せナビとは」の絵の位置まで送ると、目印がそこへ収まっている */
    const endY = await page.evaluate(() => {
      const r = document.getElementById('message-mark').getBoundingClientRect();
      return Math.round(r.top + window.scrollY + r.height / 2 - window.innerHeight / 2) + 40;
    });
    for (let y = 0; y <= endY; y += 120) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(60);
    }
    await page.evaluate((yy) => window.scrollTo(0, yy), endY);
    await page.waitForTimeout(2200);
    f = await page.evaluate(() => {
      const a = document.getElementById('flyer').getBoundingClientRect();
      const b = document.getElementById('message-mark').getBoundingClientRect();
      return {
        dx: Math.round(Math.abs(a.left - b.left)),
        dy: Math.round(Math.abs(a.top - b.top)),
        dw: Math.round(Math.abs(a.width - b.width)),
        icon: Number(getComputedStyle(document.querySelector('.flyer__icon')).opacity),
        emblem: getComputedStyle(document.querySelector('.hero__emblem img')).visibility,
      };
    });
    check(
      `${label}：目印が、次の節の絵の位置へ収まる`,
      f.dx <= 6 && f.dy <= 6 && f.dw <= 6 && f.icon > 0.95 && f.emblem === 'hidden',
      JSON.stringify(f),
    );

    /* 先頭へ戻すと、目印はロゴの中へ戻る */
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1800);
    f = await page.evaluate(() => ({
      flyer: getComputedStyle(document.getElementById('flyer')).visibility,
      emblem: getComputedStyle(document.querySelector('.hero__emblem img')).visibility,
    }));
    check(`${label}：先頭へ戻すと、目印はロゴの中へ戻る`, f.flyer === 'hidden' && f.emblem === 'visible', JSON.stringify(f));

    /* ヘッダー：下へ送ると隠れ、上へ戻すと出る */
    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 1800));
    await page.waitForTimeout(900);
    const hidden = await page.evaluate(() => document.getElementById('site-header').classList.contains('is-hidden'));
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(900);
    const back = await page.evaluate(() => !document.getElementById('site-header').classList.contains('is-hidden'));
    check(`${label}：下へ送るとヘッダーが隠れ、上へ戻すと出る`, hidden && back, `hidden=${hidden} back=${back}`);

    await checkFades(page, label, true);
    await checkPins(page, label);
    /* 下の端で終わる。このあとの UP の検査は、下にいることを前提にしている */
    await checkNothingStuck(page, label);

    /*
      **飾りの目印が、そもそも出ていること。** 上の検査は display:none を
      数えない。以前、狭い画面向けの指定がページ全体の目印を消していたが、
      上の検査では気づけなかった。
    */
    const decoShown = await page.evaluate(() =>
      [...document.querySelectorAll('.deco .pin, .footer-pin')].filter(
        (el) => getComputedStyle(el).display !== 'none',
      ).length,
    );
    const decoAll = await page.evaluate(() => document.querySelectorAll('.deco .pin, .footer-pin').length);
    check(`${label}：帯・締め・フッターの目印が出ている`, decoShown === decoAll && decoAll > 0, `${decoShown}/${decoAll}`);

    /* UP：先頭では出ず、送ると出て、押すと先頭へ戻る */
    const upShown = await page.evaluate(() => document.getElementById('page-up').classList.contains('is-shown'));
    check(`${label}：UP が、送ったあとに出ている`, upShown);
    await page.locator('#page-up').click();
    await page.waitForTimeout(2200);
    const top = await page.evaluate(() => window.scrollY);
    check(`${label}：UP を押すと、先頭へ戻る`, top < 5, `scrollY=${top}`);
    await page.waitForTimeout(400);
    const upGone = await page.evaluate(() => !document.getElementById('page-up').classList.contains('is-shown'));
    check(`${label}：先頭では、UP は出ない`, upGone);

    check(`${label}：動きのあいだ、画面に誤りが出ない`, errors.length === 0, errors.join(' / '));
    await ctx.close();
  }

  /* =================================================================== */
  console.log('\n--- ご指示（2026-09-20）で足した動き ---');
  /* =================================================================== */
  for (const [label, viewport] of [
    ['パソコン', { width: 1440, height: 900 }],
    ['スマートフォン', { width: 390, height: 844 }],
  ]) {
    /*
      **動きを減らす設定のまま見る。** 確認に使うパソコンがこの設定
      （Windows の「アニメーションを表示する」が切ってある）で、そこでも
      同じように動くことを確かめる。
    */
    const { ctx, page, errors } = await fresh({ viewport, reducedMotion: 'reduce' });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const frames = await watchHero(page);
    checkTagline(frames, label);
    checkTyping(frames, label);
    const sr = await page.evaluate(() => document.querySelector('.hero__question .visually-hidden')?.textContent);
    check(`${label}：読み上げでは、問いかけが1文として読まれる`, sr === CLIENT_TEXT[0], sr);

    if (viewport.width > 800) {
      await checkCursor(page, label);
      await checkClickRings(page, label);
    }
    await checkLines(page, label);
    await checkSea(page, label);
    await checkPop(page, label);

    if (viewport.width > 800) {
      /* 幅を変えると、行を組み直す。組み直しても、どの行も1行に収まる */
      const before = await page.evaluate(() => document.querySelectorAll('.ln').length);
      await page.setViewportSize({ width: 700, height: 900 });
      await page.waitForTimeout(900);
      const after = await page.evaluate(() => ({
        lines: document.querySelectorAll('.ln').length,
        tall: [...document.querySelectorAll('.ln')]
          .filter((ln) => ln.getClientRects().length)
          .filter((ln) => ln.getBoundingClientRect().height > parseFloat(getComputedStyle(ln).lineHeight) * 1.5).length,
      }));
      check(
        `${label}：幅を変えると、行を組み直す（どの行も1行のまま）`,
        after.lines > before && after.tall === 0,
        `${before} 行 → ${after.lines} 行、はみ出し ${after.tall}`,
      );
    }
    check(`${label}：画面に誤りが出ない`, errors.length === 0, errors.join(' / '));
    await ctx.close();
  }

  /* =================================================================== */
  console.log('\n--- 案内役の写真 ---');
  /* =================================================================== */
  for (const [label, viewport, wide] of [
    ['パソコン（広い）', { width: 1440, height: 900 }, true],
    ['パソコン（狭い）', { width: 1280, height: 900 }, false],
    ['スマートフォン', { width: 390, height: 844 }, false],
  ]) {
    const { ctx, page } = await fresh({ viewport });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await checkGuide(page, label, wide);
    await ctx.close();
  }

  {
    /* 指で触れたときは、輪を出さない（マウスで押したときだけ） */
    const { ctx, page } = await fresh({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.touchscreen.tap(300, 600);
    await page.waitForTimeout(80);
    const rings = await page.evaluate(() => document.querySelectorAll('.click-ring').length);
    check('指で触れたときは、赤い輪を出さない', rings === 0, `${rings} 個`);
    await ctx.close();
  }

  for (const [label, viewport] of [
    ['設定に従う場合・パソコン', { width: 1440, height: 900 }],
    ['設定に従う場合・スマートフォン', { width: 390, height: 844 }],
  ]) {
    /*
      動きを減らす設定に**従う場合**（main.js の FOLLOW_REDUCED_MOTION を
      true にしたとき）。住所の末尾の ?calm で同じ振る舞いになる。
      大きな動きは出さないが、塊と行の出方（濃さだけ）と、目印の浮き沈みは出る。
    */
    const { ctx, page, errors } = await fresh({ viewport, reducedMotion: 'reduce' });
    await page.goto(`${BASE}?calm`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const calm = await page.evaluate(() => ({
      motion: document.documentElement.classList.contains('motion'),
      tagline: document.querySelectorAll('.hero__tagline .ch').length,
      typing: document.querySelectorAll('.tw').length,
      sea: [...document.querySelectorAll('.sea__layer')].reduce((n, l) => n + l.getAnimations().length, 0),
    }));
    check(`${label}：大きな動きの部品は働かせない`, !calm.motion, JSON.stringify(calm));
    check(
      `${label}：標語の回転・打ち込み・波は止める（文はそのまま読める）`,
      calm.tagline === 0 && calm.typing === 0 && calm.sea === 0,
      JSON.stringify(calm),
    );
    await checkFades(page, label, false);
    await checkPins(page, label);
    await checkNothingStuck(page, label);
    check(
      `${label}：見出しは弾ませず、砂ぼこりも出さない`,
      (await page.evaluate(() => document.querySelectorAll('.dust').length)) === 0,
    );
    await page.mouse.move(200, 300);
    await page.mouse.down();
    const rings = await page.evaluate(() => document.querySelectorAll('.click-ring').length);
    await page.mouse.up();
    check(`${label}：押しても、赤い輪は出さない`, rings === 0, `${rings} 個`);
    await toPhone(page);
    await page.waitForTimeout(1200);
    const ph = await phoneState(page);
    check(`${label}：端末は動画を流さず、はじめから画面を見せる`, ph.app && !ph.boot && ph.paused, JSON.stringify(ph));

    /* カードは流さない。矢印は効く */
    await page.locator('#features').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    const still = await page.evaluate(() => document.getElementById('cards').scrollLeft);
    await page.waitForTimeout(1500);
    const still2 = await page.evaluate(() => document.getElementById('cards').scrollLeft);
    await page.locator('[data-carousel="next"]').click();
    await page.waitForTimeout(700);
    const moved = await page.evaluate(() => document.getElementById('cards').scrollLeft);
    check(`${label}：カードは流さない（矢印は効く）`, Math.abs(still2 - still) <= 2 && moved - still2 > 100, `${still} → ${still2} → ${moved}`);
    check(`${label}：画面に誤りが出ない`, errors.length === 0, errors.join(' / '));
    await ctx.close();
  }

  {
    /* 設定に従う場合：目印は移らず、絵はそのまま見える。UP は効く */
    const { ctx, page } = await fresh({ reducedMotion: 'reduce' });
    await page.goto(`${BASE}?calm`, { waitUntil: 'networkidle' });
    const r = await page.evaluate(() => ({
      flyer: getComputedStyle(document.getElementById('flyer')).display,
      mark: getComputedStyle(document.querySelector('#message-mark img')).visibility,
      emblem: getComputedStyle(document.querySelector('.hero__emblem img')).visibility,
    }));
    check('設定に従う場合：目印は移さず、絵はそのまま出る', r.flyer === 'none' && r.mark === 'visible' && r.emblem === 'visible', JSON.stringify(r));
    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(400);
    await page.locator('#page-up').click();
    await page.waitForTimeout(600);
    check('設定に従う場合：UP を押すと、先頭へ戻る', (await page.evaluate(() => window.scrollY)) < 5);
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(`\n合格 ${pass} / 不合格 ${failures.length}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}
