import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  DoorOpen,
  Download,
  FileSpreadsheet,
  FileText,
  Hand,
  LayoutGrid,
  Lock,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  Undo2,
  Unlock,
  UserMinus,
  UserPlus,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { http, useAction, useApi } from '@/lib/api';
import type { Candidate, Duty, Issue, PlanDetail, Room, SeatAssignment, Settings } from '@/lib/types';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  ErrorState,
  PageLoader,
  Progress,
  Segmented,
  Stepper,
  cn,
} from '@/components/ui';
import { Menu, MenuDivider, MenuItem, Modal, useConfirm, useToast } from '@/components/overlays';
import { RollText, SeatMap, isSplitRoll, type SeatSize } from '@/components/SeatMap';
import { PlanStatusBadge, WORKFLOW, workflowStep } from '@/components/status';
import { paperColor } from '@/lib/colors';
import { fmtDate, fmtStamp, fmtTime, paperLabel, plural } from '@/lib/format';
import { attendanceSheetsPdf, dutyListPdf, noticeBoardPdf, planExcel, rollRanges, seatingChartsPdf, type Letterhead } from '@/lib/pdf';

type SeatRef = { room_id: number; r: number; c: number };
type Selection = { kind: 'seat'; seat: SeatRef } | { kind: 'unseated'; student_id: number } | null;

const sameSeat = (a: SeatRef, b: SeatRef) => a.room_id === b.room_id && a.r === b.r && a.c === b.c;

/* ---------------------------------------------------------- teacher picker */

function TeacherPicker({
  open,
  onClose,
  planId,
  title,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  planId: number;
  title: string;
  onPick: (c: Candidate) => void;
}) {
  const { data, isLoading } = useApi<Candidate[]>(open ? `/plans/${planId}/teachers` : null);
  const [q, setQ] = useState('');
  useEffect(() => {
    setQ('');
  }, [open]);
  const list = (data || []).filter((c) => `${c.name} ${c.department}`.toLowerCase().includes(q.toLowerCase()));
  const best = (data || []).find((c) => c.tier === 0 && !c.assigned);
  return (
    <Modal open={open} onClose={onClose} title={title} description="Sorted by suitability: available teachers with the fewest duties come first." size="md">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input className="field pl-9" placeholder="Search teachers…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading ? (
        <PageLoader />
      ) : (
        <ul className="-mx-2 max-h-[55vh] space-y-0.5 overflow-y-auto scrollbar-thin">
          {list.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onPick(c)}
                disabled={c.tier === 3}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Avatar name={c.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium">{c.name}</span>
                    {best?.id === c.id && <Badge tone="green">Best match</Badge>}
                    {c.assigned && <Badge tone="indigo">{c.assigned.room_id ? 'In this plan' : 'Reserve'}</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {[c.department, c.designation].filter(Boolean).join(' · ')}
                    {c.reasons.length > 0 && <span className={c.tier === 3 ? 'text-rose-600' : 'text-amber-600'}> · {c.reasons.join(' · ')}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[14px] font-semibold tabular">{c.total}</div>
                  <div className="text-[11px] text-muted">duties</div>
                </div>
              </button>
            </li>
          ))}
          {!list.length && <li className="py-8 text-center text-sm text-muted">No teachers found.</li>}
        </ul>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------- room picker */

function RoomPicker({ open, onClose, detail, onSave, saving }: { open: boolean; onClose: () => void; detail: PlanDetail; onSave: (ids: number[]) => void; saving: boolean }) {
  const rooms = useApi<Room[]>(open ? '/rooms' : null);
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    if (open) setIds(detail.rooms.map((r) => r.id));
  }, [open, detail.rooms]);
  const occupied = new Set(detail.rooms.filter((r) => r.assigned > 0).map((r) => r.id));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rooms in this plan"
      description="Add a spare room to move students into it. Rooms that still have students can’t be removed."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => onSave(ids)}>
            Save rooms
          </Button>
        </>
      }
    >
      {!rooms.data ? (
        <PageLoader />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {rooms.data
            .filter((r) => r.is_active || ids.includes(r.id))
            .map((r) => {
              const on = ids.includes(r.id);
              const locked = occupied.has(r.id);
              return (
                <button
                  key={r.id}
                  disabled={locked}
                  onClick={() => setIds((s) => (on ? s.filter((x) => x !== r.id) : [...s, r.id]))}
                  className={cn('flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition', on ? 'border-ink bg-mark-soft shadow-ink-sm' : 'border-line hover:bg-subtle', locked && 'opacity-80')}
                >
                  <span>
                    <span className="block text-[14px] font-medium">{r.name}</span>
                    <span className="block text-xs text-muted">
                      {r.building} · {r.capacity} seats
                    </span>
                  </span>
                  {locked ? <Lock className="size-4 text-muted" /> : on ? <CheckCircle2 className="size-4 text-ink" /> : null}
                </button>
              );
            })}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------- page */

export default function PlanEditor() {
  const { id } = useParams();
  const planId = Number(id);
  const key = `/plans/${planId}`;
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data: d, isLoading, error, refetch } = useApi<PlanDetail>(key);
  const settings = useApi<Settings>('/settings');

  const [roomId, setRoomId] = useState<number | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [view, setView] = useState<'roll' | 'name'>('roll');
  const [size, setSize] = useState<SeatSize | null>(null); // null = fit to screen
  const [boxW, setBoxW] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const mapRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!el) return;
    observer.current = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    observer.current.observe(el);
  }, []);
  const [tab, setTab] = useState<'room' | 'checks' | 'unseated'>('room');
  const [focusPaper, setFocusPaper] = useState<number | null>(null);
  const [undo, setUndo] = useState<{ a: SeatRef; b: SeatRef }[]>([]);
  const [drag, setDrag] = useState<SeatRef | null>(null);
  const [search, setSearch] = useState('');
  const [picker, setPicker] = useState<{ title: string; duty?: Duty; room_id: number | null } | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const editable = d?.plan.status === 'draft';

  useEffect(() => {
    if (d && (roomId == null || !d.rooms.some((r) => r.id === roomId))) {
      setRoomId((d.rooms.find((r) => r.assigned > 0) || d.rooms[0])?.id ?? null);
    }
  }, [d, roomId]);

  const room = d?.rooms.find((r) => r.id === roomId) || null;
  const fit: SeatSize =
    !room || !boxW ? 'md' : room.layout.kind === 'circular' ? (boxW >= 640 ? 'md' : 'sm') : boxW >= room.layout.cols * 57 + 26 ? 'md' : 'sm';
  const seatSize = size ?? fit;
  const paperById = useMemo(() => new Map(d?.slot.papers.map((p) => [p.id, p]) || []), [d]);
  const seatsHere = useMemo(() => new Map((d?.seats || []).filter((s) => s.room_id === roomId).map((s) => [`${s.r}-${s.c}`, s])), [d, roomId]);
  const conflictKeys = useMemo(
    () => new Set((d?.issues || []).filter((i) => i.type === 'adjacency' && i.room_id === roomId).flatMap((i) => i.seats || [])),
    [d, roomId],
  );
  const roomErrors = useMemo(() => {
    const m = new Map<number, number>();
    for (const i of d?.issues || []) if (i.room_id && i.severity === 'error') m.set(i.room_id, (m.get(i.room_id) || 0) + 1);
    return m;
  }, [d]);
  const selectedStudent: (SeatAssignment & { unseated?: boolean }) | null = useMemo(() => {
    if (!d || !sel) return null;
    if (sel.kind === 'seat') return d.seats.find((s) => sameSeat(s, sel.seat)) || null;
    const u = d.unseated.find((s) => s.id === sel.student_id);
    return u ? { room_id: 0, r: -1, c: -1, student_id: u.id, paper_id: u.paper_id, roll_no: u.roll_no, name: u.name, semester: u.semester, unseated: true } : null;
  }, [d, sel]);

  const letterhead: Letterhead = {
    institution_name: settings.data?.institution_name || '',
    institution_address: settings.data?.institution_address,
    exam_cell_name: settings.data?.exam_cell_name || '',
    controller_name: settings.data?.controller_name,
  };

  /* ---------------------------------------------------------------- edits */

  const refresh = () => qc.invalidateQueries();

  const swap = useCallback(
    async (a: SeatRef, b: SeatRef, record = true) => {
      if (sameSeat(a, b)) return;
      qc.setQueryData<PlanDetail>([key], (old) =>
        old && {
          ...old,
          seats: old.seats.map((s) => (sameSeat(s, a) ? { ...s, ...b } : sameSeat(s, b) ? { ...s, ...a } : s)),
        },
      );
      try {
        await http.post(`${key}/swap`, { a, b });
        if (record) setUndo((u) => [...u.slice(-49), { a, b }]);
      } catch (e) {
        toast.error('Could not move student', e instanceof Error ? e.message : '');
      } finally {
        refresh();
      }
    },
    [key], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const place = async (studentId: number, to: SeatRef) => {
    try {
      await http.post(`${key}/place`, { student_id: studentId, to });
      toast.success('Student seated');
    } catch (e) {
      toast.error('Could not seat student', e instanceof Error ? e.message : '');
    } finally {
      refresh();
    }
  };

  const unseat = async (seat: SeatRef) => {
    try {
      await http.post(`${key}/unseat`, seat);
      setSel(null);
    } finally {
      refresh();
    }
  };

  const doUndo = useCallback(() => {
    const last = undo[undo.length - 1];
    if (!last) return;
    setUndo((u) => u.slice(0, -1));
    swap(last.b, last.a, false);
    toast.info('Move undone');
  }, [undo, swap, toast]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSel(null);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && editable && !(e.target as HTMLElement).closest('input,textarea')) {
        e.preventDefault();
        doUndo();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [doUndo, editable]);

  const clickSeat = (ref: SeatRef, occupied: boolean) => {
    if (!editable) {
      setSel(occupied ? { kind: 'seat', seat: ref } : null);
      return;
    }
    if (!sel) {
      if (occupied) setSel({ kind: 'seat', seat: ref });
      return;
    }
    if (sel.kind === 'seat') {
      if (sameSeat(sel.seat, ref)) return setSel(null);
      swap(sel.seat, ref);
      setSel(null);
      return;
    }
    if (sel.kind === 'unseated') {
      if (occupied) return toast.info('Choose an empty seat', 'Unseated students can only be placed on empty seats.');
      place(sel.student_id, ref);
      setSel(null);
    }
  };

  const act = async (label: string, fn: () => Promise<unknown>, success?: [string, string?]) => {
    setBusy(label);
    try {
      const r = await fn();
      if (success) toast.success(success[0], success[1]);
      return r;
    } catch (e) {
      toast.error('Something went wrong', e instanceof Error ? e.message : '');
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const saveRooms = useAction((ids: number[]) => http.put(`${key}/rooms`, { room_ids: ids }));

  if (isLoading) return <PageLoader label="Loading seating plan…" />;
  if (error || !d) return <ErrorState error={error} onRetry={refetch} />;

  const errors = d.issues.filter((i) => i.severity === 'error');
  const warnings = d.issues.filter((i) => i.severity === 'warning');
  const step = workflowStep(d.plan.status);
  const roomDuties = d.duties.filter((x) => x.room_id === roomId);
  const reserves = d.duties.filter((x) => x.role === 'reserve');
  const teacherIssues = (tid: number) => d.issues.filter((i) => i.teacher_id === tid);
  const searchHits = search.trim()
    ? d.seats.filter((s) => `${s.roll_no} ${s.name}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : [];

  /* ------------------------------------------------------------- actions */

  const approve = async () => {
    const ok = await confirm({
      title: errors.length ? 'Approve with unresolved problems?' : 'Approve this seating plan?',
      message: errors.length ? (
        <div>
          <p className="mb-2">These problems are still open:</p>
          <ul className="list-disc space-y-1 pl-5 text-[13px]">
            {errors.slice(0, 4).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      ) : (
        'The plan will be locked against changes. You can then send duty notifications to invigilators and students can look up their seats.'
      ),
      confirmLabel: errors.length ? 'Approve anyway' : 'Approve plan',
      tone: errors.length ? 'danger' : 'primary',
    });
    if (!ok) return;
    setSel(null);
    act('approve', () => http.post(`${key}/approve`, { force: errors.length > 0 }), ['Plan approved', 'Next step: notify the invigilators.']);
  };

  const notify = async () => {
    const preview = !settings.data?.smtp_configured;
    const teachers = d.duties.length;
    const ok = await confirm({
      title: `Send duty emails to ${plural(teachers, 'teacher')}?`,
      message: (
        <div className="space-y-2">
          <p>Each invigilator receives their room, date, time, duration and reporting time, with a calendar invite attached.</p>
          {preview && (
            <p className="rounded-lg bg-amber-50 p-2.5 text-[13px] text-amber-900">
              Email isn’t configured yet, so messages will be saved to the outbox for preview instead of being delivered. Set up SMTP in Settings to send real emails.
            </p>
          )}
        </div>
      ),
      confirmLabel: preview ? 'Create emails' : 'Send emails',
    });
    if (!ok) return;
    setBusy('notify');
    try {
      const r = await http.post<{ sent: number; preview: number; failed: number; preview_mode: boolean }>(`${key}/notify`);
      if (r.failed) toast.warning(`${r.sent + r.preview} sent, ${r.failed} failed`, 'Check the Notifications page for details.');
      else if (r.preview_mode) toast.success(`${plural(r.preview, 'email')} ready in the outbox`, 'Preview mode — configure SMTP in Settings to deliver them.');
      else toast.success(`${plural(r.sent, 'email')} sent`, 'All invigilators have been notified.');
    } catch (e) {
      toast.error('Could not send notifications', e instanceof Error ? e.message : '');
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const reopen = async () => {
    if (!(await confirm({ title: 'Reopen this plan for editing?', message: d.plan.status === 'notified' ? 'Teachers have already been notified. If you change their duties, send notifications again afterwards.' : 'The plan returns to draft so you can make changes.', confirmLabel: 'Reopen plan' }))) return;
    act('reopen', () => http.post(`${key}/reopen`), ['Plan reopened', 'You can edit seats and duties again.']);
  };

  const regenerate = async () => {
    if (!(await confirm({ title: 'Regenerate this plan?', message: 'Seats and invigilators are recalculated with the same rooms and rules. Manual changes will be lost.', confirmLabel: 'Regenerate', tone: 'danger' }))) return;
    setSel(null);
    setUndo([]);
    act('regenerate', () => http.post('/plans/generate', { slot_id: d.plan.slot_id }), ['Plan regenerated']);
  };

  const pickTeacher = (c: Candidate) => {
    const target = picker!;
    setPicker(null);
    if (target.duty) act('duty', () => http.put(`${key}/duties/${target.duty!.id}`, { teacher_id: c.id }), ['Invigilator changed', `${c.name} assigned`]);
    else act('duty', () => http.post(`${key}/duties`, { room_id: target.room_id, teacher_id: c.id }), ['Invigilator added', c.name]);
  };

  const download = async (kind: 'charts' | 'attendance' | 'notice' | 'duties' | 'excel', onlyRoom = false) => {
    setBusy('download');
    try {
      const ids = onlyRoom && roomId ? [roomId] : undefined;
      if (kind === 'charts') await seatingChartsPdf(d, letterhead, ids);
      if (kind === 'attendance') await attendanceSheetsPdf(d, letterhead, ids);
      if (kind === 'notice') await noticeBoardPdf(d, letterhead);
      if (kind === 'duties') await dutyListPdf(d, letterhead);
      if (kind === 'excel') await planExcel(d);
    } catch (e) {
      toast.error('Could not create the file', e instanceof Error ? e.message : '');
    } finally {
      setBusy(null);
    }
  };

  const selectIssue = (i: Issue) => {
    if (i.room_id) {
      setRoomId(i.room_id);
      setTab('room');
    }
    if (i.type === 'unseated') setTab('unseated');
  };

  /* --------------------------------------------------------------- render */

  const statusMessage =
    d.plan.status === 'draft'
      ? errors.length
        ? `Resolve ${plural(errors.length, 'problem')} below, then approve the plan.`
        : 'Every check passed. Review the rooms, then approve to lock the plan.'
      : d.plan.status === 'approved'
        ? `Plan locked. Send duty notifications to ${plural(d.duties.length, 'invigilator')}.`
        : `Teachers notified ${fmtStamp(d.plan.notified_at)}. Students can now find their seats online.`;

  return (
    <div>
      {/* header */}
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <Link to="/plans" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> Seating plans
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">{d.slot.exam_name}</h1>
            <PlanStatusBadge status={d.plan.status} />
          </div>
          <p className="mt-1 text-[14px] text-muted">
            {fmtDate(d.slot.date, 'long')} · {fmtTime(d.slot.start_time)} – {fmtTime(d.slot.end_time)} · {plural(d.slot.papers.length, 'paper')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Menu
            width="w-72"
            trigger={({ onClick }) => (
              <Button icon={<Download className="size-4" />} iconRight={<ChevronDown className="size-3.5" />} onClick={onClick} loading={busy === 'download'}>
                Download
              </Button>
            )}
          >
            <MenuItem icon={<LayoutGrid className="size-4" />} description="One page per room, for the door & desk" onClick={() => download('charts')}>
              Seating charts (PDF)
            </MenuItem>
            <MenuItem icon={<ClipboardList className="size-4" />} description="Room-wise list with signature column" onClick={() => download('attendance')}>
              Attendance sheets (PDF)
            </MenuItem>
            <MenuItem icon={<FileText className="size-4" />} description="Roll-number ranges per room" onClick={() => download('notice')}>
              Notice-board summary (PDF)
            </MenuItem>
            <MenuItem icon={<Users className="size-4" />} description="Who invigilates where" onClick={() => download('duties')}>
              Invigilator duty list (PDF)
            </MenuItem>
            <MenuDivider />
            <MenuItem icon={<FileSpreadsheet className="size-4" />} onClick={() => download('excel')}>
              Export to Excel
            </MenuItem>
          </Menu>
          {editable && (
            <Menu
              width="w-64"
              trigger={({ onClick }) => (
                <Button icon={<MoreHorizontal className="size-4" />} onClick={onClick} aria-label="More actions">
                  <span className="sr-only sm:not-sr-only">More</span>
                </Button>
              )}
            >
              <MenuItem icon={<RefreshCw className="size-4" />} description="Same rooms and rules" onClick={regenerate}>
                Regenerate plan
              </MenuItem>
              <MenuItem icon={<Settings2 className="size-4" />} description="Pick rooms & rules again" onClick={() => navigate(`/plans/new?slot=${d.plan.slot_id}`)}>
                Change rooms & rules…
              </MenuItem>
              <MenuItem icon={<Building2 className="size-4" />} onClick={() => setRoomsOpen(true)}>
                Add or remove rooms
              </MenuItem>
              <MenuItem
                icon={<Users className="size-4" />}
                description="Recalculate duties fairly"
                onClick={() => act('reassign', () => http.post(`${key}/reassign`), ['Invigilators reassigned'])}
              >
                Auto-assign invigilators
              </MenuItem>
              <MenuDivider />
              <MenuItem
                icon={<Trash2 className="size-4" />}
                danger
                onClick={async () => {
                  if (!(await confirm({ title: 'Delete this seating plan?', message: 'The exam slot stays on the schedule; seats and duties are removed.', confirmLabel: 'Delete plan', tone: 'danger' }))) return;
                  await http.del(key);
                  refresh();
                  toast.success('Plan deleted');
                  navigate('/plans');
                }}
              >
                Delete plan
              </MenuItem>
            </Menu>
          )}
          {d.plan.status !== 'draft' && (
            <Button icon={<Unlock className="size-4" />} onClick={reopen} loading={busy === 'reopen'}>
              Reopen
            </Button>
          )}
          {d.plan.status === 'draft' && (
            <Button variant="primary" icon={<ShieldCheck className="size-4" />} onClick={approve} loading={busy === 'approve'}>
              Approve plan
            </Button>
          )}
          {d.plan.status === 'approved' && (
            <Button variant="primary" icon={<Send className="size-4" />} onClick={notify} loading={busy === 'notify'}>
              Notify teachers
            </Button>
          )}
          {d.plan.status === 'notified' && (
            <Button icon={<Mail className="size-4" />} onClick={notify} loading={busy === 'notify'}>
              Resend emails
            </Button>
          )}
        </div>
      </div>

      {/* workflow */}
      <Card className="mb-4 flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center">
        <Stepper steps={WORKFLOW} current={step} className="flex-1" compact />
        <div className={cn('flex items-center gap-2 text-[13px] lg:max-w-sm lg:border-l lg:border-line lg:pl-5', errors.length && editable ? 'text-rose-700' : 'text-muted')}>
          {errors.length && editable ? <AlertTriangle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />}
          {statusMessage}
        </div>
      </Card>

      {/* stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: 'Students seated', value: `${d.stats.seated}`, sub: `of ${d.stats.expected}`, bad: d.stats.unseated > 0 },
          { label: 'Rooms used', value: `${d.stats.rooms_used}`, sub: d.stats.rooms_selected > d.stats.rooms_used ? `${d.stats.rooms_selected - d.stats.rooms_used} spare` : 'all in use' },
          { label: 'Seat utilisation', value: `${d.stats.capacity_used ? Math.round((d.stats.seated / d.stats.capacity_used) * 100) : 0}%`, sub: `${d.stats.capacity_used} seats` },
          { label: 'Invigilators', value: `${d.stats.invigilators}`, sub: `of ${d.stats.invigilators_required}${d.stats.reserves ? ` + ${d.stats.reserves} reserve` : ''}`, bad: d.stats.invigilators < d.stats.invigilators_required },
          { label: 'Checks', value: errors.length ? `${errors.length}` : '✓', sub: errors.length ? 'problems' : warnings.length ? plural(warnings.length, 'warning') : 'all clear', bad: errors.length > 0, good: !errors.length },
        ].map((s) => (
          <Card key={s.label} className="px-4 py-3">
            <div className="eyebrow text-[9.5px]">{s.label}</div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className={cn('font-display text-[30px] font-semibold leading-none tracking-[-0.02em] tabular', s.bad && 'text-rose-600', s.good && 'text-emerald-600')}>{s.value}</span>
              <span className="text-xs text-muted">{s.sub}</span>
            </div>
          </Card>
        ))}
      </div>

      {!d.rooms.length ? (
        <Card>
          <EmptyState icon={<DoorOpen className="size-6" />} title="No rooms in this plan" action={editable && <Button variant="primary" onClick={() => setRoomsOpen(true)}>Add rooms</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[210px_minmax(0,1fr)_320px]">
          {/* rooms */}
          <Card className="h-fit overflow-hidden xl:col-span-2 2xl:col-span-1">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-[13px] font-semibold">Rooms</span>
              {editable && (
                <button onClick={() => setRoomsOpen(true)} className="rounded p-1 text-muted hover:bg-subtle hover:text-fg" title="Add or remove rooms">
                  <Plus className="size-4" />
                </button>
              )}
            </div>
            <div className="flex gap-1 overflow-x-auto p-2 scrollbar-thin 2xl:flex-col 2xl:overflow-visible">
              {d.rooms.map((r) => {
                const invig = d.duties.filter((x) => x.room_id === r.id).length;
                const errs = roomErrors.get(r.id) || 0;
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      setRoomId(r.id);
                      setTab('room');
                    }}
                    className={cn('min-w-[150px] rounded-lg px-3 py-2.5 text-left transition 2xl:min-w-0', r.id === roomId ? 'bg-white ring-1 ring-ink shadow-ink-sm' : 'hover:bg-subtle')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-medium">{r.name}</span>
                      {errs > 0 ? <span className="size-2 shrink-0 rounded-full bg-rose-500" title={`${errs} problem(s)`} /> : r.assigned > 0 ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" /> : null}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-xs text-muted">
                      <span className="tabular">
                        {r.assigned}/{r.capacity}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3" />
                        {invig}/{r.required_invigilators}
                      </span>
                    </div>
                    <Progress value={r.assigned} max={r.capacity} className="mt-1.5 h-1" tone={r.assigned ? 'primary' : 'amber'} />
                  </button>
                );
              })}
              {d.unseated.length > 0 && (
                <button
                  onClick={() => setTab('unseated')}
                  className="min-w-[150px] rounded-lg border border-dashed border-rose-300 px-3 py-2.5 text-left text-rose-700 transition hover:bg-rose-50 2xl:min-w-0"
                >
                  <div className="text-[14px] font-medium">Unseated</div>
                  <div className="text-xs">{plural(d.unseated.length, 'student')}</div>
                </button>
              )}
            </div>
          </Card>

          {/* seat map */}
          <Card className="min-w-0 overflow-hidden">
            {room && (
              <>
                <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                  <div className="min-w-[10rem] flex-1">
                    <div className="font-semibold">{room.name}</div>
                    <div className="truncate text-xs text-muted">
                      {[room.building, room.floor && `${room.floor} floor`, room.layout.name].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find student…" className="field h-8 w-44 py-1 pl-8 text-[13px]" />
                    {searchHits.length > 0 && (
                      <div className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-xl border border-line bg-card p-1 shadow-pop">
                        {searchHits.map((s) => (
                          <button
                            key={s.student_id}
                            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-subtle"
                            onClick={() => {
                              setRoomId(s.room_id);
                              setSel({ kind: 'seat', seat: { room_id: s.room_id, r: s.r, c: s.c } });
                              setTab('room');
                              setSearch('');
                            }}
                          >
                            <span className="min-w-0">
                              <span className="block font-medium">{s.roll_no}</span>
                              <span className="block truncate text-xs text-muted">{s.name}</span>
                            </span>
                            <Badge>{d.rooms.find((r) => r.id === s.room_id)?.name}</Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Segmented size="sm" value={view} onChange={setView} items={[{ value: 'roll', label: 'Roll no.' }, { value: 'name', label: 'Name' }]} />
                  <div className="flex items-center rounded-lg bg-subtle p-0.5">
                    <button onClick={() => setSize('sm')} className={cn('rounded-md p-1', size === 'sm' ? 'bg-card shadow-sm' : 'text-muted')} title="Compact">
                      <ZoomOut className="size-3.5" />
                    </button>
                    <button onClick={() => setSize(null)} className={cn('rounded-md p-1', size === null ? 'bg-card shadow-sm' : 'text-muted')} title="Fit to screen">
                      <LayoutGrid className="size-3.5" />
                    </button>
                    <button onClick={() => setSize('lg')} className={cn('rounded-md p-1', size === 'lg' ? 'bg-card shadow-sm' : 'text-muted')} title="Large">
                      <ZoomIn className="size-3.5" />
                    </button>
                  </div>
                  {editable && (
                    <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} disabled={!undo.length} onClick={doUndo} title="Undo (Ctrl+Z)">
                      Undo
                    </Button>
                  )}
                </div>

                {sel && selectedStudent && editable && (
                  <div className="flex items-center gap-3 border-b border-ink/15 bg-mark-soft px-4 py-2 text-[13px]">
                    <Hand className="size-4 shrink-0 text-ink" />
                    <span className="min-w-0 flex-1">
                      Moving <b>{selectedStudent.roll_no}</b> — click {sel.kind === 'unseated' ? 'an empty seat' : 'any seat (in any room) to swap or move'}.
                    </span>
                    <button onClick={() => setSel(null)} className="flex items-center gap-1 text-muted hover:text-fg">
                      <X className="size-3.5" /> Esc
                    </button>
                  </div>
                )}
                {!editable && (
                  <div className="flex items-center gap-2 border-b border-line bg-subtle/50 px-4 py-2 text-[13px] text-muted">
                    <Lock className="size-3.5" /> This plan is locked. Reopen it to move students or change invigilators.
                  </div>
                )}

                <div ref={mapRef} className="flex min-h-[420px] overflow-auto bg-paper/30 p-4 scrollbar-thin">
                  <SeatMap
                    layout={room.layout}
                    blocked={room.blocked}
                    size={seatSize}
                    axes={room.layout.kind === 'grid' && seatSize !== 'sm'}
                    cell={(info) => {
                      if (!info.seat) return <div className="size-full rounded-md border border-dashed border-line bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgb(var(--line))_3px,rgb(var(--line))_4px)] opacity-60" title="Blocked seat" />;
                      const a = seatsHere.get(info.key);
                      const p = a ? paperById.get(a.paper_id) : undefined;
                      const ref = { room_id: room.id, r: info.r, c: info.c };
                      const isSel = sel?.kind === 'seat' && sameSeat(sel.seat, ref);
                      const conflict = conflictKeys.has(info.key);
                      const target = editable && !!sel && !isSel && (sel.kind === 'seat' || !a);
                      const dim = focusPaper != null && a?.paper_id !== focusPaper;
                      const size = seatSize;
                      return (
                        <button
                          type="button"
                          draggable={editable && !!a}
                          onDragStart={(e: DragEvent) => {
                            e.dataTransfer.effectAllowed = 'move';
                            setDrag(ref);
                          }}
                          onDragEnd={() => setDrag(null)}
                          onDragOver={(e) => editable && drag && e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (drag) swap(drag, ref);
                            setDrag(null);
                            setSel(null);
                          }}
                          onClick={() => clickSeat(ref, !!a)}
                          title={a ? `${info.seat.label} · ${a.roll_no} · ${a.name}${p ? ` · ${paperLabel(p)}` : ''}${conflict ? ' · Same paper as a neighbour!' : ''}` : `Seat ${info.seat.label} (empty)`}
                          className={cn(
                            'relative flex size-full flex-col items-center justify-center overflow-hidden rounded-md border text-center leading-tight transition-all',
                            a ? (p ? paperColor(p.color).seat : 'bg-subtle') : 'border-dashed border-line bg-card text-muted',
                            a && editable && 'cursor-grab active:cursor-grabbing',
                            conflict && 'ring-2 ring-rose-500 ring-offset-1 ring-offset-card',
                            isSel && 'z-10 scale-110 shadow-pop ring-2 ring-ink ring-offset-2 ring-offset-card',
                            target && 'hover:border-ink hover:ring-2 hover:ring-ink/30',
                            target && !a && 'border-ink/40 bg-mark-soft',
                            dim && 'opacity-25',
                          )}
                        >
                          {size !== 'sm' && <span className="absolute left-1 top-0.5 text-[8px] font-medium opacity-55">{info.seat.label}</span>}
                          {a ? (
                            <span className={cn('flex max-w-full flex-col items-center', size !== 'sm' && 'mt-1.5')}>
                              {view === 'roll' ? (
                                <RollText roll={a.roll_no} size={size} />
                              ) : (
                                <span className={cn('max-w-full truncate px-0.5 font-semibold', size === 'sm' ? 'text-[8px]' : 'text-[11px]')}>{a.name.split(' ')[0]}</span>
                              )}
                              {size !== 'sm' && (view === 'name' || !isSplitRoll(a.roll_no) || size === 'lg') && <span className="text-[8.5px] opacity-70">{p?.short}</span>}
                            </span>
                          ) : (
                            <span className="text-[9px]">{size === 'sm' ? '' : 'empty'}</span>
                          )}
                          {conflict && size !== 'sm' && <AlertTriangle className="absolute right-0.5 top-0.5 size-2.5 text-rose-500" />}
                        </button>
                      );
                    }}
                  />
                </div>

                {/* legend */}
                <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
                  {d.slot.papers.map((p) => {
                    const n = d.seats.filter((s) => s.room_id === room.id && s.paper_id === p.id).length;
                    if (!n) return null;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setFocusPaper((f) => (f === p.id ? null : p.id))}
                        className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition', focusPaper === p.id ? 'border-ink bg-mark-soft shadow-ink-sm' : 'border-line hover:bg-subtle')}
                        title="Highlight this paper"
                      >
                        <span className={cn('size-2.5 rounded-full', paperColor(p.color).dot)} />
                        <span className="font-medium">{p.short}</span>
                        <span className="text-muted tabular">{n}</span>
                      </button>
                    );
                  })}
                  <span className="ml-auto hidden text-xs text-muted md:inline">
                    {editable ? 'Click a student, then another seat to swap · drag & drop works too' : 'Click a student to see details'}
                  </span>
                </div>
              </>
            )}
          </Card>

          {/* inspector */}
          <div className="space-y-4">
            <Card className="overflow-hidden">
              <div className="flex border-b border-line">
                {(
                  [
                    { v: 'room', label: 'Room', count: undefined },
                    { v: 'checks', label: 'Checks', count: errors.length + warnings.length },
                    ...(d.unseated.length ? [{ v: 'unseated', label: 'Unseated', count: d.unseated.length }] : []),
                  ] as { v: typeof tab; label: string; count?: number }[]
                ).map((t) => (
                  <button
                    key={t.v}
                    onClick={() => setTab(t.v)}
                    className={cn('-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition', tab === t.v ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-fg')}
                  >
                    {t.label}
                    {!!t.count && (
                      <span className={cn('rounded-full px-1.5 text-[11px] tabular', t.v === 'checks' && errors.length ? 'bg-rose-100 text-rose-700' : 'bg-subtle text-muted')}>{t.count}</span>
                    )}
                  </button>
                ))}
              </div>

              {tab === 'room' && room && (
                <div className="divide-y divide-line">
                  {selectedStudent && (
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-medium uppercase tracking-wide text-muted">Selected student</div>
                          <div className="mt-1 font-semibold">{selectedStudent.name}</div>
                          <div className="text-[13px] text-muted">
                            {selectedStudent.roll_no} · {paperById.get(selectedStudent.paper_id)?.short}
                            {!selectedStudent.unseated && ` · Seat ${d.rooms.find((r) => r.id === selectedStudent.room_id)?.seats.find((s) => s.r === selectedStudent.r && s.c === selectedStudent.c)?.label}`}
                          </div>
                        </div>
                        <button onClick={() => setSel(null)} className="rounded p-1 text-muted hover:text-fg" aria-label="Clear selection">
                          <X className="size-4" />
                        </button>
                      </div>
                      {editable && !selectedStudent.unseated && (
                        <div className="flex flex-wrap gap-2">
                          <select
                            className="field h-8 flex-1 py-1 text-[13px]"
                            value=""
                            onChange={(e) => {
                              const target = d.rooms.find((r) => r.id === Number(e.target.value));
                              if (!target || sel?.kind !== 'seat') return;
                              const taken = new Set(d.seats.filter((s) => s.room_id === target.id).map((s) => `${s.r}-${s.c}`));
                              const free = target.seats.find((s) => !taken.has(s.key));
                              if (!free) return toast.warning(`${target.name} is full`, 'Swap with a student there instead.');
                              swap(sel.seat, { room_id: target.id, r: free.r, c: free.c });
                              setRoomId(target.id);
                              setSel(null);
                              toast.success(`Moved to ${target.name}`, `Seat ${free.label}`);
                            }}
                          >
                            <option value="">Move to another room…</option>
                            {d.rooms
                              .filter((r) => r.id !== selectedStudent.room_id)
                              .map((r) => (
                                <option key={r.id} value={r.id} disabled={r.assigned >= r.capacity}>
                                  {r.name} ({r.capacity - r.assigned} free)
                                </option>
                              ))}
                          </select>
                          <Button size="sm" variant="ghost" icon={<UserMinus className="size-3.5" />} onClick={() => sel?.kind === 'seat' && unseat(sel.seat)}>
                            Unseat
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <div className="text-[13px] font-semibold">Invigilators</div>
                        <div className="text-xs text-muted">
                          {room.assigned ? `${roomDuties.length} of ${room.required_invigilators} needed · 1 per ${d.plan.options.students_per_invigilator} students` : 'No students in this room'}
                        </div>
                      </div>
                      {editable && room.assigned > 0 && (
                        <Button size="xs" variant="subtle" icon={<UserPlus className="size-3.5" />} onClick={() => setPicker({ title: `Add invigilator to ${room.name}`, room_id: room.id })}>
                          Add
                        </Button>
                      )}
                    </div>
                    <ul className="space-y-1.5">
                      {roomDuties.map((x) => {
                        const iss = teacherIssues(x.teacher_id);
                        return (
                          <li key={x.id} className="group flex items-center gap-2.5 rounded-lg border border-line px-2.5 py-2">
                            <Avatar name={x.name} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-medium">{x.name}</div>
                              <div className="truncate text-xs text-muted">{x.department || x.designation}</div>
                              {iss.map((i, k) => (
                                <div key={k} className={cn('mt-0.5 text-[11px]', i.severity === 'error' ? 'text-rose-600' : 'text-amber-600')}>
                                  {i.message.replace(`${x.name} `, '')}
                                </div>
                              ))}
                            </div>
                            {editable && (
                              <div className="flex shrink-0 gap-0.5 opacity-100 transition xl:opacity-0 xl:group-hover:opacity-100">
                                <button onClick={() => setPicker({ title: `Replace ${x.name}`, duty: x, room_id: room.id })} className="rounded p-1 text-muted hover:bg-subtle hover:text-fg" title="Replace">
                                  <RefreshCw className="size-3.5" />
                                </button>
                                <button onClick={() => act('duty', () => http.del(`${key}/duties/${x.id}`), ['Invigilator removed'])} className="rounded p-1 text-muted hover:bg-subtle hover:text-rose-600" title="Remove">
                                  <X className="size-3.5" />
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                      {!roomDuties.length && room.assigned > 0 && <li className="rounded-lg border border-dashed border-rose-300 px-3 py-3 text-center text-xs text-rose-600">No invigilator assigned</li>}
                    </ul>
                  </div>

                  {room.assigned > 0 && (
                    <div className="p-4">
                      <div className="mb-2 text-[13px] font-semibold">Papers in this room</div>
                      <ul className="space-y-2">
                        {d.slot.papers.map((p) => {
                          const { ranges, count } = rollRanges(d, room.id, p.id);
                          if (!count) return null;
                          return (
                            <li key={p.id} className="flex gap-2.5 text-[13px]">
                              <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', paperColor(p.color).dot)} />
                              <div className="min-w-0">
                                <div className="font-medium">
                                  {p.short} <span className="font-normal text-muted">· {count} students</span>
                                </div>
                                {p.subject && <div className="truncate text-xs text-muted">{p.subject}</div>}
                                <div className="mt-0.5 font-mono text-[11px] text-muted">{ranges.slice(0, 3).join(', ')}{ranges.length > 3 ? ' …' : ''}</div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 p-4">
                    <Button size="xs" icon={<LayoutGrid className="size-3.5" />} onClick={() => download('charts', true)}>
                      Chart for {room.name}
                    </Button>
                    <Button size="xs" icon={<ClipboardList className="size-3.5" />} onClick={() => download('attendance', true)}>
                      Attendance
                    </Button>
                  </div>
                </div>
              )}

              {tab === 'checks' && (
                <div className="p-4">
                  {!d.issues.length ? (
                    <div className="space-y-2.5">
                      <div className="mb-3 flex items-center gap-2 font-semibold text-emerald-700">
                        <CheckCircle2 className="size-5" /> All checks passed
                      </div>
                      {['No two neighbours write the same paper', 'Every student has a seat', 'Every room has its invigilators', 'No teacher clashes or unavailable duties', 'No room is double-booked'].map((t) => (
                        <div key={t} className="flex items-center gap-2 text-[13px] text-muted">
                          <CheckCircle2 className="size-4 text-emerald-500" /> {t}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {[...errors, ...warnings].map((i, k) => (
                        <li key={k}>
                          <button
                            onClick={() => selectIssue(i)}
                            className={cn(
                              'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[13px] transition hover:shadow-sm',
                              i.severity === 'error' ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60',
                            )}
                          >
                            <AlertTriangle className={cn('mt-0.5 size-4 shrink-0', i.severity === 'error' ? 'text-rose-500' : 'text-amber-500')} />
                            <span>{i.message}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {tab === 'unseated' && (
                <div className="p-4">
                  <Callout tone="info" className="mb-3">
                    {editable ? 'Select a student, then click an empty seat on the map.' : 'Reopen the plan to seat these students.'}
                  </Callout>
                  <ul className="max-h-[420px] space-y-1 overflow-y-auto scrollbar-thin">
                    {d.unseated.map((u) => {
                      const on = sel?.kind === 'unseated' && sel.student_id === u.id;
                      return (
                        <li key={u.id}>
                          <button
                            disabled={!editable}
                            onClick={() => setSel(on ? null : { kind: 'unseated', student_id: u.id })}
                            className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition', on ? 'bg-mark-soft ring-1 ring-ink' : 'hover:bg-subtle')}
                          >
                            <span className={cn('size-2.5 shrink-0 rounded-full', paperColor(paperById.get(u.paper_id)?.color ?? 0).dot)} />
                            <span className="font-medium">{u.roll_no}</span>
                            <span className="truncate text-muted">{u.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Card>

            {(reserves.length > 0 || (editable && d.plan.options.reserve_invigilators > 0)) && (
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[13px] font-semibold">Reserve invigilators</div>
                  {editable && (
                    <Button size="xs" variant="ghost" icon={<UserPlus className="size-3.5" />} onClick={() => setPicker({ title: 'Add reserve invigilator', room_id: null })}>
                      Add
                    </Button>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {reserves.map((x) => (
                    <li key={x.id} className="flex items-center gap-2.5 text-[13px]">
                      <Avatar name={x.name} size="sm" />
                      <span className="flex-1 truncate">{x.name}</span>
                      {editable && (
                        <button onClick={() => act('duty', () => http.del(`${key}/duties/${x.id}`))} className="rounded p-1 text-muted hover:text-rose-600" aria-label="Remove reserve">
                          <X className="size-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <div className="px-1 text-xs text-muted">
              Generated {fmtStamp(d.plan.generated_at)}
              {d.plan.updated_at && d.plan.updated_at !== d.plan.generated_at && ` · edited ${fmtStamp(d.plan.updated_at)}`}
              {d.plan.status === 'notified' && (
                <>
                  {' · '}
                  <Link to={`/notifications?plan=${d.plan.id}`} className="font-semibold text-ink underline decoration-mark decoration-2 underline-offset-2 hover:decoration-ink">
                    View emails
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <TeacherPicker open={!!picker} onClose={() => setPicker(null)} planId={planId} title={picker?.title || ''} onPick={pickTeacher} />
      <RoomPicker
        open={roomsOpen}
        onClose={() => setRoomsOpen(false)}
        detail={d}
        saving={saveRooms.isPending}
        onSave={(ids) =>
          saveRooms.mutate(ids, {
            onSuccess: () => {
              setRoomsOpen(false);
              toast.success('Rooms updated');
            },
            onError: (e) => toast.error('Could not update rooms', e.message),
          })
        }
      />
    </div>
  );
}
