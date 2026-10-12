import clsx from 'clsx';
import { AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, Search, X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { avatarColor } from '@/lib/colors';
import { initials } from '@/lib/format';

export const cn = clsx;

/* ----------------------------------------------------------------- Button */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'success' | 'white' | 'mark';
type Size = 'xs' | 'sm' | 'md' | 'lg';

const lift = 'hover:-translate-x-[2px] hover:-translate-y-[2px] active:translate-x-0 active:translate-y-0 active:shadow-none';
const variants: Record<Variant, string> = {
  primary: cn('border border-ink bg-ink text-white hover:shadow-brand', lift),
  mark: cn('border border-ink bg-mark text-ink shadow-ink-sm hover:shadow-ink', lift),
  secondary: 'border border-ink/15 bg-white text-ink hover:border-ink',
  ghost: 'text-slate-600 hover:bg-ink/[0.05] hover:text-ink',
  subtle: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
  danger: cn('border border-[#d9432a] bg-[#e64a2e] text-white hover:shadow-ink-sm', lift),
  success: cn('border border-emerald-700 bg-emerald-600 text-white hover:shadow-ink-sm', lift),
  white: cn('border border-ink bg-white text-ink hover:shadow-ink-sm', lift),
};
const sizes: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-lg',
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-[14px] gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, iconRight, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-40', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- Inputs */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn('field', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn('field min-h-[84px] resize-y', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'field cursor-pointer appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-10',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2315161c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  className,
  required,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-coral">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1.5 text-xs font-semibold text-[#d9432a]">{error}</p> : hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input className="field pl-10 pr-9" value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 hover:bg-ink/5 hover:text-ink">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      {(label || description) && (
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          {label && <div className="text-[14px] font-semibold text-ink">{label}</div>}
          {description && <div className="mt-0.5 text-[13px] text-muted">{description}</div>}
        </label>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:opacity-50', checked ? 'border-ink bg-ink' : 'border-ink/15 bg-ink/10')}
      >
        <span className={cn('inline-block size-[18px] rounded-full shadow transition-all duration-200', checked ? 'translate-x-[21px] bg-mark' : 'translate-x-[2px] bg-white')} />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, indeterminate, className }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; indeterminate?: boolean; className?: string }) {
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-2', className)}>
      <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        onClick={(e) => {
          e.stopPropagation();
          onChange(!checked);
        }}
        className={cn(
          'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all',
          checked || indeterminate ? 'border-ink bg-ink text-mark' : 'border-ink/25 bg-white hover:border-ink',
        )}
      >
        {indeterminate ? <span className="h-0.5 w-2 rounded bg-current" /> : checked ? <Check className="size-3.5" strokeWidth={3.5} /> : null}
      </button>
      {label && <span className="text-[14px]">{label}</span>}
    </label>
  );
}

/* ---------------------------------------------------------- Display bits */

type Tone = 'gray' | 'indigo' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'mark';
const tones: Record<Tone, string> = {
  gray: 'bg-ink/[0.05] text-slate-600 ring-ink/10',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200/80',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-coral-soft text-[#c63b20] ring-[#ffc9bc]',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
  violet: 'bg-purple-50 text-purple-700 ring-purple-200',
  mark: 'bg-mark text-ink ring-ink/20',
};

export function Badge({ tone = 'gray', children, className, dot, icon }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean; icon?: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset', tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {icon}
      {children}
    </span>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, icon, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-ink/[0.08] px-5 py-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-ink/10 bg-paper text-ink">{icon}</div>}
        <div className="min-w-0">
          <h3 className="font-display text-[18px] font-semibold leading-6 tracking-[-0.01em]">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-ink', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
      <div className="grid grid-cols-3 gap-1.5" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="size-2.5 animate-blink rounded-[3px] bg-ink" style={{ animationDelay: `${(i % 3) * 0.12 + Math.floor(i / 3) * 0.12}s` }} />
        ))}
      </div>
      <span className="eyebrow">{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-12 -rotate-3 items-center justify-center rounded-xl border border-ink bg-coral text-white shadow-ink-sm">
        <AlertCircle className="size-6" />
      </div>
      <div className="font-display text-[20px] font-semibold">We couldn’t load this page</div>
      <p className="max-w-md text-sm text-muted">{error instanceof Error ? error.message : 'Unexpected error.'}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('relative flex flex-col items-center justify-center overflow-hidden px-6 py-16 text-center', className)}>
      <div className="bg-seats pointer-events-none absolute inset-0 [mask-image:radial-gradient(closest-side,black,transparent)]" />
      {icon && <div className="relative mb-6 flex size-14 -rotate-3 items-center justify-center rounded-2xl border border-ink bg-mark text-ink shadow-ink">{icon}</div>}
      <h3 className="relative font-display text-[22px] font-semibold tracking-[-0.01em]">{title}</h3>
      {description && <p className="relative mt-2 max-w-md text-[14px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="relative mt-7 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Progress({ value, max = 100, tone = 'primary', className }: { value: number; max?: number; tone?: 'primary' | 'green' | 'amber' | 'red'; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = { primary: 'bg-indigo-600', green: 'bg-emerald-500', amber: 'bg-amber-400', red: 'bg-coral' }[tone];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]', className)}>
      <div className={cn('h-full rounded-full transition-all duration-700 ease-out', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'size-8 text-[11px]', md: 'size-9 text-[12.5px]', lg: 'size-14 text-lg' }[size];
  return <div className={cn('flex shrink-0 items-center justify-center rounded-full font-bold ring-1 ring-ink/10', s, avatarColor(name), className)}>{initials(name)}</div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/** Animated number for headline figures. */
export function CountUp({ value, duration = 900, decimals = 0 }: { value: number; duration?: number; decimals?: number }) {
  const [n, setN] = useState(value);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
}

/** A word with a highlighter stroke behind it. */
export function Highlight({ children, animate = true, className }: { children: ReactNode; animate?: boolean; className?: string }) {
  return <span className={cn('hl', animate && 'hl-animate', className)}>{children}</span>;
}

/* ------------------------------------------------------------------- Tabs */

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number; icon?: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-ink/10 scrollbar-thin', className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn('relative -mb-px flex items-center gap-2 whitespace-nowrap px-3 pb-3 pt-1 text-[14px] font-semibold transition-colors', value === it.value ? 'text-ink' : 'text-slate-500 hover:text-ink')}
        >
          {it.icon}
          {it.label}
          {it.count !== undefined && (
            <span className={cn('rounded-md px-1.5 py-px font-mono text-[10.5px] font-semibold tabular', value === it.value ? 'bg-ink text-mark' : 'bg-ink/[0.06] text-slate-500')}>{it.count}</span>
          )}
          {value === it.value && <span className="absolute inset-x-1 bottom-0 h-[2.5px] rounded-full bg-ink" />}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items, className, size = 'md' }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; icon?: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('inline-flex rounded-xl border border-ink/10 bg-ink/[0.04] p-0.5', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onChange(it.value)}
          className={cn(
            'flex items-center gap-1.5 rounded-[10px] font-semibold transition-all duration-150',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]',
            value === it.value ? 'bg-white text-ink shadow-[0_0_0_1px_rgb(21_22_28/0.12),0_1px_2px_rgb(21_22_28/0.08)]' : 'text-slate-500 hover:text-ink',
          )}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- Stepper */

export function Stepper({ steps, current, className, compact }: { steps: { label: string; description?: string }[]; current: number; className?: string; compact?: boolean }) {
  return (
    <ol className={cn('flex items-center', className)}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.label} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex shrink-0 items-center justify-center rounded-lg border font-mono font-bold transition-all',
                  compact ? 'size-7 text-[11px]' : 'size-8 text-xs',
                  done && 'border-ink bg-ink text-mark',
                  active && 'border-ink bg-mark text-ink shadow-ink-sm',
                  !done && !active && 'border-ink/15 bg-white text-slate-400',
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3.5} /> : String(i + 1).padStart(2, '0')}
              </span>
              <div className={cn('hidden min-w-0 sm:block', compact && 'sm:hidden lg:block')}>
                <div className={cn('whitespace-nowrap text-[13px] font-semibold', done || active ? 'text-ink' : 'text-slate-400')}>{s.label}</div>
                {s.description && !compact && <div className="whitespace-nowrap text-xs text-muted">{s.description}</div>}
              </div>
            </div>
            {i < steps.length - 1 && <div className={cn('mx-3 h-px min-w-4 flex-1 transition-colors', done ? 'bg-ink' : 'bg-[length:8px_1px] bg-repeat-x [background-image:linear-gradient(to_right,rgb(21_22_28/0.25)_50%,transparent_0)]')} />}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------ Pagination */

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-ink/[0.08] px-5 py-3 text-[13px] text-muted">
      <span className="tabular">
        <b className="font-mono font-semibold text-ink">
          {from.toLocaleString()}–{to.toLocaleString()}
        </b>{' '}
        of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <IconButton label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="border border-ink/15 bg-white">
          <ChevronLeft className="size-4" />
        </IconButton>
        <span className="tabular px-2 font-mono text-xs font-semibold text-ink">
          {page} / {pages}
        </span>
        <IconButton label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className="border border-ink/15 bg-white">
          <ChevronRight className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Callout */

export function Callout({ tone = 'info', title, children, icon, action, className }: { tone?: 'info' | 'warning' | 'error' | 'success'; title?: ReactNode; children?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  const t = {
    info: { bar: 'shadow-[inset_3px_0_0_#3d44f0]', icon: 'text-indigo-600', def: <Info className="size-4" /> },
    warning: { bar: 'shadow-[inset_3px_0_0_#f2a516]', icon: 'text-amber-600', def: <AlertTriangle className="size-4" /> },
    error: { bar: 'shadow-[inset_3px_0_0_#ff5b3a]', icon: 'text-coral', def: <AlertCircle className="size-4" /> },
    success: { bar: 'shadow-[inset_3px_0_0_#10b981]', icon: 'text-emerald-600', def: <CheckCircle2 className="size-4" /> },
  }[tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-[13px] text-ink', t.bar, className)}>
      <div className={cn('mt-px shrink-0', t.icon)}>{icon || t.def}</div>
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cn('leading-relaxed text-slate-600', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------- Page header */

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {breadcrumb && <div className="mb-3 text-[13px] font-medium text-muted">{breadcrumb}</div>}
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[38px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const tileTones = {
  indigo: 'bg-indigo-50 text-indigo-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  sky: 'bg-sky-50 text-sky-700',
  violet: 'bg-indigo-50 text-indigo-700',
  rose: 'bg-coral-soft text-coral',
  mark: 'bg-mark text-ink',
};

export function IconTile({ tone = 'indigo', children, className }: { tone?: keyof typeof tileTones; children: ReactNode; className?: string }) {
  return <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl border border-ink/10', tileTones[tone], className)}>{children}</div>;
}

export function StatCard({ label, value, sub, icon, tone = 'indigo', onClick }: { label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; tone?: keyof typeof tileTones; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cn('card relative overflow-hidden p-5 text-left', onClick && 'lift')}>
      <div className="flex items-start justify-between gap-3">
        <div className="eyebrow">{label}</div>
        <IconTile tone={tone} className="-mr-1 -mt-1">
          {icon}
        </IconTile>
      </div>
      <div className="mt-3 font-display text-[44px] font-semibold leading-none tracking-[-0.03em] text-ink tabular">
        {typeof value === 'number' ? <CountUp value={value} /> : value}
      </div>
      {sub && <div className="mt-2.5 truncate text-[13px] text-muted">{sub}</div>}
    </Comp>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto scrollbar-thin', className)}>
      <table className="w-full min-w-[640px] text-left text-[14px]">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn('whitespace-nowrap border-b border-ink/10 bg-paper/50 px-5 py-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500', className)}>{children}</th>;
}

export function Td({ children, className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('border-b border-ink/[0.07] px-5 py-3.5 align-middle', className)} {...rest}>
      {children}
    </td>
  );
}
