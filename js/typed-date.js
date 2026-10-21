// A date you type: TT . MM . JJJJ. Instead of the browser's date picker, which on iOS
// is a calendar that is slow for a birthday decades back and overflows narrow screens.
// Digits jump to the next box by themselves, a pasted "14.05.1991" fills all three.

import { iso, parts } from './dates.js';

const pad = v => (v.length === 1 ? `0${v}` : v);

export function typedDate(host, label) {
  host.innerHTML = `
    <div class="typed-date" role="group" aria-label="${label}">
      <input class="input" inputmode="numeric" autocomplete="off" maxlength="2" placeholder="TT" aria-label="Tag">
      <span class="typed-sep" aria-hidden="true">.</span>
      <input class="input" inputmode="numeric" autocomplete="off" maxlength="2" placeholder="MM" aria-label="Monat">
      <span class="typed-sep" aria-hidden="true">.</span>
      <input class="input" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="JJJJ" aria-label="Jahr">
    </div>`;
  const fields = [...host.querySelectorAll('input')];
  const [d, m, y] = fields;

  fields.forEach((f, i) => {
    f.addEventListener('input', () => {
      const full = f.value.match(/^\s*(\d{1,2})\D+(\d{1,2})\D+(\d{4})\s*$/);
      if (full) {
        d.value = pad(full[1]); m.value = pad(full[2]); y.value = full[3];
        y.focus();
        return;
      }
      f.value = f.value.replace(/\D/g, '').slice(0, f.maxLength);
      if (f.value.length === f.maxLength && i < 2) fields[i + 1].focus();
    });
    f.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !f.value && i > 0) fields[i - 1].focus();
      if (['.', '/', '-', ' '].includes(e.key)) { e.preventDefault(); if (i < 2) fields[i + 1].focus(); }
    });
    f.addEventListener('blur', () => { if (i < 2 && f.value.length === 1) f.value = pad(f.value); });
  });

  return {
    // The ISO date, or null when it is incomplete or a day that does not exist.
    get() {
      const dd = Number(d.value), mm = Number(m.value), yy = Number(y.value);
      if (!dd || !mm || y.value.length !== 4) return null;
      const t = new Date(Date.UTC(yy, mm - 1, dd));
      if (t.getUTCMonth() !== mm - 1 || t.getUTCDate() !== dd) return null;
      return iso(yy, mm, dd);
    },
    set(value) {
      if (!value) { d.value = m.value = y.value = ''; return; }
      const [yy, mm, dd] = parts(value);
      d.value = pad(String(dd)); m.value = pad(String(mm)); y.value = String(yy);
    },
    isComplete: () => d.value.length > 0 && m.value.length > 0 && y.value.length === 4,
    focus: () => d.focus(),
  };
}
