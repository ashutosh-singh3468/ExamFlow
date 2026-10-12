import { KeyRound, LogOut } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { http, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/AppShell';
import { Button, Callout, Card } from '@/components/ui';
import { PasswordFields } from './Account';

export default function ForcePasswordChange() {
  const { user, refresh, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    setError('');
    try {
      await http.post('/auth/change-password', { current, next });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-8" />
      <Card className="w-full max-w-md p-7">
        <div className="mb-5 flex size-11 items-center justify-center rounded-xl border border-ink bg-mark text-ink">
          <KeyRound className="size-5" />
        </div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em]">Welcome, {user?.name}</h1>
        <p className="mt-1.5 text-[14px] text-muted">
          For your security, please choose a new password before continuing. You signed in with a temporary password{user?.emp_code ? ' (your Employee ID)' : ''}.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && <Callout tone="error">{error}</Callout>}
          <PasswordFields current={current} setCurrent={setCurrent} next={next} setNext={setNext} confirm={confirm} setConfirm={setConfirm} currentLabel="Temporary password" />
          <Button type="submit" variant="primary" className="w-full" size="lg" loading={busy}>
            Save and continue
          </Button>
        </form>
      </Card>
      <button onClick={logout} className="mt-6 flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <LogOut className="size-4" /> Sign out
      </button>
    </div>
  );
}
