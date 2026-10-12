import { CalendarOff, CalendarPlus, Check, Lock, X } from 'lucide-react';
import { useState } from 'react';
import { http, useAction, useApi } from '@/lib/api';
import type { Unavailability } from '@/lib/types';
import { Button, Callout, Card, CardHeader, EmptyState, ErrorState, Field, Input, PageHeader, PageLoader, cn } from '@/components/ui';
import { Modal, useToast } from '@/components/overlays';
import { fmtDate, fmtTime, relativeDay, todayISO } from '@/lib/format';
import type { Overview } from './MyDuties';

export default function Availability() {
  const { data, isLoading, error, refetch } = useApi<Overview>('/me/overview');
  const toast = useToast();
  const [ask, setAsk] = useState<{ date: string; slot_id: number | null; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const [leaveDate, setLeaveDate] = useState(todayISO());
  const [leaveReason, setLeaveReason] = useState('');
  const add = useAction((body: { date: string; slot_id: number | null; reason: string }) => http.post<{ warning: string | null }>('/me/unavailability', body));
  const remove = useAction((id: number) => http.del(`/me/unavailability/${id}`));

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  const byDate = new Map<string, Overview['slots']>();
  for (const s of data.slots) byDate.set(s.date, [...(byDate.get(s.date) || []), s]);
  const findUn = (date: string, slotId: number | null) => data.unavailability.find((u) => u.date === date && (u.slot_id ?? null) === slotId);
  const dutyOn = (slotId: number) => data.duties.find((d) => d.slot_id === slotId);
  const otherLeave = data.unavailability.filter((u) => !byDate.has(u.date) && u.date >= todayISO());

  const submit = (body: { date: string; slot_id: number | null; reason: string }, after?: () => void) =>
    add.mutate(body, {
      onSuccess: (r) => {
        if (r.warning) toast.warning('Recorded — but you already have a duty', r.warning);
        else toast.success('Marked unavailable', 'The exam cell will not assign you duties then.');
        after?.();
      },
      onError: (e) => toast.error('Could not save', e.message),
    });

  const unmark = (u: Unavailability) => remove.mutate(u.id, { onSuccess: () => toast.success('Marked available again') });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="My availability" description="Tell the examination cell when you can’t invigilate. Duties are never auto-assigned on these dates or sessions." />

      <Card className="mb-6">
        <CardHeader title="Upcoming exam sessions" description="Everything is ‘available’ unless you mark it otherwise." />
        {!byDate.size ? (
          <EmptyState icon={<CalendarPlus className="size-6" />} title="No exams scheduled yet" description="Exam sessions will appear here once the timetable is published." />
        ) : (
          <ul className="divide-y divide-line">
            {[...byDate.entries()].map(([date, slots]) => {
              const whole = findUn(date, null);
              return (
                <li key={date} className="px-5 py-4">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{fmtDate(date, 'long')}</div>
                      <div className="text-xs text-muted">{relativeDay(date)}</div>
                    </div>
                    {whole ? (
                      <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => unmark(whole)}>
                        Unavailable all day{whole.reason ? ` — ${whole.reason}` : ''} · undo
                      </Button>
                    ) : (
                      <Button size="sm" icon={<CalendarOff className="size-3.5" />} onClick={() => { setReason(''); setAsk({ date, slot_id: null, label: `the whole day of ${fmtDate(date, 'long')}` }); }}>
                        Unavailable all day
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {slots.map((s) => {
                      const u = findUn(date, s.id);
                      const off = !!(whole || u);
                      const duty = dutyOn(s.id);
                      const locked = !!duty;
                      return (
                        <div
                          key={s.id}
                          className={cn(
                            'flex items-center gap-3 rounded-xl border px-3.5 py-3 transition',
                            off ? 'border-amber-300 bg-amber-50' : 'border-line',
                          )}
                        >
                          <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', off ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600')}>
                            {off ? <CalendarOff className="size-4" /> : <Check className="size-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-medium">
                              {s.session || 'Session'} · {fmtTime(s.start_time)}
                            </div>
                            <div className="truncate text-xs text-muted">
                              {locked ? `You have a duty in ${duty!.room_name || 'the reserve pool'}` : off ? (u?.reason || whole?.reason || 'Unavailable') : s.exam_name}
                            </div>
                          </div>
                          {locked ? (
                            <span className="flex items-center gap-1 text-xs text-muted" title="Contact the exam cell to change a confirmed duty">
                              <Lock className="size-3.5" /> Assigned
                            </span>
                          ) : whole ? null : u ? (
                            <Button size="xs" variant="ghost" onClick={() => unmark(u)}>
                              I’m available
                            </Button>
                          ) : (
                            <Button size="xs" onClick={() => { setReason(''); setAsk({ date, slot_id: s.id, label: `${s.session || ''} ${fmtTime(s.start_time)} on ${fmtDate(date, 'short')}`.trim() }); }}>
                              Can’t make it
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Leave on other dates" description="Planned leave outside the published timetable — useful before exams are scheduled." />
        <div className="space-y-4 p-5">
          {otherLeave.length > 0 && (
            <ul className="space-y-2">
              {otherLeave.map((u) => (
                <li key={u.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-[13px]">
                  <CalendarOff className="size-4 text-amber-500" />
                  <span className="font-medium">{fmtDate(u.date)}</span>
                  <span className="flex-1 truncate text-muted">{u.reason}</span>
                  <button onClick={() => unmark(u)} className="rounded p-1 text-muted hover:text-rose-600" aria-label="Remove">
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-[170px_1fr_auto] sm:items-end">
            <Field label="Date">
              <Input type="date" value={leaveDate} min={todayISO()} onChange={(e) => setLeaveDate(e.target.value)} />
            </Field>
            <Field label="Reason (optional)">
              <Input value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} placeholder="e.g. Conference, medical leave" />
            </Field>
            <Button variant="primary" loading={add.isPending} disabled={!leaveDate} onClick={() => submit({ date: leaveDate, slot_id: null, reason: leaveReason }, () => setLeaveReason(''))}>
              Add leave
            </Button>
          </div>
          <Callout tone="info">Already assigned a duty you can’t attend? Mark it here and also call the examination cell so they can arrange a replacement.</Callout>
        </div>
      </Card>

      <Modal
        open={!!ask}
        onClose={() => setAsk(null)}
        size="sm"
        title="Mark yourself unavailable"
        description={ask ? `You won’t be assigned invigilation for ${ask.label}.` : undefined}
        footer={
          <>
            <Button onClick={() => setAsk(null)}>Cancel</Button>
            <Button variant="primary" loading={add.isPending} onClick={() => ask && submit({ date: ask.date, slot_id: ask.slot_id, reason }, () => setAsk(null))}>
              Confirm
            </Button>
          </>
        }
      >
        <Field label="Reason (optional)" hint="Visible to the examination cell.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Medical appointment" />
        </Field>
      </Modal>
    </div>
  );
}
