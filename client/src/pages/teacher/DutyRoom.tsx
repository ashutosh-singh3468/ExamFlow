import { ArrowLeft, ClipboardList, Clock, LayoutGrid, Phone, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '@/lib/api';
import type { Paper, PlanDetail, PlanRoom, SeatAssignment, SlotBase } from '@/lib/types';
import { Avatar, Button, Card, CardHeader, ErrorState, PageLoader, cn } from '@/components/ui';
import { useToast } from '@/components/overlays';
import { RollText, SeatMap, isSplitRoll } from '@/components/SeatMap';
import { paperColor } from '@/lib/colors';
import { addMinutes, fmtDate, fmtTime, relativeDay } from '@/lib/format';
import { attendanceSheetsPdf, rollRanges, seatingChartsPdf } from '@/lib/pdf';

interface DutyRoomData {
  duty: { id: number; plan_id: number; room_id: number | null; role: string; status: string };
  slot: SlotBase & { papers: Paper[] };
  room: (PlanRoom & { seats: PlanRoom['seats'] }) | null;
  seats: SeatAssignment[];
  team: { role: string; room_id: number | null; name: string; department: string | null; phone: string | null }[];
}

export default function DutyRoom() {
  const { planId } = useParams();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useApi<DutyRoomData>(`/me/duties/${planId}`);
  const info = useApi<{ institution_name: string; institution_address: string; exam_cell_name: string; controller_name: string; report_before_min: number }>('/public/info');
  const [q, setQ] = useState('');

  const asDetail = useMemo<PlanDetail | null>(() => {
    if (!data?.room) return null;
    const room = { ...data.room, assigned: data.seats.length, required_invigilators: 1, departments: [] };
    return {
      plan: { id: data.duty.plan_id, slot_id: data.slot.id, status: data.duty.status as PlanDetail['plan']['status'], options: {} as PlanDetail['plan']['options'], room_ids: [room.id], generated_at: null, updated_at: null, approved_at: null, notified_at: null },
      slot: data.slot,
      rooms: [room],
      seats: data.seats,
      duties: data.team.filter((t) => t.room_id === room.id).map((t, i) => ({ id: i, teacher_id: i, email: null, designation: null, emp_code: null, ...t, role: t.role as 'invigilator' })),
      unseated: [],
      stats: {} as PlanDetail['stats'],
      issues: [],
    };
  }, [data]);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const room = data.room;
  const bySeat = new Map(data.seats.map((s) => [`${s.r}-${s.c}`, s]));
  const paperById = new Map(data.slot.papers.map((p) => [p.id, p]));
  const match = q.trim() ? data.seats.find((s) => `${s.roll_no} ${s.name}`.toLowerCase().includes(q.trim().toLowerCase())) : null;
  const rb = info.data?.report_before_min ?? 20;

  const print = async (kind: 'chart' | 'attendance') => {
    if (!asDetail || !info.data) return;
    try {
      if (kind === 'chart') await seatingChartsPdf(asDetail, info.data);
      else await attendanceSheetsPdf(asDetail, info.data);
    } catch (e) {
      toast.error('Could not create the PDF', e instanceof Error ? e.message : '');
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/my/duties" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> My duties
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[36px] font-semibold leading-tight tracking-[-0.025em] sm:text-[44px]">{room ? room.name : 'Reserve duty'}</h1>
          <p className="mt-1 text-[14px] text-muted">
            {data.slot.exam_name} · {fmtDate(data.slot.date, 'long')} · {relativeDay(data.slot.date)}
          </p>
        </div>
        {room && (
          <div className="flex gap-2">
            <Button icon={<LayoutGrid className="size-4" />} onClick={() => print('chart')}>
              Seating chart
            </Button>
            <Button variant="primary" icon={<ClipboardList className="size-4" />} onClick={() => print('attendance')}>
              Attendance sheet
            </Button>
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Clock className="size-3.5" /> Report by
          </div>
          <div className="mt-1.5 font-display text-[26px] font-semibold leading-none tracking-[-0.02em]">{fmtTime(addMinutes(data.slot.start_time, -rb))}</div>
        </Card>
        <Card className="px-4 py-3.5">
          <div className="text-xs text-muted">Exam time</div>
          <div className="mt-1.5 font-display text-[26px] font-semibold leading-none tracking-[-0.02em]">
            {fmtTime(data.slot.start_time)} – {fmtTime(data.slot.end_time)}
          </div>
        </Card>
        <Card className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Users className="size-3.5" /> Students
          </div>
          <div className="mt-1.5 font-display text-[26px] font-semibold leading-none tracking-[-0.02em]">{data.seats.length}</div>
        </Card>
        <Card className="px-4 py-3.5">
          <div className="text-xs text-muted">Location</div>
          <div className="mt-1 truncate text-[15px] font-semibold">{room ? [room.building, room.floor && `${room.floor} floor`].filter(Boolean).join(', ') || room.name : 'Examination cell'}</div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {room ? (
          <Card className="min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <div className="flex-1 text-[14px] font-semibold">Seating in {room.name}</div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a student…" className="field h-8 w-48 py-1 pl-8 text-[13px]" />
              </div>
            </div>
            {q && (
              <div className="border-b border-line bg-subtle/50 px-4 py-2 text-[13px]">
                {match ? (
                  <>
                    <b>{match.roll_no}</b> {match.name} → seat <b>{room.seats.find((s) => s.r === match.r && s.c === match.c)?.label}</b>
                  </>
                ) : (
                  <span className="text-muted">No student in this room matches.</span>
                )}
              </div>
            )}
            <div className="flex overflow-auto p-6 scrollbar-thin">
              <SeatMap
                layout={room.layout}
                blocked={room.blocked}
                size="md"
                axes={room.layout.kind === 'grid'}
                cell={(c) => {
                  if (!c.seat) return <div className="size-full rounded-md border border-dashed border-line opacity-50" />;
                  const a = bySeat.get(c.key);
                  const p = a ? paperById.get(a.paper_id) : undefined;
                  const hit = match && a?.student_id === match.student_id;
                  return (
                    <div
                      title={a ? `${c.seat.label} · ${a.roll_no} · ${a.name}` : `Seat ${c.seat.label} (empty)`}
                      className={cn(
                        'relative flex size-full flex-col items-center justify-center rounded-md border text-center leading-tight',
                        a ? (p ? paperColor(p.color).seat : 'bg-subtle') : 'border-dashed border-line text-muted',
                        hit && 'z-10 scale-110 shadow-pop ring-2 ring-ink ring-offset-2 ring-offset-card',
                        match && !hit && 'opacity-40',
                      )}
                    >
                      <span className="absolute left-1 top-0.5 text-[8px] opacity-55">{c.seat.label}</span>
                      {a && (
                        <span className="mt-1.5 flex max-w-full flex-col items-center">
                          <RollText roll={a.roll_no} size="md" />
                          {!isSplitRoll(a.roll_no) && <span className="text-[8.5px] opacity-70">{p?.short}</span>}
                        </span>
                      )}
                    </div>
                  );
                }}
              />
            </div>
          </Card>
        ) : (
          <Card className="p-6 text-[14px] text-muted">You are on the reserve pool for this slot. Please report to the examination cell; you may be sent to any room.</Card>
        )}

        <div className="space-y-4">
          <Card>
            <CardHeader title="Duty team" />
            <ul className="divide-y divide-line">
              {data.team.map((t, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={t.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{t.name}</div>
                    <div className="truncate text-xs text-muted">{t.role === 'reserve' ? 'Reserve' : t.department}</div>
                  </div>
                  {t.phone && (
                    <a href={`tel:${t.phone}`} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-ink" title={t.phone}>
                      <Phone className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          {asDetail && room && (
            <Card>
              <CardHeader title="Papers in this room" />
              <ul className="space-y-3 p-5">
                {data.slot.papers.map((p) => {
                  const { ranges, count } = rollRanges(asDetail, room.id, p.id);
                  if (!count) return null;
                  return (
                    <li key={p.id} className="flex gap-2.5 text-[13px]">
                      <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', paperColor(p.color).dot)} />
                      <div className="min-w-0">
                        <div className="font-medium">
                          {p.short} · {count}
                        </div>
                        {p.subject && <div className="text-xs text-muted">{p.subject}</div>}
                        <div className="mt-0.5 font-mono text-[11px] text-muted">{ranges.join(', ')}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
