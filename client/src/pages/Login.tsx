import { ArrowRight, Check, Eye, EyeOff, KeyRound, Lock, Mail, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useApi, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/AppShell';
import { Button, Callout, Field, Highlight, Input, cn } from '@/components/ui';
import { PAPER_COLORS } from '@/lib/colors';

/** A small exam hall that fills itself, seat by seat, papers alternating. */
function HallIllustration() {
  const cols = 8;
  const rows = 5;
  const pattern = [0, 1, 2, 3];
  return (
    <div className="relative">
      <div className="relative rounded-3xl border border-ink bg-white p-5 shadow-ink-lg">
        <div className="mb-3 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          <span>Room A-101 · Front</span>
          <span className="text-ink">Mid-Sem · 9:30</span>
        </div>
        <div className="mb-3 rounded-md border border-dashed border-ink/20 py-1 text-center font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Board</div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const empty = (r * 5 + c * 3) % 13 === 0;
            const paper = pattern[(r + c) % 2 === 0 ? (c % 2) * 2 : 1 + (r % 2) * 2];
            const color = PAPER_COLORS[paper];
            return (
              <div
                key={i}
                className={cn('aspect-[5/4] animate-seat-in rounded-[5px] border', empty ? 'border-dashed border-ink/15 bg-transparent' : 'border-ink/10')}
                style={{
                  animationDelay: `${300 + (c + r * 0.6) * 55}ms`,
                  background: empty ? undefined : color.tint,
                  boxShadow: empty ? undefined : `inset 0 2.5px 0 ${color.hex}`,
                }}
              />
            );
          })}
        </div>
      </div>
      {/* floating notes */}
      <div className="absolute -right-6 -top-7 animate-stamp rounded-lg border-2 border-emerald-600 bg-white/90 px-3 py-1.5 font-mono text-[12px] font-extrabold uppercase tracking-[0.14em] text-emerald-700" style={{ animationDelay: '1.6s' }}>
        0 clashes
      </div>
      <div className="absolute -bottom-8 -left-8 flex animate-float items-center gap-2.5 rounded-xl border border-ink bg-ink px-3.5 py-2.5 text-[12.5px] font-semibold text-white shadow-mark [--r:-2deg]">
        <span className="flex size-6 items-center justify-center rounded-md bg-mark text-ink">
          <Send className="size-3.5" />
        </span>
        36 invigilators notified
      </div>
      <div className="absolute -bottom-6 right-6 flex animate-float items-center gap-3 rounded-xl border border-ink bg-white px-3 py-2 shadow-ink-sm [--r:2deg]" style={{ animationDelay: '-3s' }}>
        <div>
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">Your seat</div>
          <div className="font-display text-[20px] font-semibold leading-none">C4</div>
        </div>
        <div className="h-8 w-px bg-ink/10" />
        <div className="font-mono text-[11px] font-semibold text-slate-600">26BCA017</div>
      </div>
    </div>
  );
}

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const { data: info } = useApi<{ institution_name: string; exam_cell_name: string }>('/public/info');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={loc.state?.from || '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      nav(loc.state?.from || '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="bg-seats pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-[1280px] items-center gap-12 px-6 py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,460px)] lg:gap-20 lg:px-10">
        {/* story */}
        <div className="hidden lg:block">
          <Logo />
          <div className="eyebrow mt-14">Exam & class slot management · {info?.institution_name}</div>
          <h1 className="mt-4 font-display text-[76px] font-semibold leading-[0.95] tracking-[-0.045em] text-ink">
            Seat every student.
            <br />
            <span className="italic">
              <Highlight>Fairly.</Highlight>
            </span>
          </h1>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-slate-600">
            Clash-free seating plans in seconds, invigilation shared evenly across staff, and every teacher notified the moment a plan is approved.
          </p>
          <div className="mt-14 max-w-[520px] pl-8">
            <HallIllustration />
          </div>
        </div>

        {/* sign in */}
        <div className="w-full">
          <div className="mb-8 lg:hidden">
            <Logo />
            <h1 className="mt-8 font-display text-[44px] font-semibold leading-none tracking-[-0.04em]">
              Seat every student. <span className="italic"><Highlight>Fairly.</Highlight></span>
            </h1>
          </div>
          <div className="rounded-3xl border border-ink bg-white p-7 shadow-ink-lg sm:p-9">
            <div className="eyebrow">{info?.exam_cell_name || 'Examination cell'}</div>
            <h2 className="mt-2 font-display text-[34px] font-semibold tracking-[-0.03em]">Welcome back</h2>
            <p className="mt-1 text-[14.5px] text-slate-600">Sign in with your college email address.</p>
            <form onSubmit={submit} className="mt-7 space-y-4">
              {error && <Callout tone="error">{error}</Callout>}
              <Field label="Email address" htmlFor="email">
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@college.edu" className="h-12 pl-10" autoFocus />
                </div>
              </Field>
              <Field label="Password" htmlFor="password">
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="password"
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12 px-10"
                  />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
              <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} iconRight={!busy && <ArrowRight className="size-4" />}>
                Sign in
              </Button>
            </form>
            <div className="mt-6 flex items-start gap-3 rounded-2xl bg-paper px-4 py-3.5 text-[13px] leading-relaxed text-slate-600">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-ink bg-mark text-ink">
                <KeyRound className="size-3.5" />
              </span>
              <span>
                <b className="text-ink">Teaching staff, first time here?</b> Use your <b className="text-ink">Employee ID</b> as the password — you’ll pick a new one right after.
              </span>
            </div>
          </div>
          <Link
            to="/find-seat"
            className="group mt-5 flex items-center justify-between rounded-2xl border border-ink bg-mark px-5 py-4 shadow-ink-sm transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-ink"
          >
            <span>
              <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink/60">Students</span>
              <span className="block font-display text-[19px] font-semibold text-ink">Find my exam seat</span>
            </span>
            <span className="flex size-9 items-center justify-center rounded-full border border-ink bg-white transition group-hover:bg-ink group-hover:text-mark">
              <ArrowRight className="size-4" />
            </span>
          </Link>
          <div className="mt-6 flex items-center justify-center gap-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-slate-400">
            {['Smart seating', 'Fair duties', 'Auto email'].map((t) => (
              <span key={t} className="flex items-center gap-1">
                <Check className="size-3 text-emerald-600" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
