export function parseDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type DateStyle = 'short' | 'medium' | 'long' | 'weekday' | 'day-month';

export function fmtDate(iso: string | null | undefined, style: DateStyle = 'medium') {
  if (!iso) return '—';
  const d = parseDate(iso);
  const opts: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { day: 'numeric', month: 'short' }
      : style === 'day-month'
        ? { weekday: 'short', day: 'numeric', month: 'short' }
        : style === 'long'
          ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
          : style === 'weekday'
            ? { weekday: 'long' }
            : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  return d.toLocaleDateString('en-GB', opts);
}

export function fmtTime(hhmm: string | null | undefined) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} hr${h > 1 ? 's' : ''}`;
  return `${h}h ${m}m`;
}

export function addMinutes(hhmm: string, min: number) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m + min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function daysUntil(iso: string) {
  const a = parseDate(iso).getTime();
  const b = parseDate(todayISO()).getTime();
  return Math.round((a - b) / 86400000);
}

export function relativeDay(iso: string) {
  const n = daysUntil(iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return `In ${n} days`;
  if (n < -1 && n > -7) return `${-n} days ago`;
  return fmtDate(iso, 'short');
}

/** Parse API timestamps (ISO strings or SQLite UTC "YYYY-MM-DD HH:MM:SS"). */
export function parseStamp(s: string) {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return new Date(s.replace(' ', 'T') + 'Z');
  return new Date(s);
}

export function timeAgo(s: string | null | undefined) {
  if (!s) return 'never';
  const d = parseStamp(s);
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr${hr > 1 ? 's' : ''} ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day > 1 ? 's' : ''} ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtStamp(s: string | null | undefined) {
  if (!s) return '—';
  return parseStamp(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export const plural = (n: number, word: string, pluralWord = `${word}s`) => `${n.toLocaleString()} ${n === 1 ? word : pluralWord}`;

export function initials(name: string) {
  const parts = name
    .replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export const paperLabel = (p: { course_code: string; semester: string | null; subject: string | null }) =>
  `${p.course_code}${p.semester ? ` · Sem ${p.semester}` : ''}${p.subject ? ` — ${p.subject}` : ''}`;
