import { AlertTriangle, Armchair, ArrowRight, CalendarPlus, CheckCircle2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '@/lib/api';
import type { PlanSummary, Slot } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, PageLoader, Tabs, Table, Td, Th, cn } from '@/components/ui';
import { MiniProgress, PlanStatusBadge } from '@/components/status';
import { paperColor } from '@/lib/colors';
import { fmtDate, fmtTime, plural, relativeDay, todayISO } from '@/lib/format';

type Filter = 'all' | 'attention' | 'draft' | 'approved' | 'notified';

export default function Plans() {
  const plans = useApi<(PlanSummary & { slot: Slot })[]>('/plans');
  const slots = useApi<Slot[]>('/slots');
  const [filter, setFilter] = useState<Filter>('all');
  const navigate = useNavigate();
  if (plans.isLoading || slots.isLoading) return <PageLoader />;
  if (plans.error) return <ErrorState error={plans.error} onRetry={() => plans.refetch()} />;

  const today = todayISO();
  const awaiting = (slots.data || []).filter((s) => !s.plan && s.date >= today);
  const all = plans.data!;
  const count = (f: Filter) =>
    f === 'all' ? all.length : f === 'attention' ? all.filter((p) => p.stats.errors > 0).length : all.filter((p) => p.status === f).length;
  const list = all.filter((p) => (filter === 'all' ? true : filter === 'attention' ? p.stats.errors > 0 : p.status === filter));

  return (
    <div>
      <PageHeader
        title="Seating plans"
        description="Generate seating and invigilation, review and adjust, approve, then notify teachers."
        actions={
          <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={() => navigate('/plans/new')}>
            Generate seating
          </Button>
        }
      />

      {awaiting.length > 0 && (
        <Card className="mb-6">
          <CardHeader
            title="Waiting for seating"
            description={`${plural(awaiting.length, 'upcoming exam slot')} without a seating plan`}
            icon={<CalendarPlus className="size-5" />}
          />
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {awaiting.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <div className="w-12 shrink-0 text-center">
                  <div className="text-[11px] font-medium uppercase text-muted">{fmtDate(s.date, 'short').split(' ')[1]}</div>
                  <div className="text-xl font-semibold leading-tight">{s.date.slice(8)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">
                    {fmtTime(s.start_time)} · {s.exam_name}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {s.papers.map((p) => p.short).join(', ') || 'No papers'} · {plural(s.student_count, 'student')}
                  </div>
                </div>
                <Button size="sm" variant="subtle" disabled={!s.papers.length} onClick={() => navigate(`/plans/new?slot=${s.id}`)}>
                  Generate
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!all.length ? (
        <Card>
          <EmptyState
            icon={<Armchair className="size-6" />}
            title="No seating plans yet"
            description="Pick an exam slot and the classrooms to use. ExamFlow seats every student so that no two neighbours write the same paper, and assigns invigilators fairly."
            action={
              <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={() => navigate('/plans/new')}>
                Generate your first plan
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <Tabs
            value={filter}
            onChange={setFilter}
            className="px-4 pt-3"
            items={[
              { value: 'all', label: 'All', count: count('all') },
              { value: 'attention', label: 'Needs attention', count: count('attention') },
              { value: 'draft', label: 'Draft', count: count('draft') },
              { value: 'approved', label: 'Approved', count: count('approved') },
              { value: 'notified', label: 'Notified', count: count('notified') },
            ]}
          />
          <Table>
            <thead>
              <tr>
                <Th>Exam slot</Th>
                <Th>Papers</Th>
                <Th>Students</Th>
                <Th>Rooms</Th>
                <Th>Invigilators</Th>
                <Th>Checks</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={cn('cursor-pointer transition-colors hover:bg-subtle/50', p.slot.date < today && 'opacity-70')} onClick={() => navigate(`/plans/${p.id}`)}>
                  <Td>
                    <div className="font-medium">{fmtDate(p.slot.date, 'day-month')}</div>
                    <div className="text-xs text-muted">
                      {fmtTime(p.slot.start_time)}–{fmtTime(p.slot.end_time)} · {relativeDay(p.slot.date)}
                    </div>
                  </Td>
                  <Td>
                    <div className="max-w-xs truncate text-[13px]">{p.slot.exam_name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.slot.papers.map((x) => (
                        <span key={x.id} className="inline-flex items-center gap-1 text-xs text-muted">
                          <span className={cn('size-1.5 rounded-full', paperColor(x.color).dot)} />
                          {x.short}
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td className="tabular">
                    <span className="font-medium">{p.stats.seated}</span>
                    <span className="text-muted">/{p.stats.expected}</span>
                  </Td>
                  <Td className="tabular">{p.stats.rooms_used}</Td>
                  <Td className="tabular">
                    <span className={cn(p.stats.invigilators < p.stats.invigilators_required && 'font-medium text-rose-600')}>{p.stats.invigilators}</span>
                    <span className="text-muted">/{p.stats.invigilators_required}</span>
                  </Td>
                  <Td>
                    {p.stats.errors ? (
                      <Badge tone="red" icon={<AlertTriangle className="size-3" />}>
                        {plural(p.stats.errors, 'conflict')}
                      </Badge>
                    ) : p.stats.warnings ? (
                      <Badge tone="amber">{plural(p.stats.warnings, 'warning')}</Badge>
                    ) : (
                      <Badge tone="green" icon={<CheckCircle2 className="size-3" />}>
                        All clear
                      </Badge>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1.5">
                      <PlanStatusBadge status={p.status} />
                      <MiniProgress status={p.status} />
                    </div>
                  </Td>
                  <Td>
                    <Link to={`/plans/${p.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[13px] font-medium font-semibold text-ink underline decoration-mark decoration-2 underline-offset-2 hover:decoration-ink">
                      Open <ArrowRight className="size-3.5" />
                    </Link>
                  </Td>
                </tr>
              ))}
              {!list.length && (
                <tr>
                  <Td colSpan={8} className="py-12 text-center text-muted">
                    Nothing here.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
