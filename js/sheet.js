// The sheet where a moment gets its words and its date. One date field adapts to how
// precisely someone remembers: a day, a week, a month or only the year.

import { MONTHS, parts, iso, normalise, toDay, todayIso, formatDate } from './dates.js';
import { typedDate } from './typed-date.js';

const PRECISIONS = [['day', 'Tag'], ['week', 'Woche'], ['month', 'Monat'], ['year', 'Jahr']];
let uid = 0;

function dateField(host, legend) {
  const id = `df${uid++}`;
  host.innerHTML = `
    <fieldset class="date-field">
      <legend>${legend}</legend>
      <div class="segmented" role="radiogroup" aria-label="Wie genau weißt du es?">
        ${PRECISIONS.map(([v, l]) => `<label><input type="radio" name="${id}-p" value="${v}"><span>${l}</span></label>`).join('')}
      </div>
      <div class="date-inputs"></div>
      <p class="field-hint" hidden>Wähle irgendeinen Tag in dieser Woche.</p>
    </fieldset>`;
  const inputs = host.querySelector('.date-inputs');
  const hint = host.querySelector('.field-hint');
  let value = todayIso();
  let precision = 'year';
  let min = '1900-01-01';
  let typed = null;   // the TT.MM.JJJJ boxes, while day or week is chosen
  let invalid = false;

  function draw() {
    host.querySelector(`input[value="${precision}"]`).checked = true;
    const [y, m] = parts(value);
    const max = todayIso();
    const [minY] = parts(min), [maxY] = parts(max);
    hint.hidden = precision !== 'week';
    typed = null;
    if (precision === 'day' || precision === 'week') {
      typed = typedDate(inputs, 'Datum');
      typed.set(value);
    } else if (precision === 'month') {
      inputs.innerHTML = `
        <select class="input" aria-label="Monat">${MONTHS.map((n, i) => `<option value="${i + 1}"${i + 1 === m ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <input type="number" class="input input-year" aria-label="Jahr" inputmode="numeric" min="${minY}" max="${maxY}" value="${y}">`;
    } else {
      inputs.innerHTML = `<input type="number" class="input input-year" aria-label="Jahr" inputmode="numeric" min="${minY}" max="${maxY}" value="${y}">`;
    }
  }

  function read() {
    invalid = false;
    if (typed) {
      const v = typed.get();
      if (v) value = v; else invalid = true;
      return;
    }
    const year = Number(inputs.querySelector('.input-year').value);
    const month = Number(inputs.querySelector('select')?.value ?? 1);
    if (year >= 1000 && year <= 9999) value = iso(year, month, 1);
  }

  host.addEventListener('change', e => {
    if (e.target.name === `${id}-p`) { read(); precision = e.target.value; draw(); } else read();
  });

  return {
    set(v, p, minIso) { value = v; precision = p; min = minIso; draw(); },
    // date is null while the typed day is incomplete or does not exist.
    get() { read(); return { date: invalid ? null : normalise(value, precision), precision }; },
    focus() { inputs.querySelector('input, select')?.focus(); },
  };
}

export function createSheet(dialog, { onSave, onDelete, confirm }) {
  const form = dialog.querySelector('form');
  const heading = dialog.querySelector('.sheet-title');
  const title = form.elements.title;
  const note = form.elements.note;
  const lasting = form.elements.lasting;
  const ongoing = form.elements.ongoing;
  const endBlock = dialog.querySelector('.end-block');
  const endDate = dialog.querySelector('.end-date');
  const error = dialog.querySelector('.form-error');
  const del = dialog.querySelector('.sheet-delete');
  const start = dateField(dialog.querySelector('.start-field'), 'Wann war das?');
  const end = dateField(dialog.querySelector('.end-field'), 'Bis wann?');

  let current = null;

  const markTitle = bad => {
    title.classList.toggle('is-invalid', bad);
    if (bad) title.setAttribute('aria-invalid', 'true'); else title.removeAttribute('aria-invalid');
  };
  // The red goes as soon as something is typed.
  title.addEventListener('input', () => { if (title.value.trim()) markTitle(false); });
  let birthIso = '1900-01-01';

  const syncEnd = () => {
    endBlock.hidden = !lasting.checked;
    endDate.hidden = ongoing.checked;
  };
  // Until the end has been set by hand, it starts out like the start, same precision.
  let endTouched = false;
  dialog.querySelector('.end-field').addEventListener('change', () => { endTouched = true; });
  lasting.addEventListener('change', () => {
    if (lasting.checked && !endTouched) {
      const s = start.get();
      end.set(s.date, s.precision, birthIso);
    }
    syncEnd();
  });
  ongoing.addEventListener('change', syncEnd);

  // Tone chips are radios that can be unset again: none chosen means no tone.
  form.querySelectorAll('input[name="tone"]').forEach(r => {
    r.addEventListener('click', () => {
      if (r.dataset.was === 'on') { r.checked = false; }
      form.querySelectorAll('input[name="tone"]').forEach(o => { o.dataset.was = o.checked ? 'on' : ''; });
    });
  });

  function validate(ev) {
    if (!ev.title) return 'Gib dem Moment ein paar Worte.';
    if (!ev.start.date || (ev.end && !ev.end.ongoing && !ev.end.date)) return 'Dieses Datum gibt es so nicht. Tippe es als Tag, Monat und Jahr ein, zum Beispiel 14.05.1991.';
    const last = toDay(todayIso());
    const s = toDay(ev.start.date);
    if (s > last) return 'Der Zeitstrahl reicht bis heute. Wähle ein früheres Datum.';
    if (s < toDay(normalise(birthIso, ev.start.precision))) return `Der Zeitstrahl beginnt mit deiner Geburt am ${formatDate({ date: birthIso, precision: 'day' })}.`;
    if (ev.end && !ev.end.ongoing) {
      if (toDay(ev.end.date) > last) return 'Das Ende liegt in der Zukunft. Wähle „Dauert noch an“.';
      if (toDay(ev.end.date) < s) return 'Das Ende liegt vor dem Anfang.';
    }
    return '';
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const tone = form.querySelector('input[name="tone"]:checked')?.value ?? 'neutral';
    const ev = {
      ...current,
      title: title.value.trim(),
      note: note.value.trim() || undefined,
      tone,
      start: start.get(),
      end: lasting.checked ? (ongoing.checked ? { ongoing: true } : end.get()) : undefined,
    };
    const problem = validate(ev);
    error.textContent = problem;
    error.hidden = !problem;
    markTitle(!ev.title);
    if (problem) {
      // A missing title is the usual case: show the field itself, not only the message.
      if (!ev.title) { title.scrollIntoView({ block: 'center', behavior: 'smooth' }); title.focus({ preventScroll: true }); }
      return;
    }
    await onSave(ev);
    dialog.close();
  });

  dialog.querySelector('.sheet-cancel').addEventListener('click', () => dialog.close());
  del.addEventListener('click', async () => {
    if (await confirm('Diesen Eintrag löschen?', 'Löschen')) {
      await onDelete(current.id);
      dialog.close();
    }
  });
  // A tap on the dimmed backdrop closes the sheet, like everywhere else on a phone.
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

  return {
    open(ev, birth) {
      birthIso = birth;
      current = ev;
      const isNew = !ev.id;
      heading.textContent = isNew ? 'Etwas eintragen' : 'Eintrag ändern';
      del.hidden = isNew;
      error.hidden = true;
      markTitle(false);
      title.value = ev.title ?? '';
      note.value = ev.note ?? '';
      form.querySelectorAll('input[name="tone"]').forEach(r => {
        r.checked = r.value === ev.tone;
        r.dataset.was = r.checked ? 'on' : '';
      });
      start.set(ev.start.date, ev.start.precision, birthIso);
      lasting.checked = !!ev.end;
      ongoing.checked = !!ev.end?.ongoing;
      const e = ev.end && !ev.end.ongoing ? ev.end : ev.start;
      end.set(e.date, e.precision, birthIso);
      endTouched = !!ev.end;
      syncEnd();
      dialog.showModal();
      // On a phone, opening the keyboard right away hides half the sheet. Only a
      // mouse-and-keyboard setup gets the cursor straight into the title.
      if (isNew && matchMedia('(pointer: fine)').matches) title.focus();
    },
  };
}
