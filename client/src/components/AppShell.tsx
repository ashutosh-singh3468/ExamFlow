import {
  Armchair,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Check,
  ChevronsUpDown,
  ClipboardList,
  Copy,
  CornerDownLeft,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Printer,
  Search,
  Settings,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Avatar, Kbd, cn } from './ui';
import { Menu, MenuDivider, MenuItem } from './overlays';

/** Brand mark: an exam hall seen from above — ink desks, highlighter-marked seats. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#15161c" />
      <g fill="#ddf75b">
        <rect x="13" y="13" width="10" height="10" rx="3" />
        <rect x="41" y="13" width="10" height="10" rx="3" />
        <rect x="27" y="27" width="10" height="10" rx="3" />
        <rect x="13" y="41" width="10" height="10" rx="3" />
        <rect x="41" y="41" width="10" height="10" rx="3" />
      </g>
      <g fill="#ffffff" opacity=".9">
        <rect x="27" y="13" width="10" height="10" rx="3" />
        <rect x="13" y="27" width="10" height="10" rx="3" />
        <rect x="41" y="27" width="10" height="10" rx="3" />
        <rect x="27" y="41" width="10" height="10" rx="3" />
      </g>
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="size-9" />
      <span className={cn('font-display text-[22px] font-semibold tracking-[-0.02em]', light ? 'text-white' : 'text-ink')}>
        Exam<span className="italic">flow</span>
      </span>
    </div>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

function useNav(): { title?: string; items: NavItem[] }[] {
  const { user } = useAuth();
  const { data } = useApi<{ alerts: { severity: string }[] }>(user?.role === 'admin' ? '/dashboard' : null);
  const conflicts = data?.alerts.filter((a) => a.severity === 'error').length || 0;
  const I = (C: typeof Users) => <C className="size-[18px]" strokeWidth={1.9} />;
  if (user?.role === 'teacher')
    return [
      {
        title: 'Teaching staff',
        items: [
          { to: '/my/duties', label: 'My duties', icon: I(ClipboardList) },
          { to: '/my/availability', label: 'Availability', icon: I(CalendarOff) },
          { to: '/account', label: 'My account', icon: I(UserCircle2) },
        ],
      },
    ];
  return [
    { title: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', icon: I(LayoutDashboard), badge: conflicts }] },
    {
      title: 'Examinations',
      items: [
        { to: '/schedule', label: 'Exam schedule', icon: I(CalendarDays) },
        { to: '/plans', label: 'Seating plans', icon: I(Armchair) },
        { to: '/reports', label: 'Reports & print', icon: I(Printer) },
      ],
    },
    {
      title: 'Setup',
      items: [
        { to: '/classrooms', label: 'Classrooms', icon: I(Building2) },
        { to: '/courses', label: 'Courses', icon: I(BookOpen) },
        { to: '/students', label: 'Students', icon: I(GraduationCap) },
        { to: '/teachers', label: 'Teachers', icon: I(Users) },
      ],
    },
    {
      title: 'System',
      items: [
        { to: '/notifications', label: 'Notifications', icon: I(Bell) },
        { to: '/settings', label: 'Settings', icon: I(Settings) },
      ],
    },
  ];
}

function SeatFinderCard() {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/find-seat`;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink bg-mark p-4 shadow-ink-sm [@media(max-height:860px)]:hidden">
      <div className="bg-seats pointer-events-none absolute -right-6 -top-6 size-28 opacity-60" />
      <div className="relative font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink/70">For students</div>
      <div className="relative mt-1 font-display text-[17px] font-semibold leading-snug text-ink">Seat finder is live</div>
      <p className="relative mt-1 text-[12.5px] leading-snug text-ink/70">Share the link — students type a roll number and see their room & seat.</p>
      <div className="relative mt-3 flex gap-1.5">
        <button
          onClick={() => {
            navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            });
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink bg-ink px-2 py-1.5 text-[12px] font-semibold text-white transition hover:bg-ink-soft"
        >
          {copied ? <Check className="size-3.5 text-mark" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <a href="/find-seat" target="_blank" rel="noreferrer" className="flex items-center justify-center rounded-lg border border-ink bg-white px-2 text-ink transition hover:bg-paper" title="Open seat finder">
          <ArrowUpRight className="size-4" />
        </a>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const nav = useNav();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: info } = useApi<{ institution_name: string; institution_short: string }>('/public/info');
  return (
    <div className="flex h-full flex-col border-r border-ink/10 bg-paper">
      <div className="px-5 pb-5 pt-6">
        <Link to="/" onClick={onNavigate}>
          <Logo />
        </Link>
        {info && (
          <div className="eyebrow mt-3 truncate" title={info.institution_name}>
            {info.institution_name}
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4 scrollbar-thin">
        {nav.map((group, gi) => (
          <div key={gi}>
            {group.title && <div className="eyebrow mb-2 px-3 text-[9.5px] text-slate-400">{group.title}</div>}
            <div className="space-y-1">
              {group.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex h-10 items-center gap-3 rounded-xl border px-3 text-[14px] transition-all duration-150',
                      isActive ? 'border-ink bg-white font-semibold text-ink shadow-ink-sm' : 'border-transparent font-medium text-slate-600 hover:bg-white/70 hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={cn('flex size-6 items-center justify-center rounded-md transition-colors', isActive ? 'bg-mark text-ink' : 'text-slate-400 group-hover:text-ink')}>{it.icon}</span>
                      <span className="flex-1">{it.label}</span>
                      {!!it.badge && <span className="rounded-md bg-coral px-1.5 py-px font-mono text-[10.5px] font-bold text-white">{it.badge}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-3 p-3">
        {user?.role === 'admin' ? (
          <SeatFinderCard />
        ) : (
          <Link to="/my/availability" onClick={onNavigate} className="lift block rounded-2xl border border-ink/15 bg-white p-4 [@media(max-height:700px)]:hidden">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Heads-up</div>
            <div className="mt-1 font-display text-[16px] font-semibold leading-snug">Can’t make an exam day?</div>
            <p className="mt-1 text-[12.5px] text-muted">Mark it early so duties go to someone else.</p>
          </Link>
        )}
        <Menu
          align="left"
          width="w-60"
          trigger={({ onClick }) => (
            <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left transition hover:border-ink/10 hover:bg-white">
              <Avatar name={user?.name || '?'} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">{user?.name}</div>
                <div className="truncate text-xs text-muted">{user?.role === 'admin' ? 'Administrator' : user?.designation || 'Teacher'}</div>
              </div>
              <ChevronsUpDown className="size-4 text-slate-400" />
            </button>
          )}
        >
          <div className="px-2.5 py-2">
            <div className="truncate text-[13px] font-semibold">{user?.name}</div>
            <div className="truncate text-xs text-muted">{user?.email}</div>
          </div>
          <MenuDivider />
          <MenuItem icon={<UserCircle2 className="size-4" />} onClick={() => navigate('/account')}>
            Account & password
          </MenuItem>
          <MenuItem icon={<ArrowUpRight className="size-4" />} onClick={() => window.open('/find-seat', '_blank')}>
            Student seat finder
          </MenuItem>
          <MenuDivider />
          <MenuItem icon={<LogOut className="size-4" />} danger onClick={() => logout().then(() => navigate('/login'))}>
            Sign out
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
}

const ACTIONS = [
  { label: 'Generate a seating plan', to: '/plans/new', icon: <Armchair className="size-4" />, keywords: 'new create seating generate' },
  { label: 'Add an exam slot', to: '/schedule?new=1', icon: <CalendarClock className="size-4" />, keywords: 'schedule exam timetable new' },
  { label: 'Import students from Excel', to: '/students?import=1', icon: <GraduationCap className="size-4" />, keywords: 'upload excel students' },
  { label: 'Import teachers from Excel', to: '/teachers?import=1', icon: <Users className="size-4" />, keywords: 'upload excel teachers staff' },
  { label: 'Add a classroom', to: '/classrooms?new=1', icon: <Building2 className="size-4" />, keywords: 'room hall new' },
  { label: 'Print seating charts & lists', to: '/reports', icon: <Printer className="size-4" />, keywords: 'pdf download print report' },
  { label: 'Workload report', to: '/reports?tab=workload', icon: <BarChart3 className="size-4" />, keywords: 'duty distribution' },
];

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNav();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const items = useMemo(() => {
    const pages = nav.flatMap((g) => g.items.map((i) => ({ label: i.label, to: i.to, icon: i.icon, keywords: g.title || '', group: 'Go to' })));
    const all = [...pages, ...ACTIONS.map((a) => ({ ...a, group: 'Action' }))];
    const t = q.trim().toLowerCase();
    return t ? all.filter((i) => `${i.label} ${i.keywords}`.toLowerCase().includes(t)) : all;
  }, [nav, q]);
  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => input.current?.focus(), 20);
    }
  }, [open]);
  if (!open) return null;
  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-ink/30 backdrop-blur-[3px]" onClick={onClose} />
      <div className="relative w-full max-w-lg animate-scale-in overflow-hidden rounded-2xl border border-ink bg-white shadow-ink-lg">
        <div className="flex items-center gap-3 border-b border-ink/10 px-4">
          <Search className="size-4 text-slate-400" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
              if (e.key === 'Enter' && items[active]) go(items[active].to);
            }}
            placeholder="Where to? Search pages and actions…"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2 scrollbar-thin">
          {!items.length && <div className="px-3 py-8 text-center text-sm text-muted">No matches</div>}
          {items.map((it, i) => (
            <button
              key={it.group + it.to + it.label}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(it.to)}
              className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] transition-colors', i === active ? 'bg-mark text-ink' : 'text-slate-700')}
            >
              <span className={i === active ? 'text-ink' : 'text-slate-400'}>{it.icon}</span>
              <span className="flex-1 font-medium">{it.label}</span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/40">{it.group}</span>
              {i === active && <CornerDownLeft className="size-3.5" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const CRUMBS: Record<string, string> = {
  dashboard: 'Dashboard',
  schedule: 'Exam schedule',
  plans: 'Seating plans',
  reports: 'Reports & print',
  classrooms: 'Classrooms',
  courses: 'Courses',
  students: 'Students',
  teachers: 'Teachers',
  notifications: 'Notifications',
  settings: 'Settings',
  account: 'Account',
  my: 'My duties',
  availability: 'Availability',
};

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hidden items-center gap-2 rounded-lg border border-ink/10 bg-white/70 px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 md:flex">
      <span className="size-1.5 animate-blink rounded-full bg-emerald-500" />
      {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      <span className="text-ink/25">·</span>
      {now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
    </div>
  );
}

export default function AppShell() {
  const [mobile, setMobile] = useState(false);
  const [palette, setPalette] = useState(false);
  const loc = useLocation();
  const { user } = useAuth();
  const parts = loc.pathname.split('/').filter(Boolean);
  const isMine = parts[0] === 'my';
  const section = isMine ? (parts[1] === 'availability' ? 'availability' : 'my') : parts[0] || 'dashboard';
  const sub = isMine ? parts[2] : parts[1];

  useEffect(() => {
    setMobile(false);
  }, [loc.pathname]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[268px] lg:block">
        <Sidebar />
      </aside>
      {mobile && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-ink/40 backdrop-blur-[2px]" onClick={() => setMobile(false)} />
          <div className="absolute inset-y-0 left-0 w-[288px] animate-slide-up">
            <Sidebar onNavigate={() => setMobile(false)} />
            <button onClick={() => setMobile(false)} className="absolute right-3 top-6 rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-ink" aria-label="Close menu">
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}
      <div className="lg:pl-[268px]">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink/[0.07] bg-bg/80 px-4 backdrop-blur-md sm:px-6 lg:px-10">
          <button className="-ml-1 rounded-lg p-1.5 text-slate-600 hover:bg-white lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu">
            <MenuIcon className="size-5" />
          </button>
          <Link to="/" className="lg:hidden">
            <LogoMark className="size-8" />
          </Link>
          <div className="hidden items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:flex">
            <span>Examflow</span>
            <span className="text-ink/20">/</span>
            <span className="text-ink">{CRUMBS[section] || section}</span>
            {sub && (
              <>
                <span className="text-ink/20">/</span>
                <span className="text-slate-500">{sub === 'new' ? 'New' : `#${sub}`}</span>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {user?.role === 'admin' && (
              <button
                onClick={() => setPalette(true)}
                className="hidden h-9 w-64 items-center gap-2 rounded-xl border border-ink/15 bg-white px-3 text-[13px] text-slate-400 transition hover:border-ink sm:flex"
              >
                <Search className="size-4" />
                <span className="flex-1 text-left">Jump to anything…</span>
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
              </button>
            )}
            <Clock />
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">
          <div key={loc.pathname} className="animate-page">
            <Outlet />
          </div>
        </main>
      </div>
      {user?.role === 'admin' && <CommandPalette open={palette} onClose={() => setPalette(false)} />}
    </div>
  );
}
