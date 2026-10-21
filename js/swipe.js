// Pull a bottom sheet down by its handle (or its title) to close it, like on iOS.
// Only where the sheet is a bottom sheet: on desktop it is a centred panel without a handle.

export function swipeToClose(dialog) {
  const grab = dialog.querySelector('.sheet-grab');
  const grip = dialog.querySelector('.sheet-grip');
  let drag = null;

  const reset = () => { dialog.style.transform = ''; dialog.style.transition = ''; };

  grab.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || getComputedStyle(grip).display === 'none') return;
    drag = { y: e.touches[0].clientY, dy: 0, trail: [] };
    dialog.style.transition = 'none';
  }, { passive: true });

  grab.addEventListener('touchmove', e => {
    if (!drag) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    // Pulling up resists, pulling down follows the finger.
    const dy = y - drag.y;
    drag.dy = dy > 0 ? dy : dy / 6;
    dialog.style.transform = `translateY(${drag.dy}px)`;
    const now = performance.now();
    drag.trail.push({ t: now, y });
    while (drag.trail.length > 2 && now - drag.trail[0].t > 100) drag.trail.shift();
  }, { passive: false });

  function release() {
    if (!drag) return;
    const { dy, trail } = drag;
    drag = null;
    const a = trail[0], b = trail[trail.length - 1];
    const speed = a && b !== a ? (b.y - a.y) / (b.t - a.t) : 0; // px per ms, down is positive
    dialog.style.transition = 'transform var(--dur-slow) var(--ease-out)';
    if (dy > dialog.offsetHeight * 0.3 || (dy > 30 && speed > 0.5)) {
      dialog.style.transform = 'translateY(100%)';
      setTimeout(() => dialog.close(), 300);
    } else {
      dialog.style.transform = '';
    }
  }
  grab.addEventListener('touchend', release);
  grab.addEventListener('touchcancel', release);
  dialog.addEventListener('close', reset);
}
