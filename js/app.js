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

// The birthday leaves its boxes, travels to where the line begins and becomes its first
// point; then the view pulls back while the line draws itself to today.
const FLY_MS = 1400;
async function arrive(birthDate) {
  const from = $('.birth-date .typed-date').getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'birth-fly';
  fly.setAttribute('aria-hidden', 'true');
  const [y, m, d] = birthDate.split('-');
  fly.textContent = `${d}.${m}.${y}`;
  fly.style.left = `${from.left + from.width / 2}px`;
  fly.style.top = `${from.top + from.height / 2}px`;
  document.body.append(fly);

  intro.classList.add('is-leaving');
  await new Promise(r => setTimeout(r, 420));
  intro.hidden = true;
  intro.classList.remove('is-leaving');
  app.hidden = false;
  refresh();

  let landed;
  const drawn = timeline.animateIn(false, { zoomFrom: 4, after: new Promise(r => { landed = r; }) });
  const to = timeline.birthPoint();
  const dx = to.x - (from.left + from.width / 2);
  const dy = to.y - (from.top + from.height / 2);
  const ease = 'cubic-bezier(0.45, 0.05, 0.35, 1)';
  fly.animate(
    [{ transform: 'translate(-50%, -50%)' }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.2)` }],
    { duration: FLY_MS, easing: ease, fill: 'forwards' },
  );
  // The line starts just before the date arrives, so the date dissolves into its first point.
  setTimeout(landed, FLY_MS - 250);
  await fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, delay: FLY_MS - 220, fill: 'forwards' }).finished;
  fly.remove();
  await drawn;
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
