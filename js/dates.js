// Dates as whole UTC day numbers, so daylight saving never shifts a day.
// A stored date is always an ISO string 'YYYY-MM-DD' plus a precision.

const DAY_MS = 86400000;

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const pad = n => String(n).padStart(2, '0');

export const iso = (y, m, d) => `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
export const parts = s => s.split('-').map(Number);
export const toDay = s => { const [y, m, d] = parts(s); return Date.UTC(y, m - 1, d) / DAY_MS; };
export const fromDay = n => new Date(n * DAY_MS).toISOString().slice(0, 10);

export function todayIso() {
  const t = new Date();
  return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

// The first day of the unit a date falls in: its Monday, month or year.
export function normalise(s, precision) {
  const [y, m, d] = parts(s);
  if (precision === 'year') return iso(y, 1, 1);
  if (precision === 'month') return iso(y, m, 1);
  if (precision === 'week') {
    const n = toDay(s);
    const weekday = (new Date(n * DAY_MS).getUTCDay() + 6) % 7;
    return fromDay(n - weekday);
  }
  return iso(y, m, d);
}

// The days a fuzzy date covers, as [first, afterLast).
export function extent({ date, precision }) {
  const s = toDay(date);
  const [y, m] = parts(date);
  if (precision === 'year') return [s, Date.UTC(y + 1, 0, 1) / DAY_MS];
  if (precision === 'month') return [s, Date.UTC(y, m, 1) / DAY_MS];
  if (precision === 'week') return [s, s + 7];
  return [s, s + 1];
}

export function formatDate({ date, precision }) {
  const [y, m, d] = parts(date);
  if (precision === 'year') return String(y);
  if (precision === 'month') return `${MONTHS[m - 1]} ${y}`;
  if (precision === 'week') return `Woche vom ${d}. ${MONTHS[m - 1]} ${y}`;
  return `${d}. ${MONTHS[m - 1]} ${y}`;
}

// The span an event covers on the line, with how fuzzy each end is (in days).
export function span(ev, today) {
  const [s0, s1] = extent(ev.start);
  const startFuzz = ev.start.precision === 'day' ? 0 : s1 - s0;
  if (!ev.end) return { s: s0, e: s1, startFuzz, endFuzz: startFuzz, lasting: false };
  if (ev.end.ongoing) return { s: s0, e: today + 1, startFuzz, endFuzz: 0, lasting: true, ongoing: true };
  const [e0, e1] = extent(ev.end);
  return { s: s0, e: Math.max(e1, s1), startFuzz, endFuzz: ev.end.precision === 'day' ? 0 : e1 - e0, lasting: true };
}

export function formatSpan(ev) {
  const a = formatDate(ev.start);
  if (!ev.end) return a;
  if (ev.end.ongoing) return `seit ${a}`;
  return `${a} bis ${formatDate(ev.end)}`;
}
