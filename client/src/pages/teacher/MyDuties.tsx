import { ArrowRight, CalendarCheck, CalendarOff, CalendarPlus, Clock, DoorOpen, FileDown, History, MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Teacher, TeacherDuty, Unavailability } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Highlight, PageLoader } from '@/components/ui';
import { useToast } from '@/components/overlays';
import { addMinutes, daysUntil, fmtDate, fmtDuration, fmtTime, plural, relativeDay, todayISO } from '@/lib/format';
import { downloadIcs } from '@/lib/ics';
import { dutyLetterPdf } from '@/lib/pdf';

export interface Overview {
  teacher: Teacher;
  duties: TeacherDuty[];
  stats: { total: number; upcoming: number; completed: number; average: number };
  unavailability: Unavailability[];
  slots: { id: number; exam_name: string; date: string; start_time: string; end_time: string; duration_min: number; session: string | null; plan_status: string | null }[];
  report_before_min: number;
}

function DateBlock({ date }: { date: string }) {
  return (
    <div className="w-14 shrink-0 rounded-xl border border-ink/15 bg-white py-1.5 text-center">
      <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-400">{fmtDate(date, 'short').split(' ')[1]}</div>
      <div className="font-display text-[24px] font-semibold leading-none">{Number(date.slice(8))}</div>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-slate-400">{fmtDate(date, 'weekday').slice(0, 3)}</div>
    </div>
  );
}

export default function MyDuties() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useApi<Overview>('/me/overview');
  const info = useApi<{ institution_name: string; institution_address: string; exam_cell_name: string; controller_name: string }>('/public/info');
  const [showPast, setShowPast] = useState(false);
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  const today = todayISO();
  const upcoming = data.duties.filter((d) => d.date >= today);
  const past = data.duties.filter((d) => d.date < today).reverse();
  const next = upcoming[0];
  const rb = data.report_before_min;
  const firstName = (user?.name || '').replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, '').split(' ')[0];

  const calendar = (list: TeacherDuty[]) =>
    downloadIcs(
      list.map((d) => ({
        uid: `duty-${d.plan_id}-${data.teacher.id}@examflow`,
        date: d.date,
        start: addMinutes(d.start_time, -rb),
        end: d.end_time,
        title: `Invigilation — ${d.room_name || 'Reserve'} (${d.exam_name})`,
        location: [d.room_name, d.building].filter(Boolean).join(', '),
        description: `Exam ${fmtTime(d.start_time)}–${fmtTime(d.end_time)}. Report by ${fmtTime(addMinutes(d.start_time, -rb))}.`,
      })),
      list.length === 1 ? `duty-${list[0].date}.ics` : 'my-invigilation-duties.ics',
    );

  const letter = async () => {
    if (!info.data) return;
    try {
      await dutyLetterPdf(data.teacher, upcoming.length ? upcoming : data.duties, info.data, rb);
    } catch (e) {
      toast.error('Could not create the letter', e instanceof Error ? e.message : '');
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow">Teaching staff · invigilation</div>
          <h1 className="mt-3 font-display text-[44px] font-semibold leading-none tracking-[-0.035em] sm:text-[54px]">
            Hello, <Highlight>{firstName}</Highlight>.
          </h1>
          <p className="mt-3 font-display text-[19px] italic text-slate-600">
            {upcoming.length ? `You have ${plural(upcoming.length, 'upcoming duty', 'upcoming duties')}.` : 'No duties on your plate right now.'}
          </p>
        </div>
        <div className="flex gap-2">
          {data.duties.length > 0 && (
            <Button icon={<FileDown className="size-4" />} onClick={letter}>
              Duty letter (PDF)
            </Button>
          )}
          <Button icon={<CalendarOff className="size-4" />} onClick={() => navigate('/my/availability')}>
            My availability
          </Button>
        </div>
      </div>

      {next ? (
        <article className="relative mb-8 grid overflow-hidden rounded-3xl border border-ink bg-white shadow-ink-lg md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="flex flex-col items-center justify-center border-b border-ink bg-mark px-6 py-6 text-ink md:border-b-0 md:border-r">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">{fmtDate(next.date, 'weekday')}</div>
            <div className="font-display text-[84px] font-semibold leading-[0.85] tracking-[-0.05em]">{Number(next.date.slice(8))}</div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em]">{fmtDate(next.date, 'short').split(' ')[1]}</div>
            <div className="mt-4 rounded-md border border-ink bg-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-mark">{relativeDay(next.date)}</div>
          </div>
          <div className="relative p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-500">Duty pass · {next.exam_name}</span>
              <span className="rounded-md border border-ink/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em]">{next.role === 'reserve' ? 'Reserve' : 'Invigilator'}</span>
            </div>
            <div className="mt-3 font-display text-[42px] font-semibold leading-none tracking-[-0.03em] sm:text-[52px]">{next.role === 'reserve' ? 'Reserve pool' : next.room_name}</div>
            <div className="mt-2 flex items-center gap-1.5 text-[14px] text-slate-600">
              <MapPin className="size-4" />
              {next.role === 'reserve' ? 'Report to the examination cell' : [next.building, next.floor && `${next.floor} floor`].filter(Boolean).join(', ')}
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-dashed border-ink/20 pt-5 lg:grid-cols-4">
              <div>
                <dt className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-400">Report by</dt>
                <dd className="mt-1 font-display text-[24px] font-semibold leading-none">{fmtTime(addMinutes(next.start_time, -rb))}</dd>
              </div>
              <div>
                <dt className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-400">Exam time</dt>
                <dd className="mt-1 text-[14px] font-semibold">
                  {fmtTime(next.start_time)} – {fmtTime(next.end_time)}
                  <span className="block text-xs font-normal text-muted">{fmtDuration(next.duration_min)}</span>
                </dd>
              </div>
              {next.role !== 'reserve' && (
                <div>
                  <dt className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-400">Students</dt>
                  <dd className="mt-1 text-[14px] font-semibold">
                    {next.students}
                    <span className="block truncate font-mono text-[11px] font-normal text-muted">{next.papers?.join(' · ')}</span>
                  </dd>
                </div>
              )}
              {!!next.co_invigilators?.length && (
                <div>
                  <dt className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-400">Alongside</dt>
                  <dd className="mt-1 text-[14px] font-semibold">{next.co_invigilators.join(', ')}</dd>
                </div>
              )}
            </dl>
            <div className="mt-6 flex flex-wrap gap-2">
              {next.role !== 'reserve' && (
                <Button variant="primary" icon={<DoorOpen className="size-4" />} onClick={() => navigate(`/my/duties/${next.plan_id}`)}>
                  Room seating
                </Button>
              )}
              <Button icon={<CalendarPlus className="size-4" />} onClick={() => calendar([next])}>
                Add to calendar
              </Button>
            </div>
          </div>
        </article>
      ) : (
        <Card className="mb-6">
          <EmptyState
            icon={<CalendarCheck className="size-6" />}
            title="No upcoming duties"
            description="When the examination cell assigns you a duty you’ll receive an email, and it will appear here. Let them know in advance about days you can’t make it."
            action={
              <Button variant="primary" icon={<CalendarOff className="size-4" />} onClick={() => navigate('/my/availability')}>
                Mark unavailable dates
              </Button>
            }
          />
        </Card>
      )}

      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { label: 'Upcoming', value: data.stats.upcoming, icon: <Clock className="size-4" /> },
          { label: 'Completed', value: data.stats.completed, icon: <History className="size-4" /> },
          { label: 'College average', value: data.stats.average.toFixed(1), icon: <Users className="size-4" />, sub: `you: ${data.stats.total}` },
        ].map((s) => (
          <Card key={s.label} className="px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              {s.icon}
              {s.label}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-[34px] font-semibold leading-none tracking-[-0.02em] tabular">{s.value}</span>
              {s.sub && <span className="text-xs text-muted">{s.sub}</span>}
            </div>
          </Card>
        ))}
      </div>

      {upcoming.length > 1 && (
        <Card className="mb-6">
          <CardHeader
            title="All upcoming duties"
            action={
              <Button size="sm" variant="ghost" icon={<CalendarPlus className="size-4" />} onClick={() => calendar(upcoming)}>
                Add all to calendar
              </Button>
            }
          />
          <ul className="divide-y divide-line">
            {upcoming.map((d) => (
              <li key={d.id}>
                <Link to={d.role === 'reserve' ? '#' : `/my/duties/${d.plan_id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-subtle/60">
                  <DateBlock date={d.date} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{d.role === 'reserve' ? 'Reserve pool' : d.room_name}</div>
                    <div className="truncate text-[13px] text-muted">
                      {fmtTime(d.start_time)}–{fmtTime(d.end_time)} · {d.exam_name}
                    </div>
                  </div>
                  <Badge tone={daysUntil(d.date) <= 2 ? 'amber' : 'gray'}>{relativeDay(d.date)}</Badge>
                  <ArrowRight className="size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {past.length > 0 && (
        <Card>
          <button onClick={() => setShowPast((s) => !s)} className="flex w-full items-center justify-between px-5 py-4 text-left">
            <span className="text-[15px] font-semibold">Past duties</span>
            <span className="text-[13px] text-muted">{showPast ? 'Hide' : `Show ${past.length}`}</span>
          </button>
          {showPast && (
            <ul className="divide-y divide-line border-t border-line">
              {past.map((d) => (
                <li key={d.id} className="flex items-center gap-4 px-5 py-3 text-[14px] opacity-80">
                  <span className="w-28 shrink-0 text-muted">{fmtDate(d.date, 'short')}</span>
                  <span className="flex-1 font-medium">{d.room_name || 'Reserve'}</span>
                  <span className="hidden text-[13px] text-muted sm:block">{d.exam_name}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
