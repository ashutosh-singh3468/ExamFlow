import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CalendarPlus,
  Check,
  GraduationCap,
  Info,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Activity, Paper, PlanSummary, SlotBase } from '@/lib/types';
import { Button, Card, CardHeader, EmptyState, ErrorState, Highlight, PageLoader, StatCard, cn } from '@/components/ui';
import { PlanStatusBadge } from '@/components/status';
import { paperColor } from '@/lib/colors';
import { daysUntil, fmtDate, fmtTime, parseDate, plural, relativeDay, timeAgo, todayISO } from '@/lib/format';

type UpcomingSlot = SlotBase & { papers: Paper[]; student_count: number; plan: PlanSummary | null };

interface DashboardData {
  counts: Record<string, number>;
  status: { none: number; draft: number; approved: number; notified: number };
  upcoming: UpcomingSlot[];
  alerts: { severity: 'error' | 'warning' | 'info'; title: string; message: string; link: string; action: string }[];
  workload: { teachers: { id: number; name: string; department: string | null; duties: number }[]; avg: number; max: number; min: number };
  activity: Activity[];
  setup: Record<string, boolean>;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

function weekNumber(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

/* ------------------------------------------------------------ countdown */

function useCountdown(date: string | undefined, time: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!date || !time) return null;
  const [h, m] = time.split(':').map(Number);
  const target = parseDate(date);
  target.setHours(h, m, 0, 0);
  const diff = Math.max(0, target.getTime() - now);
  return { d: Math.floor(diff / 86400000), h: Math.floor((diff / 3600000) % 24), m: Math.floor((diff / 60000) % 60) };
}

function NextSitting({ slot }: { slot: UpcomingSlot | undefined }) {
  const navigate = useNavigate();
  const c = useCountdown(slot?.date, slot?.start_time);
  if (!slot || !c)
    return (
      <div className="card flex h-full flex-col items-center justify-center p-8 text-center">
        <CalendarDays className="mb-3 size-8 text-slate-300" />
        <div className="font-display text-xl font-semibold">Nothing on the calendar</div>
        <p className="mt-1 text-sm text-muted">Add an exam slot to start the countdown.</p>
      </div>
    );
  const parts: [number, string][] = [
    [c.d, 'days'],
    [c.h, 'hours'],
    [c.m, 'mins'],
  ];
  return (
    <div className="relative w-full max-w-xl self-center overflow-hidden rounded-3xl border border-ink bg-white shadow-ink-lg">
      <div className="flex items-center justify-between border-b border-ink bg-mark px-5 py-2.5">
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink">Next sitting · {relativeDay(slot.date)}</span>
        <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink">
          <span className="size-1.5 animate-blink rounded-full bg-ink" /> Live
        </span>
      </div>
      <div className="px-6 pb-6 pt-5">
        <div className="flex items-end">
          {parts.map(([n, label], i) => (
            <div key={label} className="flex items-end">
              <div>
                <div className="font-display text-[58px] font-semibold leading-[0.9] tracking-[-0.04em] text-ink tabular">{String(n).padStart(2, '0')}</div>
                <div className="mt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
              </div>
              {i < 2 && <div className="mx-2.5 mb-8 font-display text-[36px] font-light text-ink/20">:</div>}
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-4 border-t border-dashed border-ink/20 pt-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-ink">{slot.exam_name}</div>
            <div className="mt-0.5 font-mono text-[12px] text-slate-500">
              {fmtDate(slot.date, 'day-month')} · {fmtTime(slot.start_time)}–{fmtTime(slot.end_time)}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {slot.papers.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-slate-600">
                  <span className={cn('size-2 rounded-[2px]', paperColor(p.color).dot)} />
                  {p.short}
                </span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-[30px] font-semibold leading-none tabular">{slot.student_count}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">students</div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <PlanStatusBadge status={slot.plan?.status} />
          <Button size="sm" variant="primary" iconRight={<ArrowRight className="size-3.5" />} onClick={() => navigate(slot.plan ? `/plans/${slot.plan.id}` : `/plans/new?slot=${slot.id}`)}>
            {slot.plan ? (slot.plan.status === 'approved' ? 'Notify teachers' : 'Open plan') : 'Generate seating'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ week board */

function ExamTicket({ slot }: { slot: UpcomingSlot }) {
  const navigate = useNavigate();
  const to = slot.plan ? `/plans/${slot.plan.id}` : `/plans/new?slot=${slot.id}`;
  const errors = slot.plan?.stats.errors || 0;
  const t = fmtTime(slot.start_time);
  return (
    <button onClick={() => navigate(to)} className="lift group relative flex w-full rounded-2xl border border-ink/15 bg-white text-left">
      <div className="flex w-[78px] shrink-0 flex-col items-center justify-center rounded-l-2xl bg-paper/70 px-2 py-4">
        <div className="font-mono text-[16px] font-bold text-ink tabular">{t.replace(/ (AM|PM)/, '')}</div>
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{t.slice(-2)}</div>
        {slot.session && <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400">{slot.session}</div>}
      </div>
      <div className="perforation relative w-px shrink-0">
        <span className="ticket-notch -left-[10px] -top-[10px]" />
        <span className="ticket-notch -bottom-[10px] -left-[10px]" />
      </div>
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{slot.exam_name}</div>
          <ArrowUpRight className="size-4 shrink-0 text-slate-300 transition group-hover:text-ink" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {slot.papers.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-md bg-ink/[0.04] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-slate-600">
              <span className={cn('size-1.5 rounded-full', paperColor(p.color).dot)} />
              {p.short}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <PlanStatusBadge status={slot.plan?.status} />
          <div className="flex items-center gap-2">
            {errors > 0 && <span className="rounded-md bg-coral px-1.5 font-mono text-[10px] font-bold text-white">{errors}!</span>}
            <span className="whitespace-nowrap font-mono text-[11px] text-slate-500 tabular">{slot.student_count} students</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function WeekBoard({ slots }: { slots: UpcomingSlot[] }) {
  const navigate = useNavigate();
  const days = useMemo(() => {
    const m = new Map<string, UpcomingSlot[]>();
    for (const s of slots) m.set(s.date, [...(m.get(s.date) || []), s]);
    return [...m.entries()].slice(0, 4);
  }, [slots]);
  if (!days.length)
    return (
      <Card>
        <EmptyState
          icon={<CalendarPlus className="size-6" />}
          title="No exams scheduled yet"
          description="Add your first exam slot — date, time and the papers being written — and it appears here as a ticket."
          action={
            <Button variant="primary" onClick={() => navigate('/schedule?new=1')}>
              Add exam slot
            </Button>
          }
        />
      </Card>
    );
  return (
    <div className={cn('grid gap-6 md:grid-cols-2', ['xl:grid-cols-1', 'xl:grid-cols-2', 'xl:grid-cols-3', 'xl:grid-cols-4'][days.length - 1])}>
      {days.map(([date, list], i) => {
        const d = parseDate(date);
        const n = daysUntil(date);
        return (
          <div key={date} className="animate-slide-up" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="mb-4 flex items-end gap-3 border-b-2 border-ink pb-3">
              <div className="font-display text-[48px] font-semibold leading-[0.82] tracking-[-0.04em] text-ink">{d.getDate()}</div>
              <div className="pb-0.5">
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink">{d.toLocaleDateString('en-GB', { weekday: 'long' })}</div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-slate-400">
                  {d.toLocaleDateString('en-GB', { month: 'short' })} · {n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {list.map((s) => (
                <ExamTicket key={s.id} slot={s} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ setup strip */

function SetupStrip({ setup }: { setup: Record<string, boolean> }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('ef-setup-hidden') === '1';
    } catch {
      return false;
    }
  });
  const steps = [
    { key: 'institution', label: 'Institution details', to: '/settings' },
    { key: 'rooms', label: 'Classrooms', to: '/classrooms' },
    { key: 'students', label: 'Student list', to: '/students?import=1' },
    { key: 'teachers', label: 'Teaching staff', to: '/teachers?import=1' },
    { key: 'slots', label: 'Exam timetable', to: '/schedule?new=1' },
    { key: 'plans', label: 'First seating plan', to: '/plans/new' },
    { key: 'email', label: 'Email delivery', to: '/settings?tab=email' },
  ];
  const done = steps.filter((s) => setup[s.key]).length;
  if (hidden || done === steps.length) return null;
  return (
    <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4 sm:border-r sm:border-dashed sm:border-ink/20 sm:pr-5">
        <div className="font-display text-[34px] font-semibold leading-none tracking-[-0.03em]">
          {done}
          <span className="text-ink/25">/{steps.length}</span>
        </div>
        <div>
          <div className="text-[14px] font-semibold">Getting set up</div>
          <div className="text-xs text-muted">Finish these to go live</div>
        </div>
      </div>
      <div className="flex flex-1 flex-wrap gap-2">
        {steps.map((s) => (
          <Link
            key={s.key}
            to={s.to}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition',
              setup[s.key] ? 'border-transparent bg-ink/[0.04] text-slate-400 line-through' : 'border-ink bg-white text-ink shadow-ink-sm hover:-translate-y-px hover:bg-mark',
            )}
          >
            {setup[s.key] ? <Check className="size-3.5" /> : <ArrowRight className="size-3.5" />}
            {s.label}
          </Link>
        ))}
      </div>
      <button
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem('ef-setup-hidden', '1');
          } catch {
            /* ignore */
          }
        }}
        className="self-start rounded-lg p-1.5 text-slate-400 hover:bg-ink/5 hover:text-ink sm:self-center"
        aria-label="Hide setup checklist"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------- workload */

function Fairness({ data }: { data: DashboardData['workload'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const buckets = useMemo(() => Array.from({ length: data.max + 1 }, (_, n) => ({ n, teachers: data.teachers.filter((t) => t.duties === n) })), [data]);
  const peak = Math.max(1, ...buckets.map((b) => b.teachers.length));
  const spread = data.max - data.min;
  if (!data.teachers.length) return <EmptyState title="No teachers yet" description="Import staff to see how duties are shared." />;
  return (
    <div className="p-5">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[40px] font-semibold leading-none tracking-[-0.03em]">{data.avg.toFixed(1)}</span>
        <span className="text-[13px] text-muted">duties per teacher, on average</span>
      </div>
      <div className="relative mt-6 flex h-40 items-end gap-3" role="img" aria-label="Teachers by number of duties">
        {buckets.map((b) => (
          <div key={b.n} className="relative flex h-full flex-1 flex-col items-center justify-end" onMouseEnter={() => setHover(b.n)} onMouseLeave={() => setHover(null)}>
            <span className="mb-1.5 font-mono text-[11px] font-semibold text-ink tabular">{b.teachers.length || ''}</span>
            <div
              className={cn('w-full max-w-16 rounded-t-md border border-b-0 border-ink transition-colors', hover === b.n ? 'bg-mark' : 'bg-ink')}
              style={{ height: `${(b.teachers.length / peak) * 78}%`, minHeight: b.teachers.length ? 4 : 0 }}
            />
            {hover === b.n && b.teachers.length > 0 && (
              <div className="pointer-events-none absolute bottom-full z-10 mb-2 w-52 rounded-xl border border-ink bg-white p-3 text-xs shadow-ink-sm">
                <div className="mb-1 font-semibold">
                  {plural(b.teachers.length, 'teacher')} · {plural(b.n, 'duty', 'duties')}
                </div>
                <div className="text-muted">
                  {b.teachers.slice(0, 4).map((t) => t.name).join(', ')}
                  {b.teachers.length > 4 && ` +${b.teachers.length - 4} more`}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-3 border-t border-ink pt-2">
        {buckets.map((b) => (
          <div key={b.n} className="flex-1 text-center font-mono text-[11px] font-semibold text-slate-500">
            {b.n}
          </div>
        ))}
      </div>
      <div className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">duties per teacher</div>
      <div className={cn('mt-5 flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium', spread <= 1 ? 'bg-mark-soft text-ink' : 'bg-amber-50 text-amber-900')}>
        {spread <= 1 ? <Check className="size-4" /> : <AlertTriangle className="size-4" />}
        {spread <= 1 ? 'Fair — nobody carries more than one extra duty.' : `Uneven — the gap between lightest and heaviest load is ${spread}.`}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- page */

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useApi<DashboardData>('/dashboard');
  if (isLoading) return <PageLoader label="Preparing your desk…" />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const c = data.counts;
  const now = new Date();
  const ready = data.status.approved + data.status.notified;
  const firstName = (user?.name || '').replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, '').split(' ')[0];
  const hhmm = now.toTimeString().slice(0, 5);
  const next = data.upcoming.find((s) => s.date > todayISO() || (s.date === todayISO() && s.end_time > hhmm));

  return (
    <div className="space-y-12">
      <section className="grid items-center gap-10 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="relative">
          <div className="bg-seats pointer-events-none absolute -left-10 -top-12 h-60 w-96 opacity-80 [mask-image:radial-gradient(closest-side,black,transparent)]" />
          <div className="eyebrow relative">
            {now.toLocaleDateString('en-GB', { weekday: 'short' })} · {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · Week {weekNumber(now)}
          </div>
          <h1 className="relative mt-4 font-display text-[44px] font-semibold leading-[1] tracking-[-0.035em] text-ink sm:text-[56px] 2xl:text-[64px]">
            {greeting()},
            <br />
            <Highlight>{firstName}</Highlight>.
          </h1>
          <p className="relative mt-5 max-w-xl font-display text-[20px] italic leading-snug text-slate-600 sm:text-[23px]">
            {c.upcoming_slots ? (
              <>
                {plural(c.upcoming_slots, 'sitting')} over the next {plural(c.exam_days, 'day')} —{' '}
                <span className="font-semibold not-italic text-ink">{ready} ready</span>
                {data.status.draft > 0 && <>, {data.status.draft} in review</>}
                {data.status.none > 0 && <>, {data.status.none} still to plan</>}.
              </>
            ) : (
              'A quiet week. Add an exam slot to get started.'
            )}
          </p>
          <div className="relative mt-8 flex flex-wrap gap-3">
            <Button variant="mark" size="lg" icon={<Sparkles className="size-4" />} onClick={() => navigate('/plans/new')}>
              Generate seating
            </Button>
            <Button size="lg" icon={<CalendarPlus className="size-4" />} onClick={() => navigate('/schedule?new=1')}>
              Add exam slot
            </Button>
          </div>
        </div>
        <NextSitting slot={next} />
      </section>

      <SetupStrip setup={data.setup} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Classrooms" value={c.active_rooms} sub={`${c.seats.toLocaleString()} exam seats ready`} icon={<Building2 className="size-5" />} tone="indigo" onClick={() => navigate('/classrooms')} />
        <StatCard label="Students" value={c.students} sub={`across ${plural(c.courses, 'course')}`} icon={<GraduationCap className="size-5" />} tone="mark" onClick={() => navigate('/students')} />
        <StatCard label="Teachers" value={c.teachers} sub={`${plural(c.duties, 'duty', 'duties')} assigned so far`} icon={<Users className="size-5" />} tone="green" onClick={() => navigate('/teachers')} />
        <StatCard label="Upcoming sittings" value={c.upcoming_slots} sub={`${plural(c.exam_days, 'exam day')} ahead`} icon={<CalendarDays className="size-5" />} tone="amber" onClick={() => navigate('/schedule')} />
      </section>

      <section>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Exam tickets</div>
            <h2 className="mt-1 text-[32px] font-semibold tracking-[-0.025em]">
              The week <span className="italic">ahead</span>
            </h2>
          </div>
          <Link to="/schedule" className="flex items-center gap-1 text-[13px] font-semibold text-ink underline decoration-mark decoration-[3px] underline-offset-4 hover:decoration-ink">
            Full schedule <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <WeekBoard slots={data.upcoming} />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Needs attention" description={data.alerts.length ? plural(data.alerts.length, 'item') : 'All caught up'} />
          {!data.alerts.length ? (
            <EmptyState icon={<Check className="size-6" />} title="Nothing to fix" description="Every plan passes its checks." />
          ) : (
            <ul className="max-h-[440px] divide-y divide-ink/[0.07] overflow-y-auto scrollbar-thin">
              {data.alerts.map((a, i) => (
                <li key={i}>
                  <Link to={a.link} className="group flex items-start gap-3 px-5 py-3.5 transition hover:bg-paper/60">
                    <span
                      className={cn(
                        'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border',
                        a.severity === 'error' ? 'border-ink bg-coral text-white' : a.severity === 'warning' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-ink/10 bg-white text-indigo-600',
                      )}
                    >
                      {a.severity === 'error' ? <AlertCircle className="size-3.5" /> : a.severity === 'warning' ? <AlertTriangle className="size-3.5" /> : <Info className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold">{a.title}</div>
                      <div className="line-clamp-2 text-xs text-muted">{a.message}</div>
                    </div>
                    <span className="shrink-0 rounded-md border border-ink/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink transition group-hover:border-ink group-hover:bg-mark">
                      {a.action}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Duty fairness"
            description="Teachers by number of invigilation duties"
            action={
              <Link to="/reports?tab=workload" className="font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 hover:text-ink">
                Details →
              </Link>
            }
          />
          <Fairness data={data.workload} />
        </Card>

        <Card>
          <CardHeader title="Recent activity" description="What changed, and who did it" />
          <ol className="relative max-h-[440px] overflow-y-auto px-5 py-4 scrollbar-thin">
            {data.activity.map((a, i) => (
              <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
                {i < data.activity.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-ink/10" />}
                <span className={cn('relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-ink', i === 0 ? 'bg-mark' : 'bg-white')} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold">{a.action}</div>
                  {a.details && <div className="line-clamp-2 text-xs text-muted">{a.details}</div>}
                  <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-slate-400">
                    {a.user_name} · {timeAgo(a.created_at)}
                  </div>
                </div>
              </li>
            ))}
            {!data.activity.length && <li className="py-6 text-center text-[13px] text-muted">No activity yet.</li>}
          </ol>
        </Card>
      </section>
    </div>
  );
}
