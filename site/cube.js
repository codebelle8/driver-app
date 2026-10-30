/*
 * 最初の画面の、回るキューブ（ご指示 2026-10-30「resend.com のキューブを、同じ動きで。
 * 面にはアプリのロゴを」）。
 *
 * **GPU を使う描き方（WebGL）は使わない**（ご指示 2026-10-30「GPU が要る動きは使わない。
 * どのパソコンでもスマートフォンでも動くように」）。CSS の立体（transform）だけで描き、
 * 回すのも CSS のアニメーション（styles.css の .cube）。ここでは面の板を組み立て、
 * ドラッグで向きを変えるだけ。
 *
 * **動きは、resend.com のキューブの設定値を写している**（styles.css に値）:
 *
 *   全体      X 軸まわりに 10秒で1回転。その内側で、Y 軸まわりにも 10秒で1回転
 *   左の段    3秒待つ → 2秒かけて半回転 → 3秒待つ → 2秒で戻る。くり返す
 *   右の段    5秒待つ → 3秒かけて半回転 → 5秒待つ → 3秒で戻る。くり返す
 *   ドラッグ  まわりから見る向きが変わる（横にも縦にも。枠の高さぶん動かすと1周）。
 *             手を離すと、その場で止まる（惰性で回らない）。ホイールはページの送りのまま
 *
 * **作り。** キューブを X 軸に沿った3つの段（左・中・右）に分け、段ごとに6枚の板
 * （上・下・前・後ろ・左・右）で箱を作る。外を向いた板には、面の絵
 * （assets/brand/cube-face.webp。1面に1つのロゴ）を 3 × 3 の札に分けて貼る。
 * 段が回るとロゴが崩れ、戻るとそろう。段と段の間の板（内側）は、段が回ったときに見える。
 * 板は 18 枚だけなので、GPU の無いパソコンでも軽い。
 */

const figure = document.querySelector('.cube');

/**
 * 板の向き。前に向けた板（絵は正しい向き）を、それぞれの面へ回す。外から見て、
 * ロゴが正しい向きになる回し方（上の面は、奥がロゴの上）。
 */
const TURN = {
  front: 'rotateY(0deg)',
  back: 'rotateY(180deg)',
  right: 'rotateY(90deg)',
  left: 'rotateY(-90deg)',
  top: 'rotateX(90deg)',
  bottom: 'rotateX(-90deg)',
};

/** 板の明るさ（面ごとに少し変えて、立体に見せる。0 がいちばん明るい） */
const SHADE = { top: 0, front: 0.06, left: 0.1, right: 0.14, back: 0.18, bottom: 0.26 };

function build() {
  const spinY = figure.querySelector('.cube__spin-y');
  for (const i of [-1, 0, 1]) {
    const slice = document.createElement('div');
    slice.className = `cube__slice cube__slice--${['left', 'mid', 'right'][i + 1]}`;
    slice.style.setProperty('--i', String(i));
    /* 帯の4面（横1列 × 縦3段）。絵のどの列を写すか（後ろは左右が逆） */
    slice.append(
      panel('front', 1, i + 1),
      panel('back', 1, 1 - i),
      panel('top', 1, i + 1),
      panel('bottom', 1, i + 1),
      /* 左右の面。外側ならロゴの9枚、内側（段と段の間）は何も貼らない */
      panel('left', i === -1 ? 3 : 0, 0),
      panel('right', i === 1 ? 3 : 0, 0),
    );
    spinY.append(slice);
  }
}

/**
 * 板を1枚。cols は札の列の数（帯は 1、外側の面は 3、内側は 0）、
 * col0 は、いちばん左の列が面の絵のどの列か。
 */
function panel(side, cols, col0) {
  const p = document.createElement('div');
  const band = ['front', 'back', 'top', 'bottom'].includes(side);
  p.className = `cube__panel${cols === 0 ? ' cube__panel--inner' : ''}`;
  p.style.setProperty('--w', band ? '1' : '3');
  p.style.setProperty('--d', band ? '1.5' : '0.5');
  p.style.setProperty('--turn', TURN[side]);
  p.style.setProperty('--shade', String(SHADE[side]));
  for (let r = 0; r < 3 && cols; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = document.createElement('i');
      tile.className = 'cube__tile';
      tile.style.setProperty('--c', String(col0 + c));
      tile.style.setProperty('--r', String(r));
      p.append(tile);
    }
  }
  return p;
}

/* --- ドラッグで、まわりから見る向きを変える -------------------------------- */

function drag() {
  const stage = figure.querySelector('.cube__stage');
  const view = figure.querySelector('.cube__view');
  const TAU = Math.PI * 2;
  let turnX = 0; /* 縦（上下 90° まで） */
  let turnY = 0; /* 横 */
  let hold = null;

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); /* 文字を選び始めない */
    hold = { id: e.pointerId, x: e.clientX, y: e.clientY };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (hold?.id !== e.pointerId) return;
    const h = stage.clientHeight;
    turnY += (TAU * (e.clientX - hold.x)) / h;
    turnX = Math.min(Math.max(turnX - (TAU * (e.clientY - hold.y)) / h, -Math.PI / 2), Math.PI / 2);
    hold.x = e.clientX;
    hold.y = e.clientY;
    view.style.transform = `rotateX(${turnX}rad) rotateY(${turnY}rad)`;
  });
  const release = (e) => {
    if (hold?.id === e.pointerId) hold = null;
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  /* 検査用（tools/test-site.mjs）。いまの向き */
  figure.cubeView = () => ({ turnX, turnY });
}

if (figure) {
  build();
  drag();
  /* 画面の外にあるあいだは止める */
  new IntersectionObserver(([entry]) => figure.classList.toggle('is-away', !entry.isIntersecting)).observe(figure);
}
