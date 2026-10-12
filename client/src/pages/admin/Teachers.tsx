import { CalendarOff, KeyRound, Mail, MoreHorizontal, Pencil, Phone, Plus, Trash2, Upload, UserCheck, UserX, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { http, useAction, useApi } from '@/lib/api';
import type { Slot, Teacher, TeacherDuty, Unavailability } from '@/lib/types';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  PageLoader,
  SearchInput,
  Segmented,
  Select,
  Switch,
  Table,
  Td,
  Th,
  cn,
} from '@/components/ui';
import { Drawer, Menu, MenuDivider, MenuItem, Modal, useConfirm, useToast } from '@/components/overlays';
import { ImportWizard } from '@/components/ImportWizard';
import { PlanStatusBadge } from '@/components/status';
import { fmtDate, fmtTime, plural, timeAgo, todayISO } from '@/lib/format';

interface TeacherForm {
  id?: number;
  emp_code: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  phone: string;
  max_duties: string;
  is_active: boolean;
}

function TeacherEditor({ open, onClose, teacher, departments }: { open: boolean; onClose: () => void; teacher: Teacher | null; departments: string[] }) {
  const toast = useToast();
  const empty: TeacherForm = { emp_code: '', name: '', email: '', department: '', designation: '', phone: '', max_duties: '', is_active: true };
  const [f, setF] = useState<TeacherForm>(empty);
  useEffect(() => {
    if (open)
      setF(
        teacher
          ? {
              id: teacher.id,
              emp_code: teacher.emp_code,
              name: teacher.name,
              email: teacher.email || '',
              department: teacher.department || '',
              designation: teacher.designation || '',
              phone: teacher.phone || '',
              max_duties: teacher.max_duties != null ? String(teacher.max_duties) : '',
              is_active: !!teacher.is_active,
            }
          : empty,
      );
  }, [open, teacher]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction((b: TeacherForm) => (b.id ? http.put(`/teachers/${b.id}`, b) : http.post('/teachers', b)));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={teacher ? 'Edit teacher' : 'Add a teacher'}
      description={teacher ? undefined : 'They can sign in with this email using their Employee ID as the first-time password.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!f.name || !f.emp_code}
            onClick={() =>
              save.mutate(f, {
                onSuccess: () => {
                  toast.success(teacher ? 'Teacher updated' : 'Teacher added', f.name);
                  onClose();
                },
                onError: (e) => toast.error('Could not save teacher', e.message),
              })
            }
          >
            {teacher ? 'Save changes' : 'Add teacher'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Dr. Meera Nair" />
        </Field>
        <Field label="Employee ID" required>
          <Input value={f.emp_code} onChange={(e) => setF({ ...f, emp_code: e.target.value.toUpperCase() })} placeholder="EMP1042" />
        </Field>
        <Field label="Email" hint="Duty notifications are sent here.">
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="meera.nair@college.edu" />
        </Field>
        <Field label="Department">
          <Input list="t-departments" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} />
          <datalist id="t-departments">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Field>
        <Field label="Designation">
          <Input list="t-designations" value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} />
          <datalist id="t-designations">
            {['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Lab Instructor'].map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Field>
        <Field label="Phone">
          <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Maximum duties" hint="Leave empty for no limit.">
          <Input type="number" min={0} value={f.max_duties} onChange={(e) => setF({ ...f, max_duties: e.target.value })} />
        </Field>
        <div className="rounded-xl border border-line p-4 sm:col-span-2">
          <Switch checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Available for invigilation" description="Inactive teachers are never assigned new duties." />
        </div>
      </div>
    </Modal>
  );
}

function TeacherDrawer({ id, onClose, onEdit }: { id: number | null; onClose: () => void; onEdit: (t: Teacher) => void }) {
  const toast = useToast();
  const detail = useApi<Teacher & { duties: TeacherDuty[]; unavailability: Unavailability[] }>(id ? `/teachers/${id}` : null);
  const slots = useApi<Slot[]>('/slots');
  const [date, setDate] = useState(todayISO());
  const [slotId, setSlotId] = useState('');
  const [reason, setReason] = useState('');
  const add = useAction(() => http.post(`/teachers/${id}/unavailability`, { date, slot_id: slotId || null, reason }));
  const remove = useAction((uid: number) => http.del(`/teachers/${id}/unavailability/${uid}`));
  const t = detail.data;
  const slotsOnDate = (slots.data || []).filter((s) => s.date === date);
  const today = todayISO();

  return (
    <Drawer
      open={id != null}
      onClose={onClose}
      width="lg"
      title={t?.name || 'Teacher'}
      description={t ? [t.designation, t.department].filter(Boolean).join(' · ') : undefined}
      footer={
        t && (
          <Button icon={<Pencil className="size-4" />} onClick={() => onEdit(t)}>
            Edit details
          </Button>
        )
      }
    >
      {!t ? (
        <PageLoader />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar name={t.name} size="lg" />
            <div className="min-w-0 space-y-1 text-[13px]">
              <div className="flex items-center gap-2">
                <Badge>{t.emp_code}</Badge>
                {!t.is_active && <Badge tone="red">Inactive</Badge>}
              </div>
              {t.email && (
                <a href={`mailto:${t.email}`} className="flex items-center gap-1.5 text-muted hover:text-ink">
                  <Mail className="size-3.5" /> {t.email}
                </a>
              )}
              {t.phone && (
                <div className="flex items-center gap-1.5 text-muted">
                  <Phone className="size-3.5" /> {t.phone}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total duties', value: t.duties.length },
              { label: 'Upcoming', value: t.duties.filter((d) => d.date >= today).length },
              { label: 'Duty limit', value: t.max_duties ?? '—' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-line p-3">
                <div className="text-xs text-muted">{s.label}</div>
                <div className="mt-0.5 text-xl font-semibold tabular">{s.value}</div>
              </div>
            ))}
          </div>

          <section>
            <h3 className="mb-2 text-[14px] font-semibold">Invigilation duties</h3>
            {!t.duties.length ? (
              <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">No duties assigned yet.</div>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {t.duties.map((d) => (
                  <li key={d.id}>
                    <Link to={`/plans/${d.plan_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle/60">
                      <div className="w-14 shrink-0 text-center">
                        <div className="text-[11px] font-medium uppercase text-muted">{fmtDate(d.date, 'weekday').slice(0, 3)}</div>
                        <div className="text-lg font-semibold leading-tight">{d.date.slice(8)}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium">{d.role === 'reserve' ? 'Reserve pool' : d.room_name}</div>
                        <div className="truncate text-xs text-muted">
                          {d.exam_name} · {fmtTime(d.start_time)}–{fmtTime(d.end_time)}
                        </div>
                      </div>
                      <PlanStatusBadge status={d.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-[14px] font-semibold">Unavailability</h3>
            <p className="mb-3 text-[13px] text-muted">The seating generator never assigns duties on these dates or slots.</p>
            {!!t.unavailability.length && (
              <ul className="mb-3 space-y-2">
                {t.unavailability.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-[13px]">
                    <CalendarOff className="size-4 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {fmtDate(u.date)} · {u.slot_id ? `${u.session || ''} ${fmtTime(u.start_time)}`.trim() : 'Whole day'}
                      </div>
                      {u.reason && <div className="truncate text-xs text-muted">{u.reason}</div>}
                    </div>
                    <button
                      className="rounded p-1 text-muted hover:text-rose-600"
                      aria-label="Remove"
                      onClick={() => remove.mutate(u.id, { onSuccess: () => toast.success('Unavailability removed') })}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-3 rounded-xl border border-line bg-subtle/40 p-3 sm:grid-cols-[150px_1fr]">
              <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSlotId(''); }} />
              <Select value={slotId} onChange={(e) => setSlotId(e.target.value)}>
                <option value="">Whole day</option>
                {slotsOnDate.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.session || 'Slot'} · {fmtTime(s.start_time)} ({s.exam_name})
                  </option>
                ))}
              </Select>
              <Input className="sm:col-span-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional) — e.g. On leave" />
              <div className="sm:col-span-2">
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Plus className="size-4" />}
                  loading={add.isPending}
                  disabled={!date}
                  onClick={() =>
                    add.mutate(undefined, {
                      onSuccess: () => {
                        toast.success('Unavailability recorded');
                        setReason('');
                      },
                      onError: (e) => toast.error('Could not save', e.message),
                    })
                  }
                >
                  Mark unavailable
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </Drawer>
  );
}

export const TEACHER_FIELDS = [
  { key: 'name', label: 'Teacher name', required: true, aliases: ['name', 'full name', 'faculty name', 'staff name', 'teacher'], example: 'Dr. Meera Nair' },
  { key: 'emp_code', label: 'Employee ID', required: true, aliases: ['emp id', 'employee id', 'emp code', 'employee code', 'staff id', 'faculty id', 'id'], example: 'EMP1042' },
  { key: 'email', label: 'Email', aliases: ['email', 'email id', 'e-mail', 'mail'], example: 'meera.nair@college.edu' },
  { key: 'department', label: 'Department', aliases: ['dept', 'department', 'school'], example: 'Computer Science' },
  { key: 'designation', label: 'Designation', aliases: ['designation', 'title', 'position', 'post'], example: 'Assistant Professor' },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'mobile', 'contact', 'phone number', 'mobile no'], example: '9876543210' },
  { key: 'max_duties', label: 'Max duties', aliases: ['max duties', 'duty limit', 'limit'], example: '4' },
];

export default function Teachers() {
  const { data, isLoading, error, refetch } = useApi<Teacher[]>('/teachers');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [edit, setEdit] = useState<Teacher | null | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const del = useAction((id: number) => http.del(`/teachers/${id}`));
  const reset = useAction((id: number) => http.post<{ message: string }>(`/teachers/${id}/reset-password`));
  const setActive = useAction((t: Teacher) => http.put(`/teachers/${t.id}`, { ...t, is_active: !t.is_active }));

  useEffect(() => {
    if (params.get('import')) {
      setImporting(true);
      params.delete('import');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const departments = useMemo(() => [...new Set((data || []).map((t) => t.department).filter(Boolean) as string[])].sort(), [data]);
  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const list = data!.filter(
    (t) =>
      (status === 'all' || (status === 'active' ? t.is_active : !t.is_active)) &&
      (!dept || t.department === dept) &&
      `${t.name} ${t.email} ${t.emp_code} ${t.department}`.toLowerCase().includes(q.toLowerCase()),
  );
  const active = data!.filter((t) => t.is_active);
  const maxDuties = Math.max(1, ...data!.map((t) => t.duty_count));
  const avg = active.length ? active.reduce((n, t) => n + t.duty_count, 0) / active.length : 0;
  const noEmail = active.filter((t) => !t.email).length;

  return (
    <div>
      <PageHeader
        title="Teachers"
        description={`${plural(active.length, 'active teacher')} · average ${avg.toFixed(1)} duties each`}
        actions={
          <>
            <Button icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>
              Import Excel
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit(null)}>
              Add teacher
            </Button>
          </>
        }
      />

      {!data!.length ? (
        <Card>
          <EmptyState
            icon={<Users className="size-6" />}
            title="Add your teaching staff"
            description="Import the staff list from Excel. Duties are shared fairly among active teachers, respecting their availability."
            action={
              <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>
                Import from Excel
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {noEmail > 0 && (
            <Callout tone="warning" className="mb-4" title={`${plural(noEmail, 'teacher')} without an email address`}>
              They can’t sign in or receive duty notifications. Add their email addresses below.
            </Callout>
          )}
          <Card>
            <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
              <SearchInput value={q} onChange={setQ} placeholder="Search name, email or ID…" className="lg:w-80" />
              <Select value={dept} onChange={(e) => setDept(e.target.value)} className="lg:w-56">
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </Select>
              <Segmented
                className="lg:ml-auto"
                value={status}
                onChange={setStatus}
                items={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'all', label: 'All' },
                ]}
              />
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Teacher</Th>
                  <Th>Employee ID</Th>
                  <Th>Department</Th>
                  <Th>Duties</Th>
                  <Th>Availability</Th>
                  <Th>Portal</Th>
                  <Th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id} className={cn('cursor-pointer transition-colors hover:bg-subtle/50', !t.is_active && 'opacity-60')} onClick={() => setOpen(t.id)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={t.name} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{t.name}</div>
                          <div className="truncate text-xs text-muted">{t.email || <span className="text-amber-600">No email</span>}</div>
                        </div>
                      </div>
                    </Td>
                    <Td className="font-mono text-[13px] text-muted">{t.emp_code}</Td>
                    <Td>
                      <div className="text-[13px]">{t.department || '—'}</div>
                      <div className="text-xs text-muted">{t.designation}</div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 text-right font-semibold tabular">{t.duty_count}</span>
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-subtle">
                          <div className={cn('h-full rounded-full', t.duty_count > avg + 1 ? 'bg-amber-500' : 'bg-ink')} style={{ width: `${(t.duty_count / maxDuties) * 100}%` }} />
                        </div>
                        {t.upcoming_duties > 0 && <span className="text-xs text-muted">{t.upcoming_duties} upcoming</span>}
                      </div>
                    </Td>
                    <Td>
                      {t.unavailable_count ? (
                        <Badge tone="amber" icon={<CalendarOff className="size-3" />}>
                          {plural(t.unavailable_count, 'date')} off
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted">Available</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-muted">{t.has_account ? (t.last_login_at ? `Signed in ${timeAgo(t.last_login_at)}` : 'Account ready') : 'Not signed in yet'}</Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <Menu
                        trigger={({ onClick }) => (
                          <button onClick={onClick} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-fg" aria-label="Teacher actions">
                            <MoreHorizontal className="size-4" />
                          </button>
                        )}
                      >
                        <MenuItem icon={<Pencil className="size-4" />} onClick={() => setEdit(t)}>
                          Edit details
                        </MenuItem>
                        <MenuItem icon={<CalendarOff className="size-4" />} onClick={() => setOpen(t.id)}>
                          Duties & availability
                        </MenuItem>
                        <MenuItem
                          icon={<KeyRound className="size-4" />}
                          description="Back to their Employee ID"
                          onClick={async () => {
                            if (!(await confirm({ title: `Reset password for ${t.name}?`, message: `They will sign in with their Employee ID (${t.emp_code}) and be asked to choose a new password.`, confirmLabel: 'Reset password' }))) return;
                            reset.mutate(t.id, { onSuccess: (r) => toast.success('Password reset', r.message) });
                          }}
                        >
                          Reset password
                        </MenuItem>
                        <MenuItem icon={t.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />} onClick={() => setActive.mutate(t, { onSuccess: () => toast.success(t.is_active ? 'Marked inactive' : 'Marked active') })}>
                          {t.is_active ? 'Mark inactive' : 'Mark active'}
                        </MenuItem>
                        <MenuDivider />
                        <MenuItem
                          icon={<Trash2 className="size-4" />}
                          danger
                          onClick={async () => {
                            if (!(await confirm({ title: `Remove ${t.name}?`, message: 'Their draft duties are removed too. Teachers with approved duties should be marked inactive instead.', confirmLabel: 'Remove teacher', tone: 'danger' }))) return;
                            del.mutate(t.id, { onSuccess: () => toast.success('Teacher removed'), onError: (e) => toast.error('Cannot remove teacher', e.message) });
                          }}
                        >
                          Remove
                        </MenuItem>
                      </Menu>
                    </Td>
                  </tr>
                ))}
                {!list.length && (
                  <tr>
                    <Td colSpan={7} className="py-12 text-center text-muted">
                      No teachers match your filters.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      <TeacherEditor open={edit !== undefined} onClose={() => setEdit(undefined)} teacher={edit ?? null} departments={departments} />
      <TeacherDrawer id={open} onClose={() => setOpen(null)} onEdit={(t) => setEdit(t)} />
      <ImportWizard
        open={importing}
        onClose={() => setImporting(false)}
        title="Import teachers"
        entity="Teachers"
        fields={TEACHER_FIELDS}
        uniqueKey="emp_code"
        endpoint="/teachers/import"
        templateName="teacher-template.xlsx"
        templateRows={[
          ['Dr. Meera Nair', 'EMP1042', 'meera.nair@college.edu', 'Computer Science', 'Associate Professor', '9876543210', ''],
          ['Prof. Arjun Rao', 'EMP1043', 'arjun.rao@college.edu', 'Commerce', 'Assistant Professor', '', '4'],
        ]}
        notes={
          <Callout tone="info" title="How teachers sign in">
            Each teacher signs in with their email address. Their first-time password is their Employee ID; they’ll choose a new one straight away.
          </Callout>
        }
      />
    </div>
  );
}
