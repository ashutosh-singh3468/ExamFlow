import { AlertTriangle, ArrowLeft, ArrowRight, Building2, CalendarPlus, Check, CheckCircle2, Clock, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { http, useAction, useApi } from '@/lib/api';
import type { Adjacency, Paper, PlanOptions, Room, Settings, Slot } from '@/lib/types';
import { Badge, Button, Callout, Card, EmptyState, Field, Input, PageHeader, PageLoader, Progress, Stepper, Switch, cn } from '@/components/ui';
import { useToast } from '@/components/overlays';
import { LayoutThumb } from '@/components/SeatMap';
import { PlanStatusBadge } from '@/components/status';
import { paperColor } from '@/lib/colors';
import { ADJACENCY_MODES } from '@/lib/layout';
import { fmtDate, fmtTime, plural, todayISO } from '@/lib/format';

interface ForSlot {
  total: number;
  papers: (Paper & { students: number })[];
  rooms: Room[];
  suggested: number[];
  current: number[];
  plan: { id: number; status: string; options: Partial<PlanOptions> } | null;
}

function AdjacencyDiagram({ mode }: { mode: Adjacency }) {
  const cells = Array.from({ length: 9 }, (_, i) => i);
  const must = (i: number) => {
    if (i === 4) return 'self';
    if (i === 3 || i === 5) return 'differ';
    if ((i === 1 || i === 7) && mode !== 'side') return 'differ';
    if ([0, 2, 6, 8].includes(i) && mode === 'all') return 'differ';
    return 'free';
  };
  return (
    <div className="grid w-fit grid-cols-3 gap-1">
      {cells.map((i) => {
        const m = must(i);
        return (
          <div
            key={i}
            className={cn(
              'size-4 rounded-[3px]',
              m === 'self' && 'bg-ink',
              m === 'differ' && 'bg-rose-400/80',
              m === 'free' && 'bg-line',
            )}
          />
        );
      })}
    </div>
  );
}

export default function PlanWizard() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const slots = useApi<Slot[]>('/slots');
  const settings = useApi<Settings>('/settings');
  const [slotId, setSlotId] = useState<number | null>(params.get('slot') ? Number(params.get('slot')) : null);
  const [step, setStep] = useState(params.get('slot') ? 1 : 0);
  const [selected, setSelected] = useState<number[]>([]);
  const [opts, setOpts] = useState<PlanOptions | null>(null);
  const data = useApi<ForSlot>(slotId ? `/rooms/for-slot/${slotId}${opts ? `?adjacency=${opts.adjacency}` : ''}` : null, { placeholderData: (p) => p });
  const generate = useAction(() =>
    http.post<{ planId: number; warnings: string[]; seated: number; unseated: number }>('/plans/generate', { slot_id: slotId, room_ids: selected, options: opts }),
  );

  // initialise rule defaults from settings / existing plan
  useEffect(() => {
    if (!settings.data || !data.data || opts) return;
    const o = data.data.plan?.options || {};
    setOpts({
      adjacency: (o.adjacency as Adjacency) ?? settings.data.adjacency_mode,
      room_usage: o.room_usage ?? settings.data.room_usage,
      students_per_invigilator: o.students_per_invigilator ?? settings.data.students_per_invigilator,
      min_invigilators_per_room: o.min_invigilators_per_room ?? settings.data.min_invigilators_per_room,
      reserve_invigilators: o.reserve_invigilators ?? settings.data.reserve_invigilators,
      avoid_same_department: o.avoid_same_department ?? settings.data.avoid_same_department,
    });
  }, [settings.data, data.data, opts]);

  // initial room selection: existing plan rooms, otherwise the suggestion
  const [initialised, setInitialised] = useState<number | null>(null);
  useEffect(() => {
    if (data.data && initialised !== slotId) {
      const avail = new Set(data.data.rooms.filter((r) => r.is_active && !r.busy).map((r) => r.id));
      const cur = data.data.current.filter((id) => avail.has(id));
      setSelected(cur.length ? cur : data.data.suggested);
      setInitialised(slotId);
    }
  }, [data.data, slotId, initialised]);

  const today = todayISO();
  const choices = useMemo(() => (slots.data || []).filter((s) => s.date >= today && (!s.plan || s.plan.status === 'draft')), [slots.data, today]);
  const slot = slots.data?.find((s) => s.id === slotId);
  const rooms = data.data?.rooms || [];
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const spaced = selected.reduce((n, id) => n + (roomById.get(id)?.effective || 0), 0);
  const seats = selected.reduce((n, id) => n + (roomById.get(id)?.capacity || 0), 0);
  const need = data.data?.total || 0;
  const buildings = [...new Set(rooms.map((r) => r.building || 'Other'))];
  const locked = slot?.plan && slot.plan.status !== 'draft';

  if (slots.isLoading || settings.isLoading) return <PageLoader />;

  const run = () =>
    generate.mutate(undefined, {
      onSuccess: (r) => {
        if (r.warnings.length) toast.warning('Plan generated with warnings', r.warnings.join(' '));
        else toast.success('Seating plan ready', `${plural(r.seated, 'student')} seated with no clashes. Review it, then approve.`);
        navigate(`/plans/${r.planId}`);
      },
      onError: (e) => toast.error('Could not generate the plan', e.message),
    });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumb={
          <Link to="/plans" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft className="size-3.5" /> Seating plans
          </Link>
        }
        title="Generate seating plan"
        description="Three quick steps. Nothing is final until you approve the plan."
      />
      <Card className="mb-6 px-5 py-4">
        <Stepper
          current={step}
          steps={[
            { label: 'Exam slot', description: slot ? `${fmtDate(slot.date, 'short')} · ${fmtTime(slot.start_time)}` : 'Choose a sitting' },
            { label: 'Classrooms', description: step > 1 ? plural(selected.length, 'room') : 'Where students sit' },
            { label: 'Rules', description: 'Spacing & invigilation' },
          ]}
        />
      </Card>

      {step === 0 && (
        <Card>
          {!choices.length ? (
            <EmptyState
              icon={<CalendarPlus className="size-6" />}
              title="No exam slots waiting for seating"
              description="Add an exam slot with its papers first."
              action={
                <Link to="/schedule?new=1">
                  <Button variant="primary">Add exam slot</Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-line">
              {choices.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSlotId(s.id)}
                  disabled={!s.papers.length}
                  className={cn('flex w-full items-center gap-4 px-5 py-4 text-left transition disabled:opacity-50', slotId === s.id ? 'bg-mark-soft' : 'hover:bg-subtle/60')}
                >
                  <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2', slotId === s.id ? 'border-ink bg-ink text-mark' : 'border-line')}>
                    {slotId === s.id && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <div className="w-36 shrink-0">
                    <div className="text-[14px] font-medium">{fmtDate(s.date, 'day-month')}</div>
                    <div className="text-xs text-muted">
                      {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px]">{s.exam_name}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {s.papers.map((p) => (
                        <span key={p.id} className="inline-flex items-center gap-1 text-xs text-muted">
                          <span className={cn('size-2 rounded-full', paperColor(p.color).dot)} />
                          {p.short} ({p.student_count})
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className="text-[14px] font-semibold tabular">{s.student_count}</div>
                    <div className="text-xs text-muted">students</div>
                  </div>
                  <PlanStatusBadge status={s.plan?.status} />
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end border-t border-line px-5 py-3.5">
            <Button variant="primary" disabled={!slotId} iconRight={<ArrowRight className="size-4" />} onClick={() => setStep(1)}>
              Choose classrooms
            </Button>
          </div>
        </Card>
      )}

      {step === 1 && slot && (
        <div className="space-y-4">
          {locked && (
            <Callout tone="warning" title="This plan is approved">
              Reopen it from the plan page before regenerating.
            </Callout>
          )}
          <Card className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-muted">
                  {slot.exam_name} · {fmtDate(slot.date)} · {fmtTime(slot.start_time)}
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {data.data?.papers.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs">
                      <span className={cn('size-2 rounded-full', paperColor(p.color).dot)} />
                      <span className="font-medium">{p.short}</span>
                      <span className="text-muted">{p.students}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="w-full lg:w-80">
                <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                  <span>
                    <span className="text-lg font-semibold tabular">{spaced}</span> <span className="text-muted">spaced seats selected</span>
                  </span>
                  <span className="text-muted">need {need}</span>
                </div>
                <Progress value={spaced} max={Math.max(need, 1)} tone={spaced >= need ? 'green' : seats >= need ? 'amber' : 'red'} className="h-2" />
                <div className={cn('mt-1.5 text-xs', spaced >= need ? 'text-emerald-600' : 'text-amber-600')}>
                  {spaced >= need
                    ? 'Enough room to keep every paper apart.'
                    : seats >= need
                      ? 'Everyone fits, but some same-paper students would sit together. Add a room.'
                      : `${need - seats} students would have no seat. Add rooms.`}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              <Button size="sm" variant="subtle" icon={<Wand2 className="size-4" />} onClick={() => setSelected(data.data?.suggested || [])}>
                Auto-select fewest rooms
              </Button>
              <Button size="sm" onClick={() => setSelected(rooms.filter((r) => r.is_active && !r.busy).map((r) => r.id))}>
                Select all available
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Clear
              </Button>
              {data.isFetching && <Loader2 className="size-4 animate-spin self-center text-muted" />}
            </div>
          </Card>

          {!rooms.length && (
            <Card>
              <EmptyState icon={<Building2 className="size-6" />} title="No classrooms yet" action={<Link to="/classrooms?new=1"><Button variant="primary">Add classroom</Button></Link>} />
            </Card>
          )}
          {buildings.map((b) => (
            <div key={b}>
              <div className="mb-2 text-[13px] font-semibold text-muted">{b}</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rooms
                  .filter((r) => (r.building || 'Other') === b)
                  .map((r) => {
                    const disabled = !r.is_active || !!r.busy;
                    const on = selected.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelected((s) => (on ? s.filter((x) => x !== r.id) : [...s, r.id]))}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition',
                          on ? 'border-ink shadow-ink-sm' : 'border-line hover:border-muted/50',
                          disabled && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md border-2', on ? 'border-ink bg-ink text-mark' : 'border-line')}>
                          {on && <Check className="size-3" strokeWidth={3} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{r.name}</div>
                          <div className="truncate text-xs text-muted">
                            {r.busy ? `Busy: ${r.busy}` : !r.is_active ? 'Inactive' : `${r.capacity} seats · ${r.effective} spaced`}
                          </div>
                        </div>
                        <div className="flex h-12 w-20 shrink-0 overflow-hidden">
                          <LayoutThumb layout={r.layout} blocked={r.blocked} className="origin-center scale-[0.55]" />
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}

          <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-xl border border-line bg-card/95 px-4 py-3 shadow-pop backdrop-blur">
            <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(0)}>
              Back
            </Button>
            <div className="hidden text-[13px] text-muted sm:block">
              {plural(selected.length, 'room')} · {seats} seats
            </div>
            <Button variant="primary" disabled={!selected.length || !!locked} iconRight={<ArrowRight className="size-4" />} onClick={() => setStep(2)}>
              Set rules
            </Button>
          </div>
        </div>
      )}

      {step === 2 && opts && (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-1 text-[15px] font-semibold">Which neighbours must write a different paper?</div>
            <p className="mb-4 text-[13px] text-muted">Stricter rules need more empty seats when one paper has many students.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {ADJACENCY_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setOpts({ ...opts, adjacency: m.value })}
                  className={cn('flex items-start gap-3 rounded-xl border p-4 text-left transition', opts.adjacency === m.value ? 'border-ink bg-mark-soft shadow-ink-sm' : 'border-line hover:bg-subtle/60')}
                >
                  <AdjacencyDiagram mode={m.value} />
                  <div>
                    <div className="flex items-center gap-1.5 text-[14px] font-semibold">
                      {m.label}
                      {m.value === 'cross' && <Badge tone="indigo">Recommended</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{m.hint}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="mb-3 text-[15px] font-semibold">Room usage</div>
              <div className="space-y-2">
                {[
                  { v: 'minimum' as const, t: 'Use the fewest rooms', d: 'Fills the largest rooms first and leaves unneeded rooms free. Needs fewer invigilators.' },
                  { v: 'all' as const, t: 'Spread across all selected rooms', d: 'More space between students; every selected room is used.' },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setOpts({ ...opts, room_usage: o.v })}
                    className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition', opts.room_usage === o.v ? 'border-ink bg-mark-soft shadow-ink-sm' : 'border-line hover:bg-subtle/60')}
                  >
                    <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2', opts.room_usage === o.v ? 'border-ink' : 'border-line')}>
                      {opts.room_usage === o.v && <span className="size-2 rounded-full bg-ink" />}
                    </span>
                    <span>
                      <span className="block text-[14px] font-medium">{o.t}</span>
                      <span className="block text-xs text-muted">{o.d}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <div className="mb-3 text-[15px] font-semibold">Invigilation</div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Students per invigilator">
                  <Input type="number" min={1} value={opts.students_per_invigilator} onChange={(e) => setOpts({ ...opts, students_per_invigilator: Number(e.target.value) })} />
                </Field>
                <Field label="Minimum per room">
                  <Input type="number" min={1} value={opts.min_invigilators_per_room} onChange={(e) => setOpts({ ...opts, min_invigilators_per_room: Number(e.target.value) })} />
                </Field>
                <Field label="Reserve (standby)">
                  <Input type="number" min={0} value={opts.reserve_invigilators} onChange={(e) => setOpts({ ...opts, reserve_invigilators: Number(e.target.value) })} />
                </Field>
              </div>
              <div className="mt-4 rounded-xl border border-line p-3">
                <Switch
                  checked={opts.avoid_same_department}
                  onChange={(v) => setOpts({ ...opts, avoid_same_department: v })}
                  label="Avoid own-department rooms"
                  description="Prefer teachers who don’t teach the students in that room."
                />
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
                <Clock className="mt-0.5 size-3.5 shrink-0" /> Duties are shared evenly, skip unavailable teachers and avoid back-to-back duties (max {settings.data?.max_duties_per_day} per day).
              </p>
            </Card>
          </div>

          {spaced < need && (
            <Callout tone="warning" icon={<AlertTriangle className="size-4" />} title="The selected rooms are tight">
              Some students may end up next to the same paper. You can still generate and fix it in the editor, or go back and add a room.
            </Callout>
          )}

          <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-xl border border-line bg-card/95 px-4 py-3 shadow-pop backdrop-blur">
            <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(1)}>
              Back
            </Button>
            <div className="hidden items-center gap-1.5 text-[13px] text-muted sm:flex">
              <CheckCircle2 className="size-4 text-emerald-500" /> {plural(need, 'student')} · {plural(selected.length, 'room')}
            </div>
            <Button variant="primary" size="lg" loading={generate.isPending} icon={<Sparkles className="size-4" />} onClick={run}>
              {slot?.plan ? 'Regenerate plan' : 'Generate plan'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
