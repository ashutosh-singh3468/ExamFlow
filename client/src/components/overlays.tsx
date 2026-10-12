import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button, Input, cn } from './ui';

/* ------------------------------------------------------------ scroll lock */

let locks = 0;
function useBodyLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    locks++;
    document.body.style.overflow = 'hidden';
    return () => {
      locks--;
      if (!locks) document.body.style.overflow = '';
    };
  }, [active]);
}

function useEscape(active: boolean, fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        ref.current();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active]);
}

function useAutoFocus(open: boolean, ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]):not([disabled]), select, textarea');
      el?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, [open, ref]);
}

/* ------------------------------------------------------------------ Modal */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  icon,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: ReactNode;
  dismissable?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useBodyLock(open);
  useEscape(open && dismissable, onClose);
  useAutoFocus(open, panel);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-ink/40 backdrop-blur-[3px]" onClick={() => dismissable && onClose()} />
      <div
        ref={panel}
        className={cn(
          'relative flex max-h-[92vh] w-full animate-scale-in flex-col overflow-hidden rounded-t-[22px] border border-ink/15 bg-card shadow-pop sm:rounded-[22px]',
          w,
        )}
      >
        {(title || description) && (
          <div className="flex items-start gap-3 px-6 pb-2 pt-6">
            {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
            <div className="min-w-0 flex-1">
              {title && <h2 className="font-display text-[22px] font-semibold leading-7 tracking-[-0.01em]">{title}</h2>}
              {description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>}
            </div>
            {dismissable && (
              <button onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-fg">
                <X className="size-5" />
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink/[0.08] bg-paper/60 px-6 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ----------------------------------------------------------------- Drawer */

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg';
}) {
  const panel = useRef<HTMLDivElement>(null);
  useBodyLock(open);
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        className={cn(
          'absolute inset-y-0 right-0 flex w-full animate-slide-in-right flex-col border-l border-line bg-card shadow-pop',
          width === 'lg' ? 'max-w-2xl' : 'max-w-lg',
        )}
      >
        <div className="flex items-start gap-3 border-b border-ink/[0.08] bg-paper/40 px-6 py-5">
          <div className="min-w-0 flex-1">
            {title && <h2 className="font-display text-[22px] font-semibold tracking-[-0.01em]">{title}</h2>}
            {description && <div className="mt-0.5 text-[13px] text-muted">{description}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-fg">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-ink/[0.08] bg-paper/60 px-6 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ----------------------------------------------------------------- Toasts */

type ToastKind = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastApi {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);
export const useToast = () => useContext(ToastCtx)!;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastKind, title: string, message?: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { id, kind, title, message }]);
    setTimeout(() => setItems((xs) => xs.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4500);
  }, []);
  const api = useRef<ToastApi>({
    success: (t, m) => push('success', t, m),
    error: (t, m) => push('error', t, m),
    info: (t, m) => push('info', t, m),
    warning: (t, m) => push('warning', t, m),
  });
  const icons = {
    success: <CheckCircle2 className="size-5 text-mark" />,
    error: <XCircle className="size-5 text-coral" />,
    info: <Info className="size-5 text-indigo-300" />,
    warning: <AlertTriangle className="size-5 text-amber-300" />,
  };
  return (
    <ToastCtx.Provider value={api.current}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className="pointer-events-auto flex animate-slide-up items-start gap-3 rounded-xl border border-ink bg-ink p-4 text-white shadow-[4px_4px_0_0_#ddf75b]">
              {icons[t.kind]}
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{t.title}</div>
                {t.message && <div className="mt-0.5 text-[13px] leading-relaxed text-white/65">{t.message}</div>}
              </div>
              <button
                onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
                className="rounded p-0.5 text-white/50 hover:text-white"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

/* ---------------------------------------------------------------- Confirm */

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  typeToConfirm?: string;
}

const ConfirmCtx = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);
export const useConfirm = () => useContext(ConfirmCtx)!;

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setTyped('');
        setState({ ...o, resolve });
      }),
    [],
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const blocked = !!state?.typeToConfirm && typed !== state.typeToConfirm;
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        size="sm"
        title={state?.title}
        icon={
          state?.tone === 'danger' ? (
            <div className="flex size-10 -rotate-3 items-center justify-center rounded-xl border border-ink bg-coral text-white shadow-ink-sm">
              <AlertTriangle className="size-5" />
            </div>
          ) : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              {state?.cancelLabel || 'Cancel'}
            </Button>
            <Button
              variant={state?.tone === 'danger' ? 'danger' : 'primary'}
              disabled={blocked}
              onClick={() => close(true)}
              data-autofocus={state?.typeToConfirm ? undefined : true}
            >
              {state?.confirmLabel || 'Confirm'}
            </Button>
          </>
        }
      >
        {state?.message && <div className="text-[14px] leading-relaxed text-muted">{state.message}</div>}
        {state?.typeToConfirm && (
          <div className="mt-4">
            <label className="label">
              Type <span className="font-mono font-semibold text-rose-600">{state.typeToConfirm}</span> to confirm
            </label>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

/* ------------------------------------------------------------------- Menu */

export function Menu({
  trigger,
  children,
  align = 'right',
  width = 'w-56',
}: {
  trigger: (props: { onClick: () => void; open: boolean }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className="relative" ref={ref}>
      {trigger({ onClick: () => setOpen((o) => !o), open })}
      {open && (
        <div
          className={cn(
            'absolute top-full z-40 mt-1.5 animate-scale-in overflow-hidden rounded-xl border border-ink/15 bg-white p-1.5 shadow-pop',
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            width,
          )}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-menu-item]')) close();
          }}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  description,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-menu-item
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] transition-colors disabled:opacity-40',
        danger ? 'text-rose-600 hover:bg-rose-50' : 'hover:bg-paper',
      )}
    >
      {icon && <span className={cn('mt-0.5 shrink-0', !danger && 'text-muted')}>{icon}</span>}
      <span className="min-w-0">
        <span className="block">{children}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
    </button>
  );
}

export const MenuDivider = () => <div className="my-1.5 h-px bg-ink/[0.08]" />;
