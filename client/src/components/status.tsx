import type { PlanStatus } from '@/lib/types';
import { cn } from './ui';

const STAMPS: Record<string, { label: string; cls: string; dot: string }> = {
  none: { label: 'Not generated', cls: 'border-dashed border-ink/25 text-slate-500 bg-white', dot: 'bg-slate-300' },
  draft: { label: 'Draft', cls: 'border-amber-300 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  approved: { label: 'Approved', cls: 'border-indigo-200 bg-indigo-50 text-indigo-700', dot: 'bg-indigo-600' },
  notified: { label: 'Notified', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
};

/** Plan status shown as a small rubber-stamp style tag. */
export function PlanStatusBadge({ status, className }: { status: PlanStatus | null | undefined; className?: string }) {
  const s = STAMPS[status || 'none'];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-[3px] font-mono text-[10px] font-bold uppercase tracking-[0.1em]', s.cls, className)}>
      <span className={cn('size-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

export const WORKFLOW = [
  { label: 'Generate', description: 'Seats & duties' },
  { label: 'Review & edit', description: 'Fix conflicts' },
  { label: 'Approve', description: 'Lock the plan' },
  { label: 'Notify', description: 'Email teachers' },
];

export function workflowStep(status: PlanStatus | null | undefined) {
  if (!status) return 0;
  if (status === 'draft') return 1;
  if (status === 'approved') return 3;
  return 4;
}

/** Four little squares: generate · review · approve · notify. */
export function MiniProgress({ status }: { status: PlanStatus | null | undefined }) {
  const step = workflowStep(status);
  return (
    <div className="flex items-center gap-[3px]" title={WORKFLOW.map((w, i) => `${i < step ? '✓' : '○'} ${w.label}`).join('\n')}>
      {WORKFLOW.map((w, i) => (
        <span key={w.label} className={cn('size-2 rounded-[2px]', i < step ? (step === 4 ? 'bg-emerald-500' : 'bg-ink') : 'bg-ink/[0.12]')} />
      ))}
    </div>
  );
}
