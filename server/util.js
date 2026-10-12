export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const fmtMinutes = (min) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const slotStart = (s) => toMinutes(s.start_time);
export const slotEnd = (s) => toMinutes(s.start_time) + Number(s.duration_min || 0);
export const endTime = (s) => fmtMinutes(slotEnd(s));

export function slotsOverlap(a, b) {
  return a.date === b.date && slotStart(a) < slotEnd(b) && slotStart(b) < slotEnd(a);
}

/** Minutes between two slots on the same day (0 if they overlap, Infinity on different days). */
export function slotGap(a, b) {
  if (a.date !== b.date) return Infinity;
  if (slotsOverlap(a, b)) return 0;
  return Math.max(slotStart(b) - slotEnd(a), slotStart(a) - slotEnd(b));
}

export const naturalCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;

export function fmtDate(iso, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

export function fmtTime12(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function fmtDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} hr${h > 1 ? 's' : ''}`;
  return `${h} hr ${m} min`;
}

export const paperLabel = (p) =>
  `${p.course_code}${p.semester ? ` · Sem ${p.semester}` : ''}${p.subject ? ` — ${p.subject}` : ''}`;

export const paperShort = (p) => `${p.course_code}${p.semester ? `-${p.semester}` : ''}`;

export const clean = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function requireFields(body, fields) {
  const missing = fields.filter((f) => clean(body?.[f]) === null);
  if (missing.length) throw new HttpError(400, `Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
}
