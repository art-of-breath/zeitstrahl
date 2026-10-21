// The line itself: rendering, zoom, and picking a moment by tapping or dragging.
// One renderer serves both directions. Everything is computed as "along" (the time
// axis) and "cross" (across it), and put() maps that onto top/left.

import { toDay, fromDay, todayIso, normalise, span, formatSpan, formatDate } from './dates.js';
import { fitPpd, prefillPrecision, ticks, MAX_PPD } from './scale.js';
import { packLanes, pushAlong, packRows } from './lanes.js';

const DRAW_MS = 2400;

const GEOMETRY = {
  v: { padStart: 48, padEnd: 40, spine: 76, laneStart: 96, laneGap: 12, labelGap: 14, labelSize: 44, minGap: 44 },
  h: { padStart: 72, padEnd: 140, spine: 120, laneStart: 140, laneGap: 12, labelGap: 20, labelSize: 52, minGap: 56 },
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createTimeline(root, { onPick, onOpen, onChange, verticalQuery }) {
  const canvas = document.createElement('div');
  canvas.className = 'canvas';
  root.append(canvas);

  let birthIso, birthDay, todayDay, events = [];
  let vertical = verticalQuery.matches;
  let g = vertical ? GEOMETRY.v : GEOMETRY.h;
  let ppd = 1;
  // While the line draws itself, a re-render would swap in finished elements and cut the
  // drawing short (the first resize after showing the app, fonts arriving). Hold those.
  let drawing = false;
  let renderHeld = false;
  const softRender = () => { if (drawing) renderHeld = true; else render(); };
  let zone = [0, 0]; // the band across the line where a tap or drag picks a moment
  let minPpd = 0.01;

  const measure = document.createElement('canvas').getContext('2d');

  const el = (cls, tag = 'div') => { const n = document.createElement(tag); n.className = cls; return n; };
  const pos = day => g.padStart + (day - birthDay) * ppd;
  const viewAlong = () => (vertical ? root.clientHeight : root.clientWidth);
  const scrollAlong = v => {
    if (v === undefined) return vertical ? root.scrollTop : root.scrollLeft;
    if (vertical) root.scrollTop = v; else root.scrollLeft = v;
  };

  function put(n, along, cross, alongSize, crossSize) {
    const s = n.style;
    s[vertical ? 'top' : 'left'] = `${along}px`;
    s[vertical ? 'left' : 'top'] = `${cross}px`;
    if (alongSize != null) s[vertical ? 'height' : 'width'] = `${alongSize}px`;
    if (crossSize != null) s[vertical ? 'width' : 'height'] = `${crossSize}px`;
  }

  // Feathered ends show how unsure a date is: the gold fades in over the fuzzy part.
  function feather(lengthPx, startPx, endPx) {
    const dir = vertical ? '180deg' : '90deg';
    const a = Math.min(45, (startPx / lengthPx) * 100);
    const b = Math.max(55, 100 - (endPx / lengthPx) * 100);
    const from = startPx > 0 ? 'transparent' : 'var(--tone)';
    const to = endPx > 0 ? 'transparent' : 'var(--tone)';
    return `linear-gradient(${dir}, ${from} 0%, var(--tone) ${a}%, var(--tone) ${b}%, ${to} 100%)`;
  }

  function render() {
    if (!vertical) {
      // Sit the line in the upper third, so the labels below it have the room.
      const spine = Math.max(GEOMETRY.h.spine, Math.round(root.clientHeight * 0.3));
      g = { ...GEOMETRY.h, spine, laneStart: spine + 20 };
    }
    const total = pos(todayDay);
    let length = total + g.padEnd;
    const frag = document.createDocumentFragment();
    const delay = along => `${Math.round(((along - g.padStart) / (total - g.padStart || 1)) * DRAW_MS)}ms`;

    canvas.className = `canvas ${vertical ? 'is-v' : 'is-h'}${canvas.classList.contains('pre') ? ' pre' : ''}${canvas.classList.contains('drawing') ? ' drawing' : ''}`;

    const spine = el('spine');
    put(spine, g.padStart, g.spine - 1, total - g.padStart, 2);
    frag.append(spine);

    for (const t of ticks(birthIso, todayDay, ppd, g.minGap)) {
      const n = el(`tick tick-${t.kind}${t.labelled ? ' is-labelled' : ''}`);
      put(n, pos(t.day), 0, null, g.spine);
      n.style.setProperty('--d', delay(pos(t.day)));
      n.append(el('tick-mark', 'span'));
      if (t.labelled) {
        const label = el('tick-label', 'span');
        if (t.kind === 'age') {
          const age = el(t.age === 0 ? 'tick-age-n is-birth' : 'tick-age-n', 'span');
          age.textContent = t.age === 0 ? 'Geburt' : t.age;
          const year = el('tick-year', 'span');
          year.textContent = t.year;
          label.append(age, year);
        } else {
          label.textContent = t.label;
        }
        n.append(label);
      }
      frag.append(n);
    }

    const birth = el('birth-dot');
    put(birth, g.padStart, g.spine);
    frag.append(birth);

    // Events
    const items = events.map(ev => {
      const sp = span(ev, todayDay);
      return { ev, ...sp, s: Math.max(sp.s, birthDay), e: Math.min(Math.max(sp.e, sp.s + 1), todayDay + 1) };
    });
    const lanes = packLanes(items.filter(i => i.lasting));
    const labelStart = g.laneStart + lanes * g.laneGap + g.labelGap;
    zone = [g.spine - 24, Math.max(g.spine + 24, g.laneStart + lanes * g.laneGap + 6)];
    const labels = [];

    for (const it of items) {
      const tone = `tone-${it.ev.tone || 'neutral'}`;
      const a = pos(it.s);
      const len = Math.max(pos(it.e) - a, 0);
      let mark, markCross;

      if (it.lasting) {
        mark = el(`ev ev-bar ${tone}`, 'button');
        const L = Math.max(len, 6);
        markCross = g.laneStart + it.lane * g.laneGap;
        put(mark, a, markCross, L, 6);
        mark.style.background = feather(L, it.startFuzz * ppd, it.endFuzz * ppd);
        markCross += 3;
      } else if (it.startFuzz === 0 || len < 12) {
        mark = el(`ev ev-dot ${tone}${it.startFuzz ? ' is-fuzzy' : ''}`, 'button');
        put(mark, a + len / 2, g.spine);
        markCross = g.spine;
      } else {
        mark = el(`ev ev-haze ${tone}`, 'button');
        put(mark, a, g.spine - 6, len, 12);
        mark.style.background = feather(len, len / 2, len / 2);
        markCross = g.spine;
      }
      mark.dataset.id = it.ev.id;
      mark.type = 'button';
      mark.setAttribute('aria-label', `${it.ev.title}, ${formatSpan(it.ev)}`);
      mark.style.setProperty('--d', delay(a));
      frag.append(mark);

      const anchor = it.lasting ? a + Math.min(len / 2, 16) : a + len / 2;
      labels.push({ it, anchor, markCross, tone });
    }

    // Labels, kept apart
    let rows = 0;
    if (vertical) {
      pushAlong(labels, g.labelSize, 6);
      // Labels pushed past today still need room to scroll to.
      for (const l of labels) length = Math.max(length, l.at + g.labelSize + g.padEnd / 2);
    } else {
      for (const l of labels) {
        measure.font = '500 14px Raleway, sans-serif';
        const t = measure.measureText(l.it.ev.title).width;
        measure.font = '400 12px Raleway, sans-serif';
        const w = measure.measureText(formatSpan(l.it.ev)).width;
        l.size = Math.min(240, Math.max(t, w) + 28);
      }
      rows = packRows(labels, 16);
    }

    const crossSize = vertical
      ? root.clientWidth
      : Math.max(root.clientHeight, labelStart + rows * g.labelSize + 48);
    const leaders = document.createElementNS(SVG_NS, 'svg');
    leaders.setAttribute('class', 'leaders');
    leaders.setAttribute('width', vertical ? crossSize : length);
    leaders.setAttribute('height', vertical ? length : crossSize);

    for (const l of labels) {
      const b = el(`ev-label ${l.tone}`, 'button');
      b.type = 'button';
      b.dataset.id = l.it.ev.id;
      const title = el('ev-title', 'span');
      title.textContent = l.it.ev.title;
      const when = el('ev-when', 'span');
      when.textContent = formatSpan(l.it.ev);
      b.append(title, when);
      b.tabIndex = -1; // the mark is the focus stop; the label is a bigger tap target
      b.setAttribute('aria-hidden', 'true');
      b.style.setProperty('--d', delay(l.anchor));

      const path = document.createElementNS(SVG_NS, 'path');
      let d;
      if (vertical) {
        put(b, l.at, labelStart, g.labelSize);
        b.style.right = '16px';
        // A soft curve from the moment to its label, so pushed labels fan out calmly.
        const y2 = l.at + g.labelSize / 2;
        const x1 = l.markCross + 6, x2 = labelStart, mid = (x1 + x2) / 2;
        d = `M${l.markCross} ${l.anchor} H${x1} C${mid} ${l.anchor} ${mid} ${y2} ${x2} ${y2}`;
      } else {
        const cross = labelStart + l.row * g.labelSize;
        // The 2px color rule sits centred on the leader.
        put(b, l.at - 1, cross, l.size, g.labelSize - 8);
        d = `M${l.anchor} ${l.markCross} V${cross}`;
      }
      path.setAttribute('d', d);
      path.style.setProperty('--d', delay(l.anchor));
      leaders.append(path);
      frag.append(b);
    }
    frag.prepend(leaders);

    const today = el('today');
    put(today, total, g.spine);
    today.style.setProperty('--d', `${DRAW_MS}ms`);
    const tl = el('today-label', 'span');
    tl.textContent = 'Heute';
    today.append(el('today-dot', 'span'), tl);
    frag.append(today);

    canvas.style.width = `${vertical ? crossSize : length}px`;
    canvas.style.height = `${vertical ? length : crossSize}px`;
    canvas.replaceChildren(frag);
  }

  function fit() {
    vertical = verticalQuery.matches;
    g = vertical ? GEOMETRY.v : GEOMETRY.h;
    minPpd = fitPpd(viewAlong() - g.padStart - g.padEnd, todayDay - birthDay);
    ppd = minPpd;
    render();
    scrollAlong(0);
  }

  function zoomTo(next, anchorView = viewAlong() / 2) {
    next = Math.min(MAX_PPD, Math.max(minPpd, next));
    if (Math.abs(next - ppd) < 1e-9) return;
    const day = birthDay + (scrollAlong() + anchorView - g.padStart) / ppd;
    ppd = next;
    render();
    scrollAlong(g.padStart + (day - birthDay) * ppd - anchorView);
  }

  // --- Picking a moment ------------------------------------------------------

  const ghost = el('ghost');
  const alongOf = (clientX, clientY) => {
    const r = root.getBoundingClientRect();
    return vertical ? clientY - r.top + root.scrollTop : clientX - r.left + root.scrollLeft;
  };
  const viewOf = (clientX, clientY) => {
    const r = root.getBoundingClientRect();
    return vertical ? clientY - r.top : clientX - r.left;
  };
  const crossOf = (clientX, clientY) => {
    const r = root.getBoundingClientRect();
    return vertical ? clientX - r.left + root.scrollLeft : clientY - r.top + root.scrollTop;
  };
  const onLine = (clientX, clientY) => {
    const c = crossOf(clientX, clientY);
    const a = alongOf(clientX, clientY);
    return c >= zone[0] && c <= zone[1] && a >= g.padStart - 12 && a <= pos(todayDay) + 12;
  };
  const dayAt = along => Math.min(todayDay, Math.max(birthDay, Math.floor(birthDay + (along - g.padStart) / ppd)));

  function showGhost(a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (!ghost.isConnected) canvas.append(ghost);
    put(ghost, Math.max(lo, g.padStart), g.spine - 10, Math.min(hi, pos(todayDay)) - Math.max(lo, g.padStart), 20);
  }
  const hideGhost = () => ghost.remove();

  // Desktop: hovering the line shows where a click would land, and when.
  const hover = el('hover-mark');
  const hoverLabel = el('hover-label', 'span');
  hover.append(hoverLabel);
  function showHover(along, text) {
    if (!hover.isConnected) canvas.append(hover);
    const precision = prefillPrecision(ppd);
    put(hover, Math.min(Math.max(along, g.padStart), pos(todayDay)), g.spine);
    hoverLabel.textContent = text ?? formatDate({ date: normalise(fromDay(dayAt(along)), precision), precision });
  }
  const hideHover = () => hover.remove();

  function pick(a, b) {
    const precision = prefillPrecision(ppd);
    const d1 = normalise(fromDay(dayAt(b === undefined ? a : Math.min(a, b))), precision);
    if (b === undefined) return onPick({ start: { date: d1, precision } });
    const d2 = normalise(fromDay(dayAt(Math.max(a, b))), precision);
    onPick(d1 === d2 ? { start: { date: d1, precision } } : { start: { date: d1, precision }, end: { date: d2, precision } });
  }

  const onEvent = target => target.closest('.ev, .ev-label');

  // --- Moving a moment by dragging its mark -------------------------------------
  // A single moment moves as a whole. On a bar, an end moves that end and the middle
  // moves the whole stretch. Each date keeps its precision, so a month stays a month.

  let suppressClick = false; // the click that ends a drag must not open the sheet

  function gripOf(bar, along) {
    const ev = events.find(e => e.id === bar.dataset.id);
    if (!ev) return null;
    if (!ev.end) return 'move';
    const start = parseFloat(bar.style[vertical ? 'top' : 'left']);
    const len = parseFloat(bar.style[vertical ? 'height' : 'width']);
    const edge = Math.min(12, len / 3);
    if (along - start < edge) return 'start';
    if (ev.end.ongoing) return 'start'; // its end is today, so any grab moves the start
    if (start + len - along < edge) return 'end';
    return 'move';
  }

  function beginAdjust(bar, along) {
    const original = events.find(e => e.id === bar.dataset.id);
    return { mode: 'adjust', grip: gripOf(bar, along), from: along, original, draft: original, dragging: false };
  }

  function applyAdjust(adj, along) {
    const o = adj.original;
    let delta = Math.round((along - adj.from) / ppd);
    const s = toDay(o.start.date);
    const e = !o.end ? s : o.end.ongoing ? todayDay : toDay(o.end.date);
    if (adj.grip === 'move') delta = Math.min(Math.max(delta, birthDay - s), todayDay - e);
    const shift = pt => ({ ...pt, date: normalise(fromDay(Math.min(todayDay, Math.max(birthDay, toDay(pt.date) + delta))), pt.precision) });
    const d = { ...o };
    if (adj.grip !== 'end') d.start = shift(o.start);
    if (adj.grip !== 'start' && o.end && !o.end.ongoing) d.end = shift(o.end);
    // Never let the end overtake the start.
    if (d.end && !d.end.ongoing && toDay(d.end.date) < toDay(d.start.date)) {
      if (adj.grip === 'start') d.start = { ...d.start, date: normalise(d.end.date, d.start.precision) };
      else d.end = { ...d.end, date: normalise(d.start.date, d.end.precision) };
    }
    adj.draft = d;
    events = events.map(ev => (ev.id === d.id ? d : ev));
    render();
    showHover(along, formatSpan(d));
  }

  function endAdjust(adj, commit) {
    hideHover();
    if (commit && adj.draft !== adj.original) { onChange(adj.draft); return; }
    events = events.map(ev => (ev.id === adj.original.id ? adj.original : ev));
    render();
  }

  root.addEventListener('click', e => {
    if (suppressClick) { suppressClick = false; return; }
    const hit = onEvent(e.target);
    if (hit) onOpen(hit.dataset.id);
  });

  // A flick keeps gliding and slows down, like scrolling on a phone.
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let glide = 0;
  const stopGlide = () => { cancelAnimationFrame(glide); glide = 0; };
  function startGlide(vx, vy) {
    if (reducedMotion.matches || Math.hypot(vx, vy) < 0.1) return;
    let last = performance.now();
    const step = now => {
      const dt = Math.min(now - last, 40);
      last = now;
      root.scrollLeft -= vx * dt;
      root.scrollTop -= vy * dt;
      const decay = Math.pow(0.95, dt / 16.7);
      vx *= decay;
      vy *= decay;
      glide = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : 0;
    };
    glide = requestAnimationFrame(step);
  }

  // Mouse and pen: on the line, click picks a moment and drag a stretch of time.
  // Anywhere else, dragging moves the view.
  let mouse = null;
  root.addEventListener('pointerdown', e => {
    stopGlide();
    if (e.pointerType === 'touch' || e.button !== 0) return;
    const bar = e.target.closest('.ev');
    if (bar && gripOf(bar, alongOf(e.clientX, e.clientY))) {
      e.preventDefault();
      mouse = beginAdjust(bar, alongOf(e.clientX, e.clientY));
      root.setPointerCapture(e.pointerId);
      return;
    }
    if (onEvent(e.target)) return;
    e.preventDefault();
    if (onLine(e.clientX, e.clientY)) {
      mouse = { mode: 'pick', start: alongOf(e.clientX, e.clientY), dragging: false };
    } else {
      mouse = { mode: 'pan', x: e.clientX, y: e.clientY, left: root.scrollLeft, top: root.scrollTop, trail: [] };
      root.classList.add('is-panning');
      hideHover();
    }
    root.setPointerCapture(e.pointerId);
  });
  root.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (!mouse) {
      const bar = e.target.closest('.ev');
      if (bar) {
        const grip = gripOf(bar, alongOf(e.clientX, e.clientY));
        bar.style.cursor = grip === 'move' ? 'grab' : (vertical ? 'ns-resize' : 'ew-resize');
      }
      const over = onLine(e.clientX, e.clientY) && !onEvent(e.target);
      root.classList.toggle('is-over-line', over);
      if (over) showHover(alongOf(e.clientX, e.clientY)); else hideHover();
      return;
    }
    if (mouse.mode === 'adjust') {
      const now = alongOf(e.clientX, e.clientY);
      if (!mouse.dragging && Math.abs(now - mouse.from) > 4) mouse.dragging = true;
      if (mouse.dragging) applyAdjust(mouse, now);
      return;
    }
    if (mouse.mode === 'pan') {
      root.scrollLeft = mouse.left - (e.clientX - mouse.x);
      root.scrollTop = mouse.top - (e.clientY - mouse.y);
      // The last 100ms of movement decide how fast the release glides.
      const now = performance.now();
      mouse.trail.push({ t: now, x: e.clientX, y: e.clientY });
      while (mouse.trail.length > 2 && now - mouse.trail[0].t > 100) mouse.trail.shift();
      return;
    }
    const now = alongOf(e.clientX, e.clientY);
    if (!mouse.dragging && Math.abs(now - mouse.start) > 6) mouse.dragging = true;
    if (mouse.dragging) { hideHover(); showGhost(mouse.start, now); }
  });
  root.addEventListener('pointerup', e => {
    if (!mouse) return;
    const done = mouse;
    mouse = null;
    root.classList.remove('is-panning');
    if (done.mode === 'adjust') {
      if (done.dragging) { suppressClick = true; endAdjust(done, true); }
      return;
    }
    if (done.mode === 'pan') {
      const tr = done.trail;
      const a = tr[0], b = tr[tr.length - 1];
      // Only a release while still moving is a flick; stopping first means stay put.
      if (a && b !== a && performance.now() - b.t < 50) startGlide((b.x - a.x) / (b.t - a.t), (b.y - a.y) / (b.t - a.t));
      return;
    }
    const now = alongOf(e.clientX, e.clientY);
    hideGhost();
    hideHover();
    if (done.dragging) pick(done.start, now); else pick(now);
  });
  root.addEventListener('pointerleave', () => { if (!mouse) { hideHover(); root.classList.remove('is-over-line'); } });
  root.addEventListener('pointercancel', () => {
    if (mouse?.mode === 'adjust' && mouse.dragging) endAdjust(mouse, false);
    mouse = null;
    hideGhost();
    root.classList.remove('is-panning');
  });

  // Touch: tap picks a moment, press-and-hold then drag picks a stretch, two fingers zoom.
  let touch = null;
  root.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      clearTimeout(touch?.timer);
      hideGhost();
      const [p, q] = e.touches;
      touch = { pinch: true, dist: Math.hypot(p.clientX - q.clientX, p.clientY - q.clientY), ppd };
      return;
    }
    const t = e.touches[0];
    const bar = e.touches.length === 1 && e.target.closest('.ev');
    if (bar && gripOf(bar, alongOf(t.clientX, t.clientY))) {
      // Press and hold a bar to reshape it; a quick tap still opens it.
      touch = { x: t.clientX, y: t.clientY, moved: false };
      touch.timer = setTimeout(() => {
        touch.adjust = beginAdjust(bar, alongOf(touch.x, touch.y));
        navigator.vibrate?.(8);
        showHover(touch.adjust.from, formatSpan(touch.adjust.original));
      }, 350);
      return;
    }
    if (e.touches.length !== 1 || onEvent(e.target) || !onLine(t.clientX, t.clientY)) { touch = null; return; }
    touch = { x: t.clientX, y: t.clientY, start: alongOf(t.clientX, t.clientY), moved: false, held: false, t0: Date.now() };
    touch.timer = setTimeout(() => {
      touch.held = true;
      navigator.vibrate?.(8);
      showGhost(touch.start, touch.start + 1);
    }, 420);
  }, { passive: true });

  root.addEventListener('touchmove', e => {
    if (!touch) return;
    if (touch.pinch && e.touches.length === 2) {
      e.preventDefault();
      const [p, q] = e.touches;
      const dist = Math.hypot(p.clientX - q.clientX, p.clientY - q.clientY);
      zoomTo(touch.ppd * (dist / touch.dist), viewOf((p.clientX + q.clientX) / 2, (p.clientY + q.clientY) / 2));
      return;
    }
    const t = e.touches[0];
    if (touch.adjust) {
      e.preventDefault();
      touch.adjust.dragging = true;
      applyAdjust(touch.adjust, alongOf(t.clientX, t.clientY));
      return;
    }
    if (touch.held) {
      e.preventDefault();
      touch.now = alongOf(t.clientX, t.clientY);
      showGhost(touch.start, touch.now);
    } else if (Math.hypot(t.clientX - touch.x, t.clientY - touch.y) > 10) {
      touch.moved = true;
      clearTimeout(touch.timer);
    }
  }, { passive: false });

  root.addEventListener('touchend', e => {
    if (!touch) return;
    clearTimeout(touch.timer);
    const done = touch;
    if (done.pinch) { if (e.touches.length === 0) touch = null; return; }
    touch = null;
    if (done.adjust) {
      e.preventDefault();
      endAdjust(done.adjust, done.adjust.dragging);
      return;
    }
    if (!('start' in done)) return; // a tap on a bar: the click opens it
    hideGhost();
    if (done.held) {
      e.preventDefault();
      if (done.now !== undefined && Math.abs(done.now - done.start) > 10) pick(done.start, done.now);
      else pick(done.start);
    } else if (!done.moved && Date.now() - done.t0 < 400) {
      e.preventDefault(); // no synthetic click on top of the sheet
      pick(done.start);
    }
  });
  root.addEventListener('touchcancel', () => {
    clearTimeout(touch?.timer);
    if (touch?.adjust) endAdjust(touch.adjust, false);
    touch = null;
    hideGhost();
  });

  // The wheel zooms, around the pointer. A sideways trackpad swipe still scrolls.
  root.addEventListener('wheel', e => {
    stopGlide();
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : 1; // Firefox reports lines
    const speed = e.ctrlKey ? 0.01 : 0.0025; // pinch deltas are small, wheel notches large
    zoomTo(ppd * Math.exp(-e.deltaY * unit * speed), viewOf(e.clientX, e.clientY));
  }, { passive: false });

  // iOS Safari zooms the whole page on pinch unless told otherwise.
  document.addEventListener('gesturestart', e => e.preventDefault());

  let lastVertical = vertical;
  new ResizeObserver(() => {
    if (!birthIso) return;
    if (verticalQuery.matches !== lastVertical) { lastVertical = verticalQuery.matches; fit(); return; }
    minPpd = fitPpd(viewAlong() - g.padStart - g.padEnd, todayDay - birthDay);
    if (ppd < minPpd) ppd = minPpd;
    softRender();
  }).observe(root);

  return {
    setData(settings, list) {
      const first = birthIso !== settings.birthDate;
      birthIso = settings.birthDate;
      birthDay = toDay(birthIso);
      todayDay = toDay(todayIso());
      events = list;
      if (first) fit(); else render();
    },
    rerender: softRender,
    zoomBy: f => zoomTo(ppd * f),
    canZoom: () => ({ in: ppd < MAX_PPD - 1e-9, out: ppd > minPpd + 1e-9 }),
    animateIn(reduced) {
      if (reduced) return Promise.resolve();
      drawing = true;
      canvas.classList.add('pre');
      void canvas.offsetWidth;
      return new Promise(resolve => {
        // Two frames: the first paints the empty state, the second starts the drawing.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          canvas.classList.add('drawing');
          canvas.classList.remove('pre');
          setTimeout(() => {
            canvas.classList.remove('drawing');
            drawing = false;
            if (renderHeld) { renderHeld = false; render(); }
            resolve();
          }, DRAW_MS + 900);
        }));
      });
    },
    focusEvent(id) { canvas.querySelector(`.ev[data-id="${CSS.escape(id)}"]`)?.focus(); },
  };
}
