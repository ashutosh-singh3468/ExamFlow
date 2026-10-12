import { Building, Database, Download, Mail, Plus, Save, Scale, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { http, useAction, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Settings } from '@/lib/types';
import { Avatar, Badge, Button, Callout, Card, Field, Input, PageHeader, PageLoader, Select, Switch, Tabs } from '@/components/ui';
import { useConfirm, useToast } from '@/components/overlays';
import { ADJACENCY_MODES } from '@/lib/layout';
import { addMinutes, fmtTime, timeAgo } from '@/lib/format';

type Tab = 'institution' | 'rules' | 'email' | 'admins' | 'data';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 border-b border-line px-5 py-6 last:border-0 lg:grid-cols-[260px_1fr] lg:gap-10">
      <div>
        <div className="text-[14px] font-semibold">{title}</div>
        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      </div>
      <div className="max-w-2xl space-y-4">{children}</div>
    </div>
  );
}

function Admins() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data } = useApi<{ id: number; name: string; email: string; last_login_at: string | null }[]>('/users');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const add = useAction(() => http.post('/users', f));
  const del = useAction((id: number) => http.del(`/users/${id}`));
  return (
    <Card>
      <Section title="Administrators" description="Exam cell staff who can manage schedules, seating and settings. Teachers sign in separately with their own accounts.">
        <ul className="divide-y divide-line rounded-xl border border-line">
          {data?.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={u.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">
                  {u.name} {u.id === user?.id && <Badge tone="indigo">You</Badge>}
                </div>
                <div className="truncate text-xs text-muted">
                  {u.email} · last sign-in {timeAgo(u.last_login_at)}
                </div>
              </div>
              {u.id !== user?.id && (
                <button
                  className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Remove administrator"
                  onClick={async () => {
                    if (!(await confirm({ title: `Remove ${u.name}?`, message: 'They will no longer be able to sign in.', confirmLabel: 'Remove', tone: 'danger' }))) return;
                    del.mutate(u.id, { onSuccess: () => toast.success('Administrator removed'), onError: (e) => toast.error('Cannot remove', e.message) });
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Add an administrator" description="They’ll be asked to choose their own password the first time they sign in.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Temporary password" hint="At least 8 characters">
            <Input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="off" />
          </Field>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="size-4" />}
          loading={add.isPending}
          disabled={!f.name || !f.email || f.password.length < 8}
          onClick={() =>
            add.mutate(undefined, {
              onSuccess: () => {
                toast.success('Administrator added', `${f.name} can now sign in.`);
                setF({ name: '', email: '', password: '' });
              },
              onError: (e) => toast.error('Could not add administrator', e.message),
            })
          }
        >
          Add administrator
        </Button>
      </Section>
    </Card>
  );
}

function DataTools() {
  const toast = useToast();
  const confirm = useConfirm();
  const clear = useAction((scope: string) => http.post<{ message: string }>('/data/clear', { scope, confirm: 'DELETE' }));
  const items = [
    { scope: 'plans', title: 'Seating plans', text: 'Delete every seating plan, duty and email. The exam schedule stays.' },
    { scope: 'schedule', title: 'Exam schedule', text: 'Delete all exam slots, plans and availability records.' },
    { scope: 'students', title: 'Students', text: 'Delete every student record (e.g. before importing a new term).' },
    { scope: 'teachers', title: 'Teachers', text: 'Delete every teacher and their sign-in account.' },
    { scope: 'everything', title: 'Everything (start fresh)', text: 'Remove demo or old data: classrooms, courses, students, teachers and exams. Administrators and settings are kept.' },
  ];
  return (
    <Card>
      <Section title="Backup" description="Download a complete copy of the database. Keep backups before each exam season.">
        <a href="/api/backup">
          <Button icon={<Download className="size-4" />}>Download backup (.db)</Button>
        </a>
        <p className="text-xs text-muted">To restore, stop ExamFlow and replace <code className="rounded bg-subtle px-1">data/examflow.db</code> with the backup file.</p>
      </Section>
      <Section title="Clear data" description="These actions cannot be undone. Download a backup first.">
        <ul className="divide-y divide-line rounded-xl border border-rose-200">
          {items.map((i) => (
            <li key={i.scope} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
              <div className="flex-1">
                <div className="text-[14px] font-medium">{i.title}</div>
                <div className="text-xs text-muted">{i.text}</div>
              </div>
              <Button
                size="sm"
                variant={i.scope === 'everything' ? 'danger' : 'secondary'}
                icon={<Trash2 className="size-3.5" />}
                onClick={async () => {
                  if (!(await confirm({ title: `Clear ${i.title.toLowerCase()}?`, message: i.text, confirmLabel: 'Delete permanently', tone: 'danger', typeToConfirm: 'DELETE' }))) return;
                  clear.mutate(i.scope, { onSuccess: (r) => toast.success('Data cleared', r.message), onError: (e) => toast.error('Could not clear data', e.message) });
                }}
              >
                Clear
              </Button>
            </li>
          ))}
        </ul>
      </Section>
    </Card>
  );
}

export default function SettingsPage() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'institution');
  const { data, isLoading } = useApi<Settings>('/settings');
  const [f, setF] = useState<Settings | null>(null);
  const [testTo, setTestTo] = useState('');
  const toast = useToast();
  const { user } = useAuth();
  const save = useAction((body: Partial<Settings>) => http.put<Settings>('/settings', body));
  const test = useAction(() => http.post<{ message: string }>('/settings/test-email', { to: testTo || user?.email }));

  useEffect(() => {
    if (data) setF({ ...data, smtp_pass: '' });
  }, [data]);

  if (isLoading || !f) return <PageLoader />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF({ ...f, [k]: v });
  const dirty = JSON.stringify({ ...f, smtp_pass: '' }) !== JSON.stringify({ ...data, smtp_pass: '' }) || !!f.smtp_pass;

  const submit = () =>
    save.mutate(f, {
      onSuccess: () => toast.success('Settings saved'),
      onError: (e) => toast.error('Could not save settings', e.message),
    });

  const saveBar = dirty && (
    <div className="sticky bottom-4 z-10 mt-4 flex animate-slide-up items-center justify-end gap-3 rounded-xl border border-line bg-card/95 px-4 py-3 shadow-pop backdrop-blur">
      <span className="mr-auto text-[13px] text-muted">You have unsaved changes</span>
      <Button onClick={() => data && setF({ ...data, smtp_pass: '' })} disabled={!dirty}>
        Discard
      </Button>
      <Button variant="primary" icon={<Save className="size-4" />} loading={save.isPending} disabled={!dirty} onClick={submit}>
        Save changes
      </Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" description="Institution details, examination rules, email delivery and data." />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-6"
        items={[
          { value: 'institution', label: 'Institution', icon: <Building className="size-4" /> },
          { value: 'rules', label: 'Exam rules', icon: <Scale className="size-4" /> },
          { value: 'email', label: 'Email', icon: <Mail className="size-4" /> },
          { value: 'admins', label: 'Administrators', icon: <ShieldCheck className="size-4" /> },
          { value: 'data', label: 'Data & backup', icon: <Database className="size-4" /> },
        ]}
      />

      {tab === 'institution' && (
        <>
          <Card>
            <Section title="Institution" description="Printed on every seating chart, attendance sheet and email.">
              <Field label="Institution name">
                <Input value={f.institution_name} onChange={(e) => set('institution_name', e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <Field label="Short name">
                  <Input value={f.institution_short} onChange={(e) => set('institution_short', e.target.value)} />
                </Field>
                <Field label="Address">
                  <Input value={f.institution_address} onChange={(e) => set('institution_address', e.target.value)} />
                </Field>
              </div>
            </Section>
            <Section title="Examination cell" description="Used for signatures and as the sender name of duty emails.">
              <Field label="Office name">
                <Input value={f.exam_cell_name} onChange={(e) => set('exam_cell_name', e.target.value)} />
              </Field>
              <Field label="Controller / signing authority">
                <Input value={f.controller_name} onChange={(e) => set('controller_name', e.target.value)} />
              </Field>
              <Field label="ExamFlow web address" hint="Teachers get a “View my duties” button linking here, e.g. http://192.168.1.10:4000">
                <Input value={f.app_url} onChange={(e) => set('app_url', e.target.value)} placeholder="http://" />
              </Field>
            </Section>
          </Card>
          {saveBar}
        </>
      )}

      {tab === 'rules' && (
        <>
          <Card>
            <Section title="Exam sessions" description="Quick picks when adding exam slots.">
              {f.sessions.map((s, i) => (
                <div key={i} className="flex items-end gap-3">
                  <Field label={i === 0 ? 'Session name' : undefined} className="flex-1">
                    <Input value={s.name} onChange={(e) => set('sessions', f.sessions.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  </Field>
                  <Field label={i === 0 ? 'Starts at' : undefined}>
                    <Input type="time" value={s.start} onChange={(e) => set('sessions', f.sessions.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                  </Field>
                  <button className="mb-1.5 rounded-lg p-1.5 text-muted hover:text-rose-600" onClick={() => set('sessions', f.sessions.filter((_, j) => j !== i))} aria-label="Remove session">
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set('sessions', [...f.sessions, { name: 'Evening', start: '17:00' }])}>
                Add session
              </Button>
              <Field label="Default exam duration (minutes)" hint={`${f.default_duration_min} min = ${(f.default_duration_min / 60).toFixed(1)} hours`}>
                <Input type="number" min={15} step={15} value={f.default_duration_min} onChange={(e) => set('default_duration_min', Number(e.target.value))} className="w-32" />
              </Field>
            </Section>
            <Section title="Seating" description="Defaults for new seating plans. Each plan can override them.">
              <Field label="Neighbours that must write a different paper">
                <Select value={f.adjacency_mode} onChange={(e) => set('adjacency_mode', e.target.value as Settings['adjacency_mode'])}>
                  {ADJACENCY_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label} — {m.hint}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Room usage">
                <Select value={f.room_usage} onChange={(e) => set('room_usage', e.target.value as Settings['room_usage'])}>
                  <option value="minimum">Use the fewest rooms needed</option>
                  <option value="all">Spread across all selected rooms</option>
                </Select>
              </Field>
            </Section>
            <Section title="Invigilation" description="How many invigilators each room gets and how duties are shared.">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Students per invigilator">
                  <Input type="number" min={1} value={f.students_per_invigilator} onChange={(e) => set('students_per_invigilator', Number(e.target.value))} />
                </Field>
                <Field label="Minimum per room">
                  <Input type="number" min={1} value={f.min_invigilators_per_room} onChange={(e) => set('min_invigilators_per_room', Number(e.target.value))} />
                </Field>
                <Field label="Reserve per slot">
                  <Input type="number" min={0} value={f.reserve_invigilators} onChange={(e) => set('reserve_invigilators', Number(e.target.value))} />
                </Field>
                <Field label="Max duties per day" hint="1 = no continuous duty">
                  <Input type="number" min={1} value={f.max_duties_per_day} onChange={(e) => set('max_duties_per_day', Number(e.target.value))} />
                </Field>
                <Field label="Rest between duties (min)" hint="Minimum gap on the same day">
                  <Input type="number" min={0} step={15} value={f.min_gap_minutes} onChange={(e) => set('min_gap_minutes', Number(e.target.value))} />
                </Field>
                <Field label="Report before exam (min)" hint={`Shown in emails & letters`}>
                  <Input type="number" min={0} step={5} value={f.report_before_min} onChange={(e) => set('report_before_min', Number(e.target.value))} />
                </Field>
              </div>
              <div className="rounded-xl border border-line p-4">
                <Switch
                  checked={f.avoid_same_department}
                  onChange={(v) => set('avoid_same_department', v)}
                  label="Avoid own-department invigilation"
                  description="Prefer teachers who don’t teach the students in the room."
                />
              </div>
              <p className="text-xs text-muted">
                Example: for a 9:30 AM exam, invigilators are asked to report by {fmtTime(addMinutes('09:30', -f.report_before_min))}.
              </p>
            </Section>
          </Card>
          {saveBar}
        </>
      )}

      {tab === 'email' && (
        <>
          <Card>
            <Section title="Delivery status" description="Without SMTP details, emails are only saved to the outbox for preview.">
              {data?.smtp_configured ? (
                <Callout tone="success" title="Email delivery is configured">
                  Duty notifications will be sent through {data.smtp_host}.
                </Callout>
              ) : (
                <Callout tone="warning" title="Preview mode">
                  Add an SMTP server below to deliver emails. With Gmail, turn on 2-step verification and create an <b>App password</b>; use host <code>smtp.gmail.com</code>, port 465 with SSL.
                </Callout>
              )}
            </Section>
            <Section title="SMTP server" description="Ask your college IT team for these details, or use a Gmail / Outlook account.">
              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <Field label="Host">
                  <Input value={f.smtp_host} onChange={(e) => set('smtp_host', e.target.value)} placeholder="smtp.gmail.com" />
                </Field>
                <Field label="Port">
                  <Input type="number" value={f.smtp_port} onChange={(e) => set('smtp_port', Number(e.target.value))} />
                </Field>
              </div>
              <div className="rounded-xl border border-line p-4">
                <Switch checked={f.smtp_secure} onChange={(v) => set('smtp_secure', v)} label="Use SSL/TLS" description="Usually on for port 465, off for port 587 (STARTTLS)." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Username">
                  <Input value={f.smtp_user} onChange={(e) => set('smtp_user', e.target.value)} autoComplete="off" />
                </Field>
                <Field label="Password" hint={data?.has_smtp_pass ? 'A password is saved. Leave empty to keep it.' : undefined}>
                  <Input type="password" value={f.smtp_pass} onChange={(e) => set('smtp_pass', e.target.value)} autoComplete="new-password" placeholder={data?.has_smtp_pass ? '••••••••' : ''} />
                </Field>
              </div>
              <Field label="From address" hint="Shown as the sender, e.g. examcell@yourcollege.edu">
                <Input value={f.smtp_from} onChange={(e) => set('smtp_from', e.target.value)} />
              </Field>
            </Section>
            <Section title="Send a test email" description="Save your settings first, then check delivery.">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={user?.email} />
                <Button
                  icon={<Send className="size-4" />}
                  loading={test.isPending}
                  disabled={!data?.smtp_configured}
                  onClick={() => test.mutate(undefined, { onSuccess: (r) => toast.success('Test email sent', r.message), onError: (e) => toast.error('Test failed', e.message) })}
                >
                  Send test
                </Button>
              </div>
            </Section>
          </Card>
          {saveBar}
        </>
      )}

      {tab === 'admins' && <Admins />}
      {tab === 'data' && <DataTools />}
    </div>
  );
}
