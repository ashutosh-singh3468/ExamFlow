import { useState, type FormEvent } from 'react';
import { http, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Avatar, Button, Card, CardHeader, Field, Input, PageHeader, Progress } from '@/components/ui';
import { useToast } from '@/components/overlays';
import { timeAgo } from '@/lib/format';

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

export function PasswordFields({
  current,
  setCurrent,
  next,
  setNext,
  confirm,
  setConfirm,
  currentLabel = 'Current password',
}: {
  current: string;
  setCurrent: (v: string) => void;
  next: string;
  setNext: (v: string) => void;
  confirm: string;
  setConfirm: (v: string) => void;
  currentLabel?: string;
}) {
  const s = strength(next);
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const tones = ['red', 'red', 'amber', 'green', 'green'] as const;
  return (
    <>
      <Field label={currentLabel}>
        <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </Field>
      <Field label="New password" hint={next ? undefined : 'At least 8 characters. Mix letters, numbers and symbols.'}>
        <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
        {next && (
          <div className="mt-2 flex items-center gap-3">
            <Progress value={s + 1} max={5} tone={tones[s]} />
            <span className="w-16 shrink-0 text-right text-xs text-muted">{labels[s]}</span>
          </div>
        )}
      </Field>
      <Field label="Confirm new password" error={confirm && confirm !== next ? 'Passwords do not match' : undefined}>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
    </>
  );
}

export default function Account() {
  const { user } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return toast.error('Passwords do not match');
    setBusy(true);
    try {
      await http.post('/auth/change-password', { current, next });
      toast.success('Password updated', 'Use your new password next time you sign in.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      toast.error('Could not update password', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My account" description="Your profile, password and display preferences." />
      <div className="space-y-6">
        <Card className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <Avatar name={user?.name || '?'} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold">{user?.name}</div>
            <div className="text-[14px] text-muted">{user?.email}</div>
            <div className="mt-1 text-[13px] text-muted">
              {user?.role === 'admin' ? 'Administrator' : [user?.designation, user?.department].filter(Boolean).join(' · ')}
              {user?.emp_code && ` · ${user.emp_code}`}
            </div>
          </div>
          <div className="text-xs text-muted">Last sign-in {timeAgo(user?.last_login_at)}</div>
        </Card>

        <Card>
          <CardHeader title="Change password" description="You will stay signed in on this device." />
          <form onSubmit={submit} className="grid gap-4 p-5 sm:max-w-md">
            <PasswordFields current={current} setCurrent={setCurrent} next={next} setNext={setNext} confirm={confirm} setConfirm={setConfirm} />
            <div>
              <Button type="submit" variant="primary" loading={busy}>
                Update password
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
