/*
 * 最初の画面の右の、回るキューブ（ご指示 2026-10-30「resend.com のキューブを、
 * 同じ動きで。面にはアプリのロゴを」）。
 *
 * **動きは、resend.com のキューブの設定値を写している。** あちらは Spline で
 * 作った場面（cube.splinecode）で、そのファイルを読んで確かめた値（2026-10-30）:
 *
 *   全体      X 軸まわりに 10秒で1回転。その内側で、Y 軸まわりにも 10秒で1回転。
 *             どちらも同じ速さのまま、止まらない
 *   左の段    3秒待つ → 2秒かけて半回転（X 軸まわりに 180°）→ 3秒待つ → 2秒で戻る。くり返す
 *   右の段    5秒待つ → 3秒かけて半回転 → 5秒待つ → 3秒で戻る。くり返す
 *             （段は、動き始めと止まる前がゆっくり）
 *   ドラッグ  カメラがキューブのまわりを回る（横にも縦にも。枠の高さぶん動かすと1周）。
 *             手を離すと、その場で止まる（惰性で回らない）。拡大・平行移動は無い。
 *             ホイールは、ページの送りのまま
 *   見せ方    画角 45°。出るときは、ふわっと大きくなりながら濃くなる（1.5秒）
 *
 * **resend と違うところ**
 *
 *   * 面に、アプリのロゴを貼る（assets/brand/cube-face.webp。tools/make-cube-face.mjs で
 *     作る）。1面に1つのロゴを 3 × 3 の札に分けて貼るので、段が回るとロゴが崩れ、
 *     戻るとそろう
 *   * 本体は黒ではなく、サイトの紺に寄せた濃い色。白地に置くので、下に影を落とす
 *   * 幅 1320px 以下では出さない（案内役の写真と同じ。本文との間が足りない）。
 *     出さない幅では three.js も読まない
 *   * GPU の無いパソコンでは、軽く描く（start の中の lite）
 *   * 端末の「動きを減らす」設定に従う場合（main.js の .calm）は、自分では回らない。
 *     ドラッグでは回せる
 */

const figure = document.querySelector('.cube');
const canvas = figure?.querySelector('.cube__canvas');

/*
  出す幅で、キューブが画面に入って 0.8秒とどまったら始める（出さない幅では、画面に
  入ることが無い）。開いてすぐ下へ送られたときは、立ち上げない。立ち上げ（three.js を
  読む・最初の1コマの陰影の準備）は、GPU の無いパソコンではページの動きを鈍らせた
  （2026-10-30、開いてすぐ送った先のカードの横送りが遅くなった）。
  遅れて届いても、描けるようになったところでふわっと出る（styles.css の .is-live）
*/
if (canvas) {
  let timer = 0;
  const watch = new IntersectionObserver(([entry]) => {
    window.clearTimeout(timer);
    if (!entry.isIntersecting) return;
    timer = window.setTimeout(() => {
      watch.disconnect();
      start().catch(() => figure.classList.add('is-off'));
    }, 800);
  });
  watch.observe(canvas);
}

const TAU = Math.PI * 2;
/** 全体が1回転する秒数（X 軸・Y 軸とも） */
const TURN = 10;
/** 段の動き（待つ秒数・回る秒数）。左の段と右の段 */
const LEFT = { wait: 3, turn: 2 };
const RIGHT = { wait: 5, turn: 3 };
/** カメラの距離（キューブの角が回っても、枠からはみ出さない） */
const DISTANCE = 7.2;
/** 小さな立方体の間のすき間・角の丸み */
const GAP = 0.04;
const ROUND = 0.07;
/** 札の大きさ（小さな立方体の面に対して）・角の丸み・厚み */
const LABEL = 0.84;
const LABEL_ROUND = 0.1;
const LABEL_DEPTH = 0.012;

/**
 * 各面の向き。n は外向き、u・v は面の絵の横・縦（外から見て、ロゴが正しい向きに
 * なる組。u × v = n）。
 */
const FACES = [
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
];

async function start() {
  const [THREE, { RoundedBoxGeometry }] = await Promise.all([
    import('./assets/vendor/three.module.min.js'),
    import('./assets/vendor/RoundedBoxGeometry.js'),
  ]);

  /*
    GPU の無いパソコン（ブラウザが CPU で描く）では、軽く描く。そのままでは1コマに
    時間がかかり、ページ全体の動きまで毎秒4コマに落ちた（2026-10-30、確認に使って
    いるパソコンがそうだった）。
      * ふちのなめらか処理・映り込み・つやの層・斜めの絵をくっきりさせる処理を省き、
        光の計算を簡単なものにする
      * 形を粗くする（角の丸みは1段の面取り、札のふちは丸めない）。このパソコンでは、
        材質より形の細かさのほうが効いた
      * 細かさは等倍、毎秒20コマまで。ページの動きが遅れているあいだは、毎秒8コマ
        まで減らして譲る。送って薄れていくあいだは描かない（下の tick）
    こうして、ページの動きは毎秒40コマ前後まで戻る（キューブを出さない幅では60）
  */
  const lite = softwareRendering();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: true });
  renderer.setPixelRatio(lite ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  /* ロゴの色（黄・水色）が濁らない色の合わせ方 */
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  if (!lite) scene.environment = studio(THREE, renderer);

  /* 明かりは場面に固定（ドラッグでカメラが回ると、照らされる側が変わる。resend と同じ） */
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-4, 6, 8);
  /* 奥から、緑がかった縁の明かり（サイトの緑に合わせる） */
  const rim = new THREE.DirectionalLight(0xc9ecc9, 1.4);
  rim.position.set(6, 2, -6);
  scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x1b2638, 0.5));

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  /* 動きを減らす場合は、自分では回らない（3つの面が見える向きで止めておく） */
  const still = document.documentElement.classList.contains('calm');

  /* --- キューブ ---------------------------------------------------------- */

  const face = await new THREE.TextureLoader().loadAsync('assets/brand/cube-face.webp');
  face.colorSpace = THREE.SRGBColorSpace;
  /* 斜めから見た絵をくっきりさせる処理。CPU で描くときはいちばん重いので外す */
  face.anisotropy = lite ? 1 : renderer.capabilities.getMaxAnisotropy();

  /* 札は、ロゴが陰の側でも沈みすぎないよう、絵そのものを少し光らせる */
  const glow = { emissive: 0xffffff, emissiveMap: face, emissiveIntensity: 0.22 };
  const body = lite
    ? new THREE.MeshPhongMaterial({ color: 0x0b1220, specular: 0x8a94a6, shininess: 70 })
    : new THREE.MeshPhysicalMaterial({ color: 0x070c15, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.2 });
  const label = lite
    ? new THREE.MeshPhongMaterial({ map: face, specular: 0x8a94a6, shininess: 90, ...glow })
    : new THREE.MeshPhysicalMaterial({ map: face, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, ...glow });

  const piece = new RoundedBoxGeometry(1 - GAP, 1 - GAP, 1 - GAP, lite ? 1 : 4, ROUND);
  const labels = labelGeometries(THREE, lite);

  const spinX = new THREE.Group();
  const spinY = new THREE.Group();
  scene.add(spinX);
  spinX.add(spinY);
  /*
    X 軸に沿った3つの段（左・中・右）。左と右が回る。
    **段の中の小さな立方体と札は、段ごとに1つの形にまとめる。** 段の中では
    いっしょに動くだけなので、分けておく理由が無い。分けたままだと1コマに
    80回描くことになり、GPU の無いパソコンでは、描く回数だけで重くなった
    （材質をいちばん軽いものにしても速くならなかった）。まとめると6回で済む
  */
  const at = new THREE.Vector3();
  const spot = new THREE.Matrix4();
  const slices = [-1, 0, 1].map((x) => {
    const pieces = [];
    const stickers = [];
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        /* まん中は、どこからも見えない */
        if (x === 0 && y === 0 && z === 0) continue;
        at.set(x, y, z);
        spot.makeTranslation(x, y, z);
        pieces.push(piece.clone().applyMatrix4(spot));
        for (const f of FACES) {
          const n = new THREE.Vector3(...f.n);
          if (at.dot(n) !== 1) continue; /* 外を向いた面にだけ札を貼る */
          const u = new THREE.Vector3(...f.u);
          const v = new THREE.Vector3(...f.v);
          const onFace = new THREE.Matrix4().makeBasis(u, v, n).setPosition(n.multiplyScalar((1 - GAP) / 2));
          stickers.push(labels[(at.dot(u) + 1) * 3 + at.dot(v) + 1].clone().applyMatrix4(onFace.premultiply(spot)));
        }
      }
    }
    const slice = new THREE.Group();
    slice.add(new THREE.Mesh(merge(THREE, pieces), body), new THREE.Mesh(merge(THREE, stickers), label));
    spinY.add(slice);
    return slice;
  });

  /* --- ドラッグで、カメラがまわりを回る ----------------------------------- */

  let theta = 0; /* 横の角度 */
  let phi = Math.PI / 2; /* 縦の角度（真上が 0、真横が π/2） */
  const place = () => {
    camera.position.setFromSphericalCoords(DISTANCE, phi, theta);
    camera.lookAt(0, 0, 0);
  };
  place();

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); /* 文字を選び始めない */
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag?.id !== e.pointerId) return;
    const h = canvas.clientHeight;
    theta -= (TAU * (e.clientX - drag.x)) / h;
    phi = Math.min(Math.max(phi - (TAU * (e.clientY - drag.y)) / h, 1e-6), Math.PI - 1e-6);
    drag.x = e.clientX;
    drag.y = e.clientY;
    place();
    if (still) render();
  });
  const release = (e) => {
    if (drag?.id !== e.pointerId) return;
    drag = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  /* --- 動かす ------------------------------------------------------------- */

  const begin = performance.now();
  let frames = 0;

  function pose(t) {
    spinX.rotation.x = (-TAU * (t % TURN)) / TURN;
    spinY.rotation.y = (-TAU * (t % TURN)) / TURN;
    slices[0].rotation.x = -Math.PI * swing(t, LEFT);
    slices[2].rotation.x = -Math.PI * swing(t, RIGHT);
  }
  function render() {
    renderer.render(scene, camera);
    frames += 1;
  }

  const fit = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (still) render();
  };
  fit();
  new ResizeObserver(fit).observe(canvas);

  /*
    画面に入っているあいだだけ描く。軽く描くときは:
      * 毎秒20コマまで。**ページの1コマが遅れているあいだ（毎秒25コマを割る）は、
        キューブのコマを減らして譲る**（毎秒8コマまで）。パソコンが混んでいると、
        キューブを描く分だけ、右側の縦の一文などほかの動きが遅れた（2026-10-30）
      * 送って薄れていくあいだ（main.js が .cube__stage を薄くする）は描かない
  */
  const stage = figure.querySelector('.cube__stage');
  const fading = () => stage.style.opacity !== '' && Number(stage.style.opacity) < 1;
  let shown = false;
  let running = false;
  let last = 0;
  let prev = 0;
  let pace = 1000 / 20;
  const tick = (now) => {
    if (!shown) {
      running = false;
      prev = 0;
      return;
    }
    if (lite && prev) {
      pace = now - prev > 40 ? Math.min(pace * 1.25, 1000 / 8) : Math.max(pace * 0.95, 1000 / 20);
    }
    prev = now;
    if (!lite || (now - last >= pace - 2 && !fading())) {
      last = now;
      pose((now - begin) / 1000);
      render();
    }
    requestAnimationFrame(tick);
  };
  if (still) {
    pose(1.2);
    render();
  } else {
    new IntersectionObserver(([entry]) => {
      shown = entry.isIntersecting;
      if (shown && !running) {
        running = true;
        requestAnimationFrame(tick);
      }
    }).observe(canvas);
  }

  /* 検査用（tools/test-site.mjs）。いまの向き・描いた回数・軽く描いているか */
  figure.cubeView = () => ({ theta, phi, frames, lite });

  requestAnimationFrame(() => figure.classList.add('is-live'));
}

/**
 * ブラウザが GPU を使わず、CPU で描いているか。ふちのなめらか処理は描く板を
 * 作るときにしか決められないため、別の板で先に確かめる。
 */
function softwareRendering() {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /swiftshader|llvmpipe|softpipe|basic render|software/i.test(String(name));
}

/**
 * 段の回り具合（0 → 1 → 0）。待つ → 回る → 待つ → 戻る、をくり返す。
 */
function swing(t, { wait, turn }) {
  let s = t % (2 * (wait + turn));
  if (s < wait) return 0;
  s -= wait;
  if (s < turn) return easeInOut(s / turn);
  s -= turn;
  if (s < wait) return 1;
  return 1 - easeInOut((s - wait) / turn);
}

/** CSS の ease-in-out（cubic-bezier(0.42, 0, 0.58, 1)） */
function easeInOut(x) {
  const curve = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  let t = x;
  for (let i = 0; i < 20; i++) {
    t = (lo + hi) / 2;
    if (curve(t, 0.42, 0.58) < x) lo = t;
    else hi = t;
  }
  return curve(t, 0, 1);
}

/**
 * 札の形（角の丸い、薄い板）を 9 通り。面の絵のどの 1/9 を写すかだけが違う
 * （[横の位置 × 3 + 縦の位置]。位置は 0〜2）。札の間のすき間に当たる絵は見えない
 * （格子越しに1枚の絵を見ているように、札をまたいで絵がつながる）。
 */
function labelGeometries(THREE, lite) {
  const s = LABEL / 2;
  const r = LABEL_ROUND;
  const shape = new THREE.Shape()
    .moveTo(-s + r, -s)
    .lineTo(s - r, -s)
    .quadraticCurveTo(s, -s, s, -s + r)
    .lineTo(s, s - r)
    .quadraticCurveTo(s, s, s - r, s)
    .lineTo(-s + r, s)
    .quadraticCurveTo(-s, s, -s, s - r)
    .lineTo(-s, -s + r)
    .quadraticCurveTo(-s, -s, -s + r, -s);
  const base = new THREE.ExtrudeGeometry(shape, {
    depth: LABEL_DEPTH,
    bevelEnabled: !lite,
    bevelThickness: LABEL_DEPTH / 2,
    bevelSize: LABEL_DEPTH,
    bevelSegments: 3,
    curveSegments: lite ? 2 : 8,
  });
  const list = [];
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      const g = base.clone();
      const p = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        uv.setXY(i, (col + 0.5 + p.getX(i)) / 3, (row + 0.5 + p.getY(i)) / 3);
      }
      list.push(g);
    }
  }
  return list;
}

/** 形を1つにまとめる（どれも、頂点を共有しない形） */
function merge(THREE, parts) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const all = new Float32Array(parts.reduce((sum, g) => sum + g.attributes[name].array.length, 0));
    let offset = 0;
    for (const g of parts) {
      all.set(g.attributes[name].array, offset);
      offset += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(all, parts[0].attributes[name].itemSize));
  }
  return out;
}

/**
 * 映り込み用の、撮影室のような明かり。暗い部屋に、上の大きな明かり・左の細長い明かり・
 * 右奥の明かり・下の弱い照り返しを置き、つやのある面にそれが映るようにする。
 */
function studio(THREE, renderer) {
  const room = new THREE.Scene();
  room.background = new THREE.Color(0x1d2533);
  const panel = (w, h, power, x, y, z) => {
    const light = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(power), side: THREE.DoubleSide }),
    );
    light.position.set(x, y, z);
    light.lookAt(0, 0, 0);
    room.add(light);
  };
  panel(10, 6, 4, 0, 8, 2);
  panel(2, 8, 6, -7, 1, 3);
  panel(2, 8, 3, 7, 0, -3);
  panel(8, 2, 1.5, 0, -6, 4);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(room, 0.03).texture;
  pmrem.dispose();
  return env;
}
