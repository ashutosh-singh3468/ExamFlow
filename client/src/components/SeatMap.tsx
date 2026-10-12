import { useMemo, type ReactNode } from 'react';
import { buildSeats, circularPosition, rowLetter } from '@/lib/layout';
import type { LayoutShape, Seat } from '@/lib/types';
import { cn } from './ui';

export interface CellInfo {
  r: number;
  c: number;
  key: string;
  seat: Seat | null;
  blocked: boolean;
}

export type SeatSize = 'xs' | 'sm' | 'md' | 'lg';

const DIMS: Record<SeatSize, { w: number; h: number; gap: number }> = {
  xs: { w: 9, h: 7, gap: 2 },
  sm: { w: 34, h: 26, gap: 4 },
  md: { w: 52, h: 44, gap: 5 },
  lg: { w: 84, h: 58, gap: 8 },
};

export function SeatMap({
  layout,
  blocked = [],
  size = 'md',
  cell,
  front = true,
  axes = false,
  className,
}: {
  layout: LayoutShape;
  blocked?: string[];
  size?: SeatSize;
  cell: (info: CellInfo) => ReactNode;
  front?: boolean;
  axes?: boolean;
  className?: string;
}) {
  const blockedKey = blocked.join(',');
  const seats = useMemo(
    () => buildSeats(layout, blocked),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout.kind, layout.rows, layout.cols, layout.numbering, layout.prefix, blockedKey],
  );
  const byKey = useMemo(() => new Map(seats.map((s) => [s.key, s])), [seats]);
  const blockedSet = useMemo(() => new Set(blocked), [blockedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const { w, h, gap } = DIMS[size];
  const rows = Math.max(0, layout.rows);
  const cols = Math.max(0, layout.cols);

  const info = (r: number, c: number): CellInfo => {
    const key = `${r}-${c}`;
    return { r, c, key, seat: byKey.get(key) || null, blocked: blockedSet.has(key) };
  };

  if (layout.kind === 'circular') {
    // radius so the inner ring has room for every seat and rings don't overlap
    const ringGap = h + gap * 2;
    const innerNeeded = (cols * (Math.max(w, h) + gap)) / (2 * Math.PI);
    const R = Math.max(innerNeeded / 0.45, rows > 1 ? (ringGap * (rows - 1)) / 0.55 : innerNeeded, 40);
    const box = Math.ceil(2 * R + Math.max(w, h) + gap * 2);
    return (
      <div className={cn('relative m-auto shrink-0', className)} style={{ width: box, height: box }}>
        {size !== 'xs' && (
          <div
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dashed border-line bg-subtle/60 text-center text-[11px] font-medium uppercase tracking-widest text-muted"
            style={{ width: R * 0.6, height: R * 0.6 }}
          >
            {size === 'sm' ? '' : 'Centre'}
          </div>
        )}
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => {
            const p = circularPosition(r, c, rows, cols);
            return (
              <div
                key={`${r}-${c}`}
                className="absolute"
                style={{ width: w, height: h, left: box / 2 + p.x * R - w / 2, top: box / 2 + p.y * R - h / 2 }}
              >
                {cell(info(r, c))}
              </div>
            );
          }),
        )}
      </div>
    );
  }

  return (
    <div className={cn('m-auto flex w-fit shrink-0 flex-col', className)}>
      {front && size !== 'xs' && (
        <div
          className="mb-3 flex items-center justify-center gap-2 rounded-md border border-dashed border-line bg-subtle/70 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted"
          style={{ marginLeft: axes ? 22 : 0 }}
        >
          Front · Board
        </div>
      )}
      {axes && size !== 'xs' && (
        <div className="mb-1 flex" style={{ gap, marginLeft: 22 }}>
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className="text-center text-[10px] font-medium text-muted" style={{ width: w }}>
              {c + 1}
            </div>
          ))}
        </div>
      )}
      <div className="flex" style={{ gap }}>
        {axes && size !== 'xs' && (
          <div className="flex w-4 flex-col" style={{ gap }}>
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} className="flex items-center justify-center text-[10px] font-semibold text-muted" style={{ height: h }}>
                {rowLetter(r)}
              </div>
            ))}
          </div>
        )}
        <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, ${w}px)`, gridAutoRows: `${h}px`, gap }}>
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => (
              <div key={`${r}-${c}`} style={{ width: w, height: h }}>
                {cell(info(r, c))}
              </div>
            )),
          )}
        </div>
      </div>
    </div>
  );
}

/** Small preview used on cards and pickers. */
export function LayoutThumb({ layout, blocked = [], className }: { layout: LayoutShape; blocked?: string[]; className?: string }) {
  return (
    <SeatMap
      layout={layout}
      blocked={blocked}
      size="xs"
      front={false}
      className={className}
      cell={({ seat }) => (
        <div className={cn('size-full rounded-[2px]', seat ? 'bg-ink/70' : 'border border-dashed border-muted/40')} />
      )}
    />
  );
}

/** Roll number sized for a seat cell: long numbers split into a small prefix and a bold serial. */
export function RollText({ roll, size }: { roll: string; size: SeatSize }) {
  const m = roll.match(/^(.*?)(\d{2,})$/);
  if (size === 'sm') return <span className="font-mono text-[8px] font-bold">{m ? m[2].slice(-3) : roll.slice(-3)}</span>;
  if (roll.length <= 7 || !m)
    return <span className={cn('max-w-full truncate px-0.5 font-mono font-bold', size === 'lg' ? 'text-[12px]' : 'text-[10.5px]')}>{roll}</span>;
  return (
    <span className="flex max-w-full flex-col items-center font-mono leading-[1.1]">
      <span className="max-w-full truncate px-0.5 text-[7.5px] font-medium opacity-70">{m[1]}</span>
      <span className={cn('font-bold', size === 'lg' ? 'text-[14px]' : 'text-[12px]')}>{m[2]}</span>
    </span>
  );
}

export const isSplitRoll = (roll: string) => roll.length > 7 && /\d{2,}$/.test(roll);

/** Label-only preview used in the layout and room editors. */
export function LabelCell({ info, onClick, interactive }: { info: CellInfo; onClick?: () => void; interactive?: boolean }) {
  const Comp = interactive ? 'button' : 'div';
  return (
    <Comp
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      title={info.seat ? `Seat ${info.seat.label}${interactive ? ' — click to block' : ''}` : interactive ? 'Blocked — click to restore' : 'Blocked'}
      className={cn(
        'flex size-full items-center justify-center rounded-md border text-[10px] font-medium transition',
        info.seat
          ? 'border-line bg-card text-muted shadow-sm'
          : 'border-dashed border-rose-300 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgb(244_63_94/0.12)_3px,rgb(244_63_94/0.12)_6px)] text-rose-400',
        interactive && 'hover:border-ink hover:text-ink',
      )}
    >
      {info.seat ? info.seat.label : '×'}
    </Comp>
  );
}
