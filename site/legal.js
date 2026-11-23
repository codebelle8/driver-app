/**
 * 規約類の3ページ（/terms・/privacy・/law）の動き（2026-11-23）。
 *
 * トップ（main.js）と同じく、マウスで押した位置に赤い輪を3つ広げる
 * （ご指示 2026-09-20「マウスを押すたびに、押した位置を正確に示す、広がる赤い円を3つ」）。
 * 指で触れたときは出さない。読むためのページなので、ほかの動きは付けない。
 */
(() => {
  const RINGS = 3;
  const GAP_MS = 130;
  const DURATION_MS = 700;

  const layer = document.createElement('div');
  layer.className = 'click-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'mouse' || typeof Element.prototype.animate !== 'function') return;
      for (let i = 0; i < RINGS; i++) {
        const ring = document.createElement('span');
        ring.className = 'click-ring';
        ring.style.left = `${e.clientX}px`;
        ring.style.top = `${e.clientY}px`;
        layer.append(ring);
        ring
          .animate(
            [
              { width: '4px', height: '4px', opacity: 1 },
              { width: '40px', height: '40px', opacity: 1, offset: 0.5 },
              { width: '64px', height: '64px', opacity: 0 },
            ],
            { duration: DURATION_MS, delay: i * GAP_MS, easing: 'cubic-bezier(0.2, 0.7, 0.35, 1)', fill: 'backwards' },
          )
          .finished.then(
            () => ring.remove(),
            () => ring.remove(),
          );
      }
    },
    { capture: true, passive: true },
  );
})();
