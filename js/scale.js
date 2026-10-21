// Time to pixels: one number, pixels per day (ppd), plus the marks along the line.

import { parts, MONTHS_SHORT } from './dates.js';

const DAY_MS = 86400000;
export const MAX_PPD = 8; // a month is about 240px: as close as anyone needs

export function fitPpd(available, days) {
  return Math.min(MAX_PPD, available / Math.max(days, 30));
}

// How precise a date picked at this zoom can honestly be.
export function prefillPrecision(ppd) {
  if (ppd >= 2) return 'day';
  if (ppd >= 0.8) return 'month';
  return 'year';
}

// Birthdays carry the main marks, because a life is read in ages, not calendar years.
// Months appear once there is room for them.
export function ticks(birthIso, todayDay, ppd, minGap) {
  const [by, bm, bd] = parts(birthIso);
  const pxYear = ppd * 365.25;
  const step = [1, 2, 5, 10, 20].find(s => s * pxYear >= minGap) ?? 20;
  const out = [];
  const birthdays = [];

  for (let a = 0; ; a++) {
    const day = Date.UTC(by + a, bm - 1, bd) / DAY_MS;
    if (day > todayDay) break;
    birthdays.push(day);
    // The last mark before today would collide with the "Heute" label.
    const labelled = a % step === 0 && (todayDay - day) * ppd >= minGap * 0.8;
    if (labelled || pxYear >= 6) out.push({ day, kind: 'age', age: a, year: by + a, labelled });
  }

  const pxMonth = ppd * 30.44;
  if (pxMonth >= 10) {
    for (let y = by, m = bm; ; m++) {
      if (m > 12) { m = 1; y++; }
      const day = Date.UTC(y, m - 1, 1) / DAY_MS;
      if (day > todayDay) break;
      if (y === by && m === bm) continue;
      const nearAge = birthdays.some(b => Math.abs(b - day) * ppd < minGap * 0.8) || (todayDay - day) * ppd < minGap * 0.8;
      out.push({ day, kind: 'month', label: MONTHS_SHORT[m - 1], labelled: pxMonth >= minGap && !nearAge });
    }
  }
  return out;
}
