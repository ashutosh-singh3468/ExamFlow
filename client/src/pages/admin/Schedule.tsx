import { AlertTriangle, Armchair, CalendarDays, CalendarPlus, Clock, Copy, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { http, useAction, useApi } from '@/lib/api';
import type { Course, Settings, Slot } from '@/lib/types';
import { Badge, Button, Callout, Card, EmptyState, ErrorState, Field, Input, PageHeader, PageLoader, Select, Switch, cn } from '@/components/ui';
import { Menu, MenuDivider, MenuItem, Modal, useConfirm, useToast } from '@/components/overlays';
import { MiniProgress, PlanStatusBadge } from '@/components/status';
import { paperColor } from '@/lib/colors';
import { addMinutes, fmtDate, fmtDuration, fmtTime, plural, relativeDay, todayISO } from '@/lib/format';

interface PaperRow {
  id?: number;
  course_id: number | '';
  semester: string;
  subject: string;
  subject_code: string;
}

interface SlotForm {
  id?: number;
  exam_name: string;
  date: string;
  start_time: string;
  duration_min: number;
  session: string;
  papers: PaperRow[];
}

const DURATIONS = [60, 90, 120, 180];

function SlotEditor({
  open,
  onClose,
  initial,
  courses,
  settings,
  examNames,
  locked,
}: {
  open: boolean;
  onClose: () => void;
  initial: SlotForm | null;
  courses: Course[];
  settings?: Settings;
  examNames: string[];
  locked: boolean;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const sessions = settings?.sessions || [];
  const blank = (): SlotForm => ({
    exam_name: examNames[0] || '',
    date: todayISO(),
    start_time: sessions[0]?.start || '09:30',
    duration_min: settings?.default_duration_min || 90,
    session: sessions[0]?.name || '',
    papers: [{ course_id: '', semester: '', subject: '', subject_code: '' }],
  });
  const [f, setF] = useState<SlotForm>(blank);
  useEffect(() => {
    if (open) setF(initial ? { ...initial, papers: initial.papers.length ? initial.papers : blank().papers } : blank());
  }, [open, initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAction((b: SlotForm) => (b.id ? http.put(`/slots/${b.id}`, b) : http.post<{ id: number }>('/slots', b)));
  const custom = !sessions.some((s) => s.name === f.session && s.start === f.start_time);
  const countFor = (p: PaperRow) => {
    const c = courses.find((x) => x.id === p.course_id);
    if (!c) return 0;
    return p.semester ? c.semesters.find((s) => s.semester === p.semester)?.count || 0 : c.student_count;
  };
  const total = f.papers.reduce((n, p) => n + countFor(p), 0);
  const setPaper = (i: number, patch: Partial<PaperRow>) => setF((s) => ({ ...s, papers: s.papers.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const valid = f.exam_name && f.date && f.start_time && f.duration_min >= 15 && f.papers.some((p) => p.course_id);

  const submit = (generate: boolean) =>
    save.mutate(
      { ...f, papers: f.papers.filter((p) => p.course_id) },
      {
        onSuccess: (res) => {
          toast.success(f.id ? 'Exam slot updated' : 'Exam slot added', `${fmtDate(f.date)} · ${fmtTime(f.start_time)}`);
          onClose();
          const id = f.id || (res as { id: number })?.id;
          if (generate && id) navigate(`/plans/new?slot=${id}`);
        },
        onError: (e) => toast.error('Could not save exam slot', e.message),
      },
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={f.id ? 'Edit exam slot' : 'Add an exam slot'}
      description="A slot is one sitting: a date, a start time and the papers written during it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {!f.id && (
            <Button disabled={!valid || locked} loading={save.isPending} onClick={() => submit(false)}>
              Save
            </Button>
          )}
          <Button variant="primary" disabled={!valid || locked} loading={save.isPending} onClick={() => submit(!f.id)}>
            {f.id ? 'Save changes' : 'Save & generate seating'}
          </Button>
        </>
      }
    >
      {locked && (
        <Callout tone="warning" className="mb-4" title="This slot’s seating plan is approved">
          Reopen the plan from the Seating plans page before changing the slot.
        </Callout>
      )}
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Examination" required className="sm:col-span-2">
            <Input list="exam-names" value={f.exam_name} onChange={(e) => setF({ ...f, exam_name: e.target.value })} placeholder="Mid-Semester Examination" />
            <datalist id="exam-names">
              {examNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <Field label="Date" required>
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Session">
            <div className="flex flex-wrap gap-2">
              {sessions.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setF({ ...f, session: s.name, start_time: s.start })}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-[13px] font-medium transition',
                    f.session === s.name && f.start_time === s.start ? 'border-ink bg-mark text-ink shadow-ink-sm' : 'border-line hover:bg-subtle',
                  )}
                >
                  {s.name} <span className="font-normal text-muted">{fmtTime(s.start)}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setF({ ...f, session: '' })}
                className={cn('rounded-lg border px-3 py-2 text-[13px] font-medium transition', custom ? 'border-ink bg-mark text-ink shadow-ink-sm' : 'border-line hover:bg-subtle')}
              >
                Custom
              </button>
            </div>
          </Field>
          <Field label="Start time" required>
            <Input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value, session: sessions.find((s) => s.start === e.target.value)?.name || f.session })} />
          </Field>
          <Field label="Duration" hint={`Ends at ${fmtTime(addMinutes(f.start_time || '00:00', f.duration_min || 0))}`}>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setF({ ...f, duration_min: d })}
                  className={cn('flex-1 rounded-lg border px-2 py-2 text-[13px] font-medium transition', f.duration_min === d ? 'border-ink bg-mark text-ink shadow-ink-sm' : 'border-line hover:bg-subtle')}
                >
                  {fmtDuration(d)}
                </button>
              ))}
              <Input type="number" min={15} max={600} step={15} value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: Number(e.target.value) })} className="w-20" title="Minutes" />
            </div>
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[14px] font-semibold">Papers in this slot</div>
              <div className="text-xs text-muted">Students of different papers are seated alternately.</div>
            </div>
            <Badge tone="indigo" icon={<Users className="size-3" />}>
              {plural(total, 'student')}
            </Badge>
          </div>
          {!courses.length ? (
            <Callout tone="warning">
              No courses yet. <Link to="/students?import=1" className="font-medium underline">Import students</Link> first.
            </Callout>
          ) : (
            <div className="space-y-2">
              {f.papers.map((p, i) => {
                const c = courses.find((x) => x.id === p.course_id);
                return (
                  <div key={i} className="grid items-start gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_130px_1fr_110px_auto]">
                    <Select value={p.course_id} onChange={(e) => setPaper(i, { course_id: e.target.value ? Number(e.target.value) : '', semester: '' })}>
                      <option value="">Choose course…</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </Select>
                    <Select value={p.semester} onChange={(e) => setPaper(i, { semester: e.target.value })} disabled={!c}>
                      <option value="">All semesters</option>
                      {c?.semesters.filter((s) => s.semester).map((s) => (
                        <option key={s.semester!} value={s.semester!}>
                          Sem {s.semester} ({s.count})
                        </option>
                      ))}
                    </Select>
                    <Input value={p.subject} onChange={(e) => setPaper(i, { subject: e.target.value })} placeholder="Subject (e.g. Data Structures)" />
                    <Input value={p.subject_code} onChange={(e) => setPaper(i, { subject_code: e.target.value })} placeholder="Code" />
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <span className="text-xs text-muted tabular sm:hidden">{countFor(p)} students</span>
                      <button
                        type="button"
                        onClick={() => setF((s) => ({ ...s, papers: s.papers.filter((_, j) => j !== i) }))}
                        className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-rose-600"
                        aria-label="Remove paper"
                        disabled={f.papers.length === 1}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setF((s) => ({ ...s, papers: [...s.papers, { course_id: '', semester: '', subject: '', subject_code: '' }] }))}>
                Add paper
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function Schedule() {
  const slots = useApi<Slot[]>('/slots');
  const courses = useApi<Course[]>('/courses');
  const settings = useApi<Settings>('/settings');
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<{ form: SlotForm | null; locked: boolean } | null>(null);
  const [exam, setExam] = useState('');
  const [showPast, setShowPast] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const del = useAction((id: number) => http.del(`/slots/${id}`));
  const genAll = useAction(() => http.post<{ results: { ok: boolean; label: string; message: string }[] }>('/plans/generate-all'));

  useEffect(() => {
    if (params.get('new')) {
      setEditing({ form: null, locked: false });
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const examNames = useMemo(() => [...new Set((slots.data || []).map((s) => s.exam_name))], [slots.data]);
  if (slots.isLoading) return <PageLoader />;
  if (slots.error) return <ErrorState error={slots.error} onRetry={() => slots.refetch()} />;

  const today = todayISO();
  const visible = slots.data!.filter((s) => (!exam || s.exam_name === exam) && (showPast || s.date >= today));
  const byDate = new Map<string, Slot[]>();
  for (const s of visible) byDate.set(s.date, [...(byDate.get(s.date) || []), s]);
  const pending = slots.data!.filter((s) => s.date >= today && !s.plan && s.papers.length).length;
  const pastCount = slots.data!.filter((s) => s.date < today).length;

  const toForm = (s: Slot, duplicate = false): SlotForm => ({
    id: duplicate ? undefined : s.id,
    exam_name: s.exam_name,
    date: duplicate ? '' : s.date,
    start_time: s.start_time,
    duration_min: s.duration_min,
    session: s.session || '',
    papers: s.papers.map((p) => ({ id: duplicate ? undefined : p.id, course_id: p.course_id, semester: p.semester || '', subject: p.subject || '', subject_code: p.subject_code || '' })),
  });

  return (
    <div>
      <PageHeader
        title="Exam schedule"
        description={`${plural(slots.data!.filter((s) => s.date >= today).length, 'upcoming slot')} across ${plural(new Set(slots.data!.filter((s) => s.date >= today).map((s) => s.date)).size, 'day')}`}
        actions={
          <>
            {pending > 0 && (
              <Button
                icon={<Sparkles className="size-4" />}
                loading={genAll.isPending}
                onClick={async () => {
                  if (!(await confirm({ title: `Generate ${plural(pending, 'seating plan')}?`, message: 'Rooms are picked automatically (fewest rooms that keep papers apart). You can review and edit every plan before approving.', confirmLabel: 'Generate all' }))) return;
                  genAll.mutate(undefined, {
                    onSuccess: (r) => {
                      const ok = r.results.filter((x) => x.ok).length;
                      toast.success(`${plural(ok, 'plan')} generated`, r.results.filter((x) => !x.ok).map((x) => `${x.label}: ${x.message}`).join(' · ') || 'Review them on the Seating plans page.');
                    },
                  });
                }}
              >
                Generate {pending} pending
              </Button>
            )}
            <Button variant="primary" icon={<CalendarPlus className="size-4" />} onClick={() => setEditing({ form: null, locked: false })}>
              Add exam slot
            </Button>
          </>
        }
      />

      {!slots.data!.length ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="size-6" />}
            title="Plan your exam timetable"
            description="Add an exam slot for each sitting — date, time, duration and the papers being written. Then generate seating in one click."
            action={
              <Button variant="primary" icon={<CalendarPlus className="size-4" />} onClick={() => setEditing({ form: null, locked: false })}>
                Add the first slot
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            {examNames.length > 1 && (
              <Select value={exam} onChange={(e) => setExam(e.target.value)} className="sm:w-72">
                <option value="">All examinations</option>
                {examNames.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Select>
            )}
            {pastCount > 0 && (
              <div className="sm:ml-auto">
                <Switch checked={showPast} onChange={setShowPast} label={<span className="text-[13px] font-normal text-muted">Show {plural(pastCount, 'past slot')}</span>} />
              </div>
            )}
          </div>
          {!visible.length && <Card><EmptyState title="No upcoming slots" description="Add an exam slot or show past slots." /></Card>}
          <div className="space-y-8">
            {[...byDate.entries()].map(([date, list]) => (
              <section key={date}>
                <div className="mb-3 flex items-baseline gap-3">
                  <h2 className="text-[15px] font-semibold">{fmtDate(date, 'long')}</h2>
                  <span className={cn('text-[13px]', date === today ? 'font-semibold text-ink' : 'text-muted')}>{relativeDay(date)}</span>
                </div>
                <div className="space-y-3">
                  {list.map((s) => {
                    const past = s.date < today;
                    return (
                      <Card key={s.id} className={cn('flex flex-col gap-4 p-4 lg:flex-row lg:items-center', past && 'opacity-75')}>
                        <div className="flex shrink-0 items-center gap-4 lg:w-48">
                          <div className="flex size-11 items-center justify-center rounded-xl border border-ink bg-mark text-ink">
                            <Clock className="size-5" />
                          </div>
                          <div>
                            <div className="text-[15px] font-semibold tabular">{fmtTime(s.start_time)}</div>
                            <div className="text-xs text-muted">
                              to {fmtTime(s.end_time)} · {fmtDuration(s.duration_min)}
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[14px] font-medium">{s.exam_name}</span>
                            {s.session && <span className="text-xs text-muted">· {s.session}</span>}
                            {s.clashes.length > 0 && (
                              <Badge tone="red" icon={<AlertTriangle className="size-3" />}>
                                {plural(s.clashes.reduce((n, c) => n + c.students, 0), 'student')} double-booked
                              </Badge>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {s.papers.map((p) => (
                              <span key={p.id} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-subtle/50 px-2 py-1 text-xs">
                                <span className={cn('size-2 rounded-full', paperColor(p.color).dot)} />
                                <span className="font-medium">{p.short}</span>
                                {p.subject && <span className="hidden text-muted md:inline">{p.subject}</span>}
                                <span className="text-muted tabular">· {p.student_count}</span>
                              </span>
                            ))}
                            {!s.papers.length && <span className="text-xs text-amber-600">No papers added</span>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4 lg:justify-end">
                          <div className="flex flex-col items-start gap-1.5 lg:items-end">
                            <PlanStatusBadge status={s.plan?.status} />
                            <div className="flex items-center gap-2 text-xs text-muted">
                              <MiniProgress status={s.plan?.status} />
                              {plural(s.student_count, 'student')}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {s.plan ? (
                              <Link to={`/plans/${s.plan.id}`}>
                                <Button size="sm" icon={<Armchair className="size-4" />}>
                                  {s.plan.status === 'draft' ? 'Review' : 'Open'}
                                </Button>
                              </Link>
                            ) : (
                              <Button size="sm" variant="primary" icon={<Sparkles className="size-4" />} disabled={!s.papers.length} onClick={() => navigate(`/plans/new?slot=${s.id}`)}>
                                Generate
                              </Button>
                            )}
                            <Menu
                              trigger={({ onClick }) => (
                                <button onClick={onClick} className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-fg" aria-label="Slot actions">
                                  <MoreHorizontal className="size-4" />
                                </button>
                              )}
                            >
                              <MenuItem icon={<Pencil className="size-4" />} onClick={() => setEditing({ form: toForm(s), locked: !!s.plan && s.plan.status !== 'draft' })}>
                                Edit slot
                              </MenuItem>
                              <MenuItem icon={<Copy className="size-4" />} onClick={() => setEditing({ form: toForm(s, true), locked: false })}>
                                Duplicate
                              </MenuItem>
                              <MenuDivider />
                              <MenuItem
                                icon={<Trash2 className="size-4" />}
                                danger
                                onClick={async () => {
                                  if (
                                    !(await confirm({
                                      title: 'Delete this exam slot?',
                                      message: s.plan ? 'Its seating plan and invigilation duties will be deleted too.' : 'This cannot be undone.',
                                      confirmLabel: 'Delete slot',
                                      tone: 'danger',
                                    }))
                                  )
                                    return;
                                  del.mutate(s.id, { onSuccess: () => toast.success('Exam slot deleted') });
                                }}
                              >
                                Delete
                              </MenuItem>
                            </Menu>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      <SlotEditor
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing?.form ?? null}
        locked={!!editing?.locked}
        courses={courses.data || []}
        settings={settings.data}
        examNames={examNames}
      />
    </div>
  );
}
