import { BarChart3, ClipboardList, Download, FileSpreadsheet, FileText, LayoutGrid, Printer, Table2, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { http, useApi } from '@/lib/api';
import type { PlanDetail, PlanSummary, Settings, Slot } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, PageLoader, Select, Table, Tabs, Td, Th, cn } from '@/components/ui';
import { useToast } from '@/components/overlays';
import { PlanStatusBadge } from '@/components/status';
import { attendanceSheetsPdf, dutyListPdf, noticeBoardPdf, planExcel, rosterPdf, seatingChartsPdf, type Letterhead } from '@/lib/pdf';
import { downloadWorkbook } from '@/lib/excel';
import { fmtDate, fmtTime, plural } from '@/lib/format';

interface Roster {
  slots: { id: number; plan_id: number; date: string; start_time: string; end_time: string; exam_name: string; status: string }[];
  teachers: { id: number; name: string; emp_code: string; department: string | null; designation: string | null; email: string | null; phone: string | null; is_active: number }[];
  duties: { teacher_id: number; plan_id: number; role: string; room_name: string | null }[];
}

function OutputCard({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-ink bg-mark text-ink">{icon}</div>
      <div className="font-semibold">{title}</div>
      <p className="mt-1 flex-1 text-[13px] text-muted">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">{children}</div>
    </Card>
  );
}

export default function Reports() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'plans' | 'roster' | 'workload'>((params.get('tab') as 'roster' | 'workload') || 'plans');
  const plans = useApi<(PlanSummary & { slot: Slot })[]>('/plans');
  const settings = useApi<Settings>('/settings');
  const roster = useApi<Roster>(tab !== 'plans' ? '/roster' : null);
  const [planId, setPlanId] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!planId && plans.data?.length) {
      const today = new Date().toISOString().slice(0, 10);
      setPlanId((plans.data.find((p) => p.slot.date >= today) || plans.data[plans.data.length - 1]).id);
    }
  }, [plans.data, planId]);

  const lh: Letterhead = {
    institution_name: settings.data?.institution_name || '',
    institution_address: settings.data?.institution_address,
    exam_cell_name: settings.data?.exam_cell_name || '',
    controller_name: settings.data?.controller_name,
  };
  const selected = plans.data?.find((p) => p.id === planId);

  const run = async (label: string, fn: (d: PlanDetail) => Promise<void>) => {
    if (!planId) return;
    setBusy(label);
    try {
      const d = await http.get<PlanDetail>(`/plans/${planId}`);
      await fn(d);
    } catch (e) {
      toast.error('Could not create the file', e instanceof Error ? e.message : '');
    } finally {
      setBusy(null);
    }
  };

  const workload = useMemo(() => {
    if (!roster.data) return [];
    return roster.data.teachers
      .filter((t) => t.is_active)
      .map((t) => ({ ...t, duties: roster.data!.duties.filter((d) => d.teacher_id === t.id).length }))
      .sort((a, b) => b.duties - a.duties || a.name.localeCompare(b.name));
  }, [roster.data]);
  const departments = useMemo(() => {
    const m = new Map<string, { teachers: number; duties: number }>();
    for (const t of workload) {
      const k = t.department || 'Unassigned';
      const e = m.get(k) || { teachers: 0, duties: 0 };
      e.teachers++;
      e.duties += t.duties;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[1].duties - a[1].duties);
  }, [workload]);

  if (plans.isLoading) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Reports & print" description="Printable seating charts, attendance sheets, notices and duty lists." />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-6"
        items={[
          { value: 'plans', label: 'Exam documents', icon: <Printer className="size-4" /> },
          { value: 'roster', label: 'Duty roster', icon: <Table2 className="size-4" /> },
          { value: 'workload', label: 'Workload', icon: <BarChart3 className="size-4" /> },
        ]}
      />

      {tab === 'plans' &&
        (!plans.data?.length ? (
          <Card>
            <EmptyState icon={<Printer className="size-6" />} title="No seating plans yet" description="Generate a seating plan to print charts and lists." />
          </Card>
        ) : (
          <>
            <Card className="mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="text-[13px] font-medium text-muted">Exam slot</div>
              <Select value={planId ?? ''} onChange={(e) => setPlanId(Number(e.target.value))} className="sm:max-w-md">
                {plans.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {fmtDate(p.slot.date, 'day-month')} · {fmtTime(p.slot.start_time)} — {p.slot.exam_name} ({p.stats.seated} students)
                  </option>
                ))}
              </Select>
              {selected && (
                <div className="flex items-center gap-2 sm:ml-auto">
                  <PlanStatusBadge status={selected.status} />
                  {selected.status === 'draft' && <span className="text-xs text-muted">Draft — may still change</span>}
                </div>
              )}
            </Card>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <OutputCard icon={<LayoutGrid className="size-5" />} title="Seating charts" description="A colour-coded map of every room showing seat numbers and roll numbers, with invigilator signature lines. Stick one on each door.">
                <Button variant="primary" size="sm" icon={<Download className="size-4" />} loading={busy === 'charts'} onClick={() => run('charts', (d) => seatingChartsPdf(d, lh))}>
                  Download PDF
                </Button>
              </OutputCard>
              <OutputCard icon={<ClipboardList className="size-5" />} title="Attendance sheets" description="Room-wise student list in seat order with answer-booklet number and signature columns.">
                <Button variant="primary" size="sm" icon={<Download className="size-4" />} loading={busy === 'att'} onClick={() => run('att', (d) => attendanceSheetsPdf(d, lh))}>
                  Download PDF
                </Button>
              </OutputCard>
              <OutputCard icon={<FileText className="size-5" />} title="Notice-board summary" description="Which roll-number ranges sit in which room, on one page for the notice board.">
                <Button variant="primary" size="sm" icon={<Download className="size-4" />} loading={busy === 'notice'} onClick={() => run('notice', (d) => noticeBoardPdf(d, lh))}>
                  Download PDF
                </Button>
              </OutputCard>
              <OutputCard icon={<Users className="size-5" />} title="Invigilator duty list" description="Who invigilates which room, with phone numbers and a signature column for the exam cell.">
                <Button variant="primary" size="sm" icon={<Download className="size-4" />} loading={busy === 'duty'} onClick={() => run('duty', (d) => dutyListPdf(d, lh))}>
                  Download PDF
                </Button>
              </OutputCard>
              <OutputCard icon={<FileSpreadsheet className="size-5" />} title="Excel workbook" description="Every seat assignment and invigilator in a spreadsheet for your own records.">
                <Button size="sm" icon={<Download className="size-4" />} loading={busy === 'xlsx'} onClick={() => run('xlsx', (d) => planExcel(d))}>
                  Download Excel
                </Button>
              </OutputCard>
            </div>
          </>
        ))}

      {tab === 'roster' &&
        (!roster.data ? (
          <PageLoader />
        ) : !roster.data.slots.length ? (
          <Card>
            <EmptyState icon={<Table2 className="size-6" />} title="No duties yet" description="Duties appear here once seating plans are generated." />
          </Card>
        ) : (
          <Card>
            <CardHeader
              title="Duty roster"
              description={`${plural(roster.data.slots.length, 'exam slot')} · ${plural(roster.data.duties.length, 'duty', 'duties')}`}
              action={
                <>
                  <Button
                    size="sm"
                    icon={<FileSpreadsheet className="size-4" />}
                    onClick={() => {
                      const r = roster.data!;
                      const key = new Map(r.duties.map((d) => [`${d.teacher_id}:${d.plan_id}`, d]));
                      downloadWorkbook('duty-roster.xlsx', [
                        {
                          name: 'Roster',
                          rows: [
                            ['Teacher', 'Employee ID', 'Department', ...r.slots.map((s) => `${s.date} ${s.start_time}`), 'Total'],
                            ...r.teachers.map((t) => {
                              const cells = r.slots.map((s) => {
                                const d = key.get(`${t.id}:${s.plan_id}`);
                                return d ? (d.role === 'reserve' ? 'Reserve' : d.room_name) : '';
                              });
                              return [t.name, t.emp_code, t.department, ...cells, cells.filter(Boolean).length];
                            }),
                          ],
                        },
                      ]);
                    }}
                  >
                    Excel
                  </Button>
                  <Button size="sm" variant="primary" icon={<Download className="size-4" />} onClick={() => rosterPdf(roster.data!, lh)}>
                    PDF
                  </Button>
                </>
              }
            />
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 border-b border-line bg-card px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted">Teacher</th>
                    {roster.data.slots.map((s) => (
                      <th key={s.plan_id} className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-xs font-medium text-muted">
                        <div>{fmtDate(s.date, 'short')}</div>
                        <div className="font-normal">{fmtTime(s.start_time)}</div>
                      </th>
                    ))}
                    <th className="border-b border-line px-3 py-2.5 text-center text-xs font-medium uppercase text-muted">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.data.teachers
                    .filter((t) => t.is_active || roster.data!.duties.some((d) => d.teacher_id === t.id))
                    .map((t) => {
                      const mine = roster.data!.duties.filter((d) => d.teacher_id === t.id);
                      return (
                        <tr key={t.id} className="hover:bg-subtle/50">
                          <td className="sticky left-0 z-10 whitespace-nowrap border-b border-line bg-card px-4 py-2">
                            <div className="font-medium">{t.name}</div>
                            <div className="text-xs text-muted">{t.department}</div>
                          </td>
                          {roster.data!.slots.map((s) => {
                            const d = mine.find((x) => x.plan_id === s.plan_id);
                            return (
                              <td key={s.plan_id} className="border-b border-line px-2 py-2 text-center">
                                {d && (
                                  <span className={cn('inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium', d.role === 'reserve' ? 'bg-subtle text-muted' : 'bg-mark text-ink')}>
                                    {d.role === 'reserve' ? 'Reserve' : d.room_name}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="border-b border-line px-3 py-2 text-center font-semibold tabular">{mine.length}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}

      {tab === 'workload' &&
        (!roster.data ? (
          <PageLoader />
        ) : (
          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Duties per teacher"
                description="Active teachers, most duties first"
                action={
                  <Button
                    size="sm"
                    icon={<FileSpreadsheet className="size-4" />}
                    onClick={() =>
                      downloadWorkbook('workload.xlsx', [
                        { name: 'Workload', rows: [['Teacher', 'Employee ID', 'Department', 'Designation', 'Duties'], ...workload.map((t) => [t.name, t.emp_code, t.department, t.designation, t.duties])] },
                      ])
                    }
                  >
                    Export
                  </Button>
                }
              />
              <Table>
                <thead>
                  <tr>
                    <Th>Teacher</Th>
                    <Th>Department</Th>
                    <Th className="w-1/3">Duties</Th>
                  </tr>
                </thead>
                <tbody>
                  {workload.map((t) => {
                    const max = Math.max(1, workload[0]?.duties || 1);
                    return (
                      <tr key={t.id}>
                        <Td className="font-medium">{t.name}</Td>
                        <Td className="text-muted">{t.department || '—'}</Td>
                        <Td>
                          <div className="flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
                              <div className="h-full rounded-full bg-ink" style={{ width: `${(t.duties / max) * 100}%` }} />
                            </div>
                            <span className="w-6 text-right font-semibold tabular">{t.duties}</span>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
            <Card className="h-fit">
              <CardHeader title="By department" />
              <ul className="divide-y divide-line">
                {departments.map(([name, v]) => (
                  <li key={name} className="flex items-center justify-between px-5 py-3 text-[13px]">
                    <div>
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-muted">{plural(v.teachers, 'teacher')}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular">{v.duties}</div>
                      <Badge>{(v.duties / v.teachers).toFixed(1)} avg</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ))}
    </div>
  );
}
