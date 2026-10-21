// Wiring: the birthday screen, the line, the sheet and the menu.

import * as store from './storage.js';
import { createTimeline } from './timeline.js';
import { createSheet } from './sheet.js';
import { swipeToClose } from './swipe.js';
import { typedDate } from './typed-date.js';
import { todayIso } from './dates.js';

const $ = sel => document.querySelector(sel);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const verticalQuery = matchMedia('(max-width: 767px), (orientation: portrait)');

const intro = $('#intro');
const introForm = $('#intro-form');
const app = $('#app');
const hint = $('.hint');
const zoomIn = $('[data-zoom="in"]');
const zoomOut = $('[data-zoom="out"]');

let settings = null;
let events = [];
let filter = 'all';

// "Beides" belongs to both the good and the hard moments.
const shown = () => filter === 'all' ? events : events.filter(e => e.tone === filter || e.tone === 'mixed');

// --- A quiet confirm, instead of the browser's own box ------------------------

const confirmDialog = $('#confirm');
function confirm(text, okLabel, withCancel = true) {
  confirmDialog.querySelector('.confirm-text').textContent = text;
  confirmDialog.querySelector('.confirm-ok').textContent = okLabel;
  confirmDialog.querySelector('.confirm-cancel').hidden = !withCancel;
  confirmDialog.returnValue = '';
  confirmDialog.showModal();
  return new Promise(resolve => {
    confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'ok'), { once: true });
  });
}

// --- The line --------------------------------------------------------------------

const sheet = createSheet($('#sheet'), {
  confirm,
  async onSave(ev) {
    const saved = await store.saveEvent(ev);
    events = events.filter(e => e.id !== saved.id).concat(saved);
    // A moment that the current filter would hide must not seem to vanish on save.
    if (!shown().includes(saved)) setFilter('all');
    refresh();
    requestAnimationFrame(() => timeline.focusEvent(saved.id));
  },
  async onDelete(id) {
    await store.deleteEvent(id);
    events = events.filter(e => e.id !== id);
    refresh();
  },
});

const timeline = createTimeline($('.track'), {
  verticalQuery,
  onPick: draft => sheet.open({ ...draft }, settings.birthDate),
  async onChange(ev) {
    const saved = await store.saveEvent(ev);
    events = events.map(e => (e.id === saved.id ? saved : e));
    refresh();
  },
  onOpen: id => {
    const ev = events.find(e => e.id === id);
    if (ev) sheet.open(structuredClone(ev), settings.birthDate);
  },
});

function updateZoomButtons() {
  const z = timeline.canZoom();
  zoomIn.disabled = !z.in;
  zoomOut.disabled = !z.out;
}

function setFilter(value) {
  filter = value;
  document.querySelector(`input[name="filter"][value="${value}"]`).checked = true;
}
document.querySelectorAll('input[name="filter"]').forEach(r => r.addEventListener('change', () => { setFilter(r.value); refresh(); }));

function refresh() {
  timeline.setData(settings, shown());
  hint.hidden = events.length > 0;
  updateZoomButtons();
}

zoomIn.addEventListener('click', () => { timeline.zoomBy(1.8); updateZoomButtons(); });
zoomOut.addEventListener('click', () => { timeline.zoomBy(1 / 1.8); updateZoomButtons(); });
$('.track').addEventListener('wheel', () => requestAnimationFrame(updateZoomButtons), { passive: true });
$('.track').addEventListener('touchend', updateZoomButtons, { passive: true });

$('.add').addEventListener('click', () => {
  sheet.open({ start: { date: todayIso(), precision: 'month' } }, settings.birthDate);
});

// --- Birthday ----------------------------------------------------------------------

const birth = typedDate($('.birth-date'), 'Geburtsdatum');
const introError = $('.intro-error');

function showIntro(editing) {
  app.hidden = true;
  intro.hidden = false;
  intro.classList.toggle('is-editing', editing);
  birth.set(editing ? settings.birthDate : '');
  introError.hidden = true;
  introForm.querySelector('.intro-submit').textContent = editing ? 'Speichern' : 'Zeitstrahl zeichnen';
  $('.intro-cancel').hidden = !editing;
  if (matchMedia('(pointer: fine)').matches) birth.focus();
}

$('.intro-cancel').addEventListener('click', () => { intro.hidden = true; app.hidden = false; });

introForm.addEventListener('submit', async e => {
  e.preventDefault();
  const birthDate = birth.get();
  const problem = !birthDate
    ? (birth.isComplete()
      ? 'Dieses Datum gibt es nicht. Prüf Tag und Monat noch einmal.'
      : 'Tippe dein Geburtsdatum als Tag, Monat und Jahr ein, zum Beispiel 14.05.1991.')
    : birthDate > todayIso() ? 'Dein Geburtsdatum liegt in der Zukunft. Prüf das Jahr noch einmal.'
    : birthDate < '1900-01-01' ? 'Der Zeitstrahl beginnt frühestens 1900. Prüf das Jahr noch einmal.'
    : '';
  introError.textContent = problem;
  introError.hidden = !problem;
  if (problem) return;
  settings = { ...settings, birthDate };
  await store.setSettings(settings);
  if (reduced.matches) {
    intro.hidden = true;
    app.hidden = false;
    refresh();
    return;
  }
  await arrive(birthDate);
});

// One motion: the year leaves its box and becomes the year under "Geburt" on the line,
// while the view pulls back from close around that spot and the line draws itself to
// today. The day and month fade away with the rest of the screen.
async function arrive(birthDate) {
  const yearBox = $('.birth-date .typed-date input:last-of-type');
  const box = yearBox.getBoundingClientRect();
  const boxFont = parseFloat(getComputedStyle(yearBox).fontSize);

  const fly = document.createElement('div');
  fly.className = 'birth-fly';
  fly.setAttribute('aria-hidden', 'true');
  fly.textContent = birthDate.slice(0, 4);
  document.body.append(fly);
  const natural = fly.getBoundingClientRect(); // styled exactly like the label, unscaled
  const s0 = boxFont / parseFloat(getComputedStyle(fly).fontSize);
  const x0 = box.left + box.width / 2, y0 = box.top + box.height / 2;
  const place = (x, y, s) => { fly.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`; };
  place(x0, y0, s0);
  yearBox.style.color = 'transparent';

  // The line appears underneath while the birthday screen fades off it.
  app.hidden = false;
  refresh();
  intro.classList.add('is-leaving');
  setTimeout(() => {
    intro.hidden = true;
    intro.classList.remove('is-leaving');
    yearBox.style.color = '';
  }, 420);

  const label = timeline.birthYearLabel();
  label.classList.add('is-carried');
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  await new Promise(done => {
    timeline.animateIn(false, {
      zoomFrom: 4,
      pivot: label, // the year's place holds still while the life opens out around it
      onStart(duration) {
        fly.classList.add('is-landing'); // colour eases to the label's
        const t0 = performance.now();
        const follow = now => {
          const p = Math.min(1, (now - t0) / duration);
          const e = ease(p);
          // The label shrinks with the zoom around it; the year glides in and matches it.
          const r = label.getBoundingClientRect();
          place(lerp(x0, r.left + r.width / 2, e), lerp(y0, r.top + r.height / 2, e), lerp(s0, r.height / natural.height, e));
          if (p < 1) return requestAnimationFrame(follow);
          label.classList.remove('is-carried');
          fly.remove();
          done();
        };
        requestAnimationFrame(follow);
      },
    });
  });
}

// --- Menu ----------------------------------------------------------------------------

const menu = $('#menu');
swipeToClose($('#sheet'));
swipeToClose(menu);
$('.menu-open').addEventListener('click', () => menu.showModal());
menu.addEventListener('click', e => { if (e.target === menu) menu.close(); });
const fileInput = $('#import-file');

menu.addEventListener('click', async e => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'close') return menu.close();

  if (action === 'export') {
    const blob = new Blob([await store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zeitstrahl-${todayIso()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  if (action === 'import') fileInput.click();
  if (action === 'birth') { menu.close(); showIntro(true); }
  if (action === 'clear') {
    menu.close();
    if (await confirm('Alle Einträge und dein Geburtsdatum werden von diesem Gerät gelöscht. Sichere sie vorher als Datei, wenn du sie behalten willst.', 'Alles löschen')) {
      await store.clearAll();
      settings = null;
      events = [];
      showIntro(false);
    }
  }
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  menu.close();
  if (events.length && !(await confirm('Die Datei ersetzt alles, was gerade in deinem Zeitstrahl steht.', 'Datei laden'))) return;
  try {
    await store.importJSON(await file.text());
  } catch {
    await confirm('Diese Datei ist keine Zeitstrahl-Sicherung. Wähle eine Datei, die du hier über „Als Datei sichern“ gespeichert hast.', 'Verstanden', false);
    return;
  }
  settings = await store.getSettings();
  events = await store.loadEvents();
  intro.hidden = true;
  app.hidden = false;
  refresh();
});

// --- Start -----------------------------------------------------------------------------

async function start() {
  settings = await store.getSettings();
  if (!settings) return showIntro(false);
  events = await store.loadEvents();
  app.hidden = false;
  refresh();
  // Fonts change label widths; lay out once more when they are in.
  document.fonts?.ready.then(() => timeline.rerender());
  // Every visit begins the same way: the line draws itself from birth to today.
  timeline.animateIn(reduced.matches);
}

start();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
