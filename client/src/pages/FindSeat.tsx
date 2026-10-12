import { ArrowRight, LogIn, MapPin, Printer, Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { http, useApi } from '@/lib/api';
import type { LayoutShape } from '@/lib/types';
import { Logo } from '@/components/AppShell';
import { Button, Callout, Highlight, cn } from '@/components/ui';
import { SeatMap } from '@/components/SeatMap';
import { fmtDate, fmtDuration, fmtTime, relativeDay } from '@/lib/format';

interface SeatResult {
  student: { roll_no: string; name: string; course_code: string; course_name: string; semester: string | null };
  exams: {
    slot: { id: number; exam_name: string; date: string; start_time: string; end_time: string; duration_min: number; session: string | null };
    paper: { short: string; subject: string | null; subject_code: string | null } | null;
    room: { id: number; name: string; building: string | null; floor: string | null; layout: LayoutShape; blocked: string[] };
    seat: { r: number; c: number; label: string };
  }[];
}

/** Decorative barcode derived from the roll number (purely visual). */
function Barcode({ value }: { value: string }) {
  const bars = Array.from(value + value.split('').reverse().join('')).flatMap((ch, i) => {
    const n = ch.charCodeAt(0) + i;
    return [1 + (n % 3), 1 + ((n >> 2) % 2)];
  });
  return (
    <div className="flex h-10 items-stretch gap-[2px]" aria-hidden>
      {bars.map((w, i) => (
        <span key={i} className={i % 2 ? 'bg-transparent' : 'bg-ink'} style={{ width: w }} />
      ))}
    </div>
  );
}

function AdmitCard({ e, student }: { e: SeatResult['exams'][number]; student: SeatResult['student'] }) {
  const today = relativeDay(e.slot.date) === 'Today';
  return (
    <article className="relative grid overflow-hidden rounded-3xl border border-ink bg-white shadow-ink-lg md:grid-cols-[minmax(0,1fr)_auto]">
      <div>
        <div className={cn('flex items-center justify-between border-b border-ink px-6 py-2.5', today ? 'bg-coral text-white' : 'bg-mark text-ink')}>
          <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.16em]">Admit card · {e.slot.exam_name}</span>
          <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.16em]">{relativeDay(e.slot.date)}</span>
        </div>
        <div className="p-6">
          <div className="eyebrow">Paper</div>
          <div className="mt-1 font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">
            {e.paper?.subject || e.paper?.short}
            {e.paper?.subject_code && <span className="ml-2 font-mono text-[13px] font-semibold text-slate-400">{e.paper.subject_code}</span>}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
            {[
              ['Date', fmtDate(e.slot.date, 'day-month')],
              ['Time', `${fmtTime(e.slot.start_time)} – ${fmtTime(e.slot.end_time)}`],
              ['Duration', fmtDuration(e.slot.duration_min)],
              ['Candidate', student.name],
              ['Roll no.', student.roll_no],
              ['Building', [e.room.building, e.room.floor && `${e.room.floor} floor`].filter(Boolean).join(', ') || '—'],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-400">{k}</dt>
                <dd className={cn('mt-0.5 truncate text-[14px] font-semibold text-ink', k === 'Roll no.' && 'font-mono')}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-ink/15 bg-paper px-5 py-4">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Room</div>
              <div className="mt-1 font-display text-[24px] font-semibold leading-[1.05] tracking-[-0.02em]">{e.room.name}</div>
            </div>
            <div className="rounded-2xl border border-ink bg-ink px-5 py-4 text-white shadow-mark">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-mark">Seat</div>
              <div className="mt-1 font-display text-[40px] font-semibold leading-none tracking-[-0.03em]">{e.seat.label}</div>
            </div>
          </div>
          <div className="mt-6 flex items-end justify-between gap-4">
            <Barcode value={student.roll_no} />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">Carry your college ID</span>
          </div>
        </div>
      </div>
      <div className="relative border-t border-dashed border-ink/25 bg-paper/50 p-6 md:border-l md:border-t-0">
        <span className="ticket-notch -left-[11px] -top-[11px] hidden md:block" />
        <span className="ticket-notch -bottom-[11px] -left-[11px] hidden md:block" />
        <div className="mb-3 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          <MapPin className="size-3.5" /> Where you sit in {e.room.name}
        </div>
        <div className="flex max-w-full overflow-auto">
          <SeatMap
            layout={e.room.layout}
            blocked={e.room.blocked}
            size="sm"
            cell={(c) => {
              const mine = c.r === e.seat.r && c.c === e.seat.c;
              if (!c.seat) return <div className="size-full rounded border border-dashed border-ink/10" />;
              return (
                <div
                  className={cn(
                    'flex size-full items-center justify-center rounded font-mono text-[9px] font-bold',
                    mine ? 'relative z-10 scale-[1.18] border border-ink bg-mark text-ink shadow-ink-sm' : 'border border-ink/10 bg-white',
                  )}
                >
                  {mine ? c.seat.label : ''}
                </div>
              );
            }}
          />
        </div>
      </div>
    </article>
  );
}

export default function FindSeat() {
  const { data: info } = useApi<{ institution_name: string; exam_cell_name: string }>('/public/info');
  const [roll, setRoll] = useState(() => {
    try {
      return localStorage.getItem('ef-roll') || '';
    } catch {
      return '';
    }
  });
  const [result, setResult] = useState<SeatResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const search = async (e?: FormEvent, value = roll) => {
    e?.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await http.get<SeatResult>(`/public/seat?roll=${encodeURIComponent(value.trim())}`);
      setResult(r);
      try {
        localStorage.setItem('ef-roll', value.trim().toUpperCase());
      } catch {
        /* ignore */
      }
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    document.title = 'Find your exam seat — ExamFlow';
    const fromLink = new URLSearchParams(window.location.search).get('roll');
    if (fromLink) {
      setRoll(fromLink.toUpperCase());
      search(undefined, fromLink);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative min-h-screen">
      <div className="bg-seats pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <header className="no-print relative">
        <div className="mx-auto flex h-20 max-w-5xl items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <Logo />
            {info && <span className="eyebrow hidden border-l border-ink/15 pl-4 sm:block">{info.institution_name}</span>}
          </div>
          <Link to="/login" className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:border-ink">
            <LogIn className="size-4" /> Staff sign in
          </Link>
        </div>
      </header>

      <div className="no-print relative mx-auto max-w-3xl px-5 pb-12 pt-10 text-center sm:pt-16">
        <div className="eyebrow">Student seat finder</div>
        <h1 className="mt-4 font-display text-[48px] font-semibold leading-[0.98] tracking-[-0.04em] text-ink sm:text-[72px]">
          Where do <span className="italic"><Highlight>I sit?</Highlight></span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-[16px] text-slate-600">Type your roll number to get your admit card — room, seat and timing for every upcoming exam.</p>
        <form onSubmit={search} className="mx-auto mt-9 flex max-w-xl gap-2 rounded-2xl border border-ink bg-white p-2 shadow-ink">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <input
              value={roll}
              onChange={(e) => setRoll(e.target.value.toUpperCase())}
              placeholder="e.g. 24BCA017"
              className="h-12 w-full rounded-xl bg-transparent pl-11 pr-3 font-mono text-[17px] font-bold tracking-[0.06em] text-ink outline-none placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400"
              autoFocus
              aria-label="Roll number"
            />
          </div>
          <Button type="submit" variant="mark" size="lg" loading={busy} iconRight={!busy && <ArrowRight className="size-4" />}>
            Find seat
          </Button>
        </form>
      </div>

      <main className="relative mx-auto max-w-5xl px-5 pb-20">
        {error && (
          <Callout tone="error" className="mx-auto max-w-xl">
            {error}
          </Callout>
        )}
        {result && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="eyebrow">Candidate</div>
                <div className="mt-1 font-display text-[30px] font-semibold tracking-[-0.02em]">{result.student.name}</div>
                <div className="font-mono text-[13px] text-slate-500">
                  {result.student.roll_no} · {result.student.course_name}
                  {result.student.semester && ` · Sem ${result.student.semester}`}
                </div>
              </div>
              {result.exams.length > 0 && (
                <Button icon={<Printer className="size-4" />} onClick={() => window.print()} className="no-print self-start sm:self-auto">
                  Print admit card{result.exams.length > 1 ? 's' : ''}
                </Button>
              )}
            </div>
            {!result.exams.length ? (
              <div className="card px-6 py-14 text-center">
                <div className="font-display text-[24px] font-semibold">No published seating yet</div>
                <p className="mx-auto mt-2 max-w-sm text-[14px] text-muted">Your admit card appears here once the examination cell publishes seating. Check back closer to your exam.</p>
              </div>
            ) : (
              result.exams.map((e, i) => (
                <div key={e.slot.id} className="animate-slide-up" style={{ animationDelay: `${i * 90}ms` }}>
                  <AdmitCard e={e} student={result.student} />
                </div>
              ))
            )}
            <p className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-slate-400">Be seated 15 minutes early · seating may change — check again on the day</p>
          </div>
        )}
        {!result && !error && (
          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
            {[
              ['01', 'Enter roll number', 'Exactly as printed on your ID card'],
              ['02', 'Get your admit card', 'Room, seat number and a map of the room'],
              ['03', 'Arrive early', 'Be in your seat 15 minutes before start'],
            ].map(([n, t, d]) => (
              <div key={n} className="card p-5">
                <div className="font-mono text-[11px] font-bold text-slate-400">{n}</div>
                <div className="mt-2 font-display text-[19px] font-semibold">{t}</div>
                <div className="mt-1 text-[13px] text-muted">{d}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
