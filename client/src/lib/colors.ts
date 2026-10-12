/** Paper colours used on seat maps, legends and PDFs. Order maximises contrast between neighbours. */
export const PAPER_COLORS = [
  { seat: 'bg-indigo-50/80 border-indigo-300/70 text-ink shadow-[inset_0_3px_0_#6366f1]', dot: 'bg-indigo-500', text: 'text-indigo-700', hex: '#6366f1', tint: '#e0e7ff' },
  { seat: 'bg-emerald-50/80 border-emerald-300/70 text-ink shadow-[inset_0_3px_0_#10b981]', dot: 'bg-emerald-500', text: 'text-emerald-700', hex: '#10b981', tint: '#d1fae5' },
  { seat: 'bg-amber-50/80 border-amber-300/70 text-ink shadow-[inset_0_3px_0_#f59e0b]', dot: 'bg-amber-500', text: 'text-amber-700', hex: '#f59e0b', tint: '#fef3c7' },
  { seat: 'bg-rose-50/80 border-rose-300/70 text-ink shadow-[inset_0_3px_0_#f43f5e]', dot: 'bg-rose-500', text: 'text-rose-700', hex: '#f43f5e', tint: '#ffe4e6' },
  { seat: 'bg-sky-50/80 border-sky-300/70 text-ink shadow-[inset_0_3px_0_#0ea5e9]', dot: 'bg-sky-500', text: 'text-sky-700', hex: '#0ea5e9', tint: '#e0f2fe' },
  { seat: 'bg-purple-50/80 border-purple-300/70 text-ink shadow-[inset_0_3px_0_#a855f7]', dot: 'bg-purple-500', text: 'text-purple-700', hex: '#a855f7', tint: '#ede9fe' },
  { seat: 'bg-orange-50/80 border-orange-300/70 text-ink shadow-[inset_0_3px_0_#f97316]', dot: 'bg-orange-500', text: 'text-orange-700', hex: '#f97316', tint: '#ffedd5' },
  { seat: 'bg-teal-50/80 border-teal-300/70 text-ink shadow-[inset_0_3px_0_#14b8a6]', dot: 'bg-teal-500', text: 'text-teal-700', hex: '#14b8a6', tint: '#ccfbf1' },
  { seat: 'bg-fuchsia-50/80 border-fuchsia-300/70 text-ink shadow-[inset_0_3px_0_#d946ef]', dot: 'bg-fuchsia-500', text: 'text-fuchsia-700', hex: '#d946ef', tint: '#fae8ff' },
  { seat: 'bg-lime-50/80 border-lime-300/70 text-ink shadow-[inset_0_3px_0_#84cc16]', dot: 'bg-lime-500', text: 'text-lime-700', hex: '#84cc16', tint: '#ecfccb' },
];

export const paperColor = (index: number) => PAPER_COLORS[((index % PAPER_COLORS.length) + PAPER_COLORS.length) % PAPER_COLORS.length];

const AVATAR = [
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-purple-100 text-purple-700',
  'bg-teal-100 text-teal-700',
];

export function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR[h % AVATAR.length];
}
