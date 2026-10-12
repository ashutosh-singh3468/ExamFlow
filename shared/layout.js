// Seat geometry shared by the API (seating generator, PDFs) and the web client
// (layout previews, seat maps). Keep this file dependency-free.

export const NUMBERING_FORMATS = [
  { value: 'row-letter', label: 'Row letter + seat', example: 'A1, A2, B1…' },
  { value: 'sequential', label: 'Sequential (row by row)', example: '1, 2, 3…' },
  { value: 'column-wise', label: 'Sequential (column by column)', example: '1, 2, 3… down columns' },
  { value: 'row-col', label: 'Row & column', example: 'R1-C1, R1-C2…' },
];

export const ADJACENCY_MODES = [
  { value: 'side', label: 'Side by side', hint: 'Left and right neighbours must differ' },
  { value: 'cross', label: 'Side + front/back', hint: 'Left, right, front and back neighbours must differ' },
  { value: 'all', label: 'All around (strict)', hint: 'Diagonal neighbours must differ too' },
];

export function rowLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export const seatKey = (r, c) => `${r}-${c}`;

/**
 * Build the ordered list of usable seats for a layout.
 * @param {{kind:string, rows:number, cols:number, numbering?:string, prefix?:string}} layout
 * @param {string[]} blocked seat keys ("r-c") that are unusable (pillars, broken benches…)
 * @returns {{r:number,c:number,key:string,label:string,order:number}[]} seats in numbering order
 */
export function buildSeats(layout, blocked = []) {
  const rows = Math.max(0, Number(layout.rows) || 0);
  const cols = Math.max(0, Number(layout.cols) || 0);
  const numbering = layout.numbering || 'row-letter';
  const prefix = layout.prefix || '';
  const blockedSet = new Set(blocked);
  const coords = [];
  if (numbering === 'column-wise') {
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) coords.push([r, c]);
  } else {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) coords.push([r, c]);
  }
  const seats = [];
  let n = 0;
  for (const [r, c] of coords) {
    const key = seatKey(r, c);
    if (blockedSet.has(key)) continue;
    n++;
    let label;
    switch (numbering) {
      case 'sequential':
      case 'column-wise':
        label = String(n);
        break;
      case 'row-col':
        label = `R${r + 1}-C${c + 1}`;
        break;
      default:
        label = `${rowLetter(r)}${c + 1}`;
    }
    seats.push({ r, c, key, label: prefix + label, order: n });
  }
  return seats;
}

export function capacityOf(layout, blocked = []) {
  const rows = Number(layout.rows) || 0;
  const cols = Number(layout.cols) || 0;
  const inBounds = new Set(
    blocked.filter((k) => {
      const [r, c] = k.split('-').map(Number);
      return r >= 0 && r < rows && c >= 0 && c < cols;
    }),
  );
  return rows * cols - inBounds.size;
}

/**
 * Neighbouring seat coordinates for adjacency checks.
 * Grid layouts use straight rows/columns. Circular layouts treat rows as rings and
 * columns as positions around the ring (positions wrap around).
 */
export function neighborCoords(layout, r, c, mode = 'cross') {
  const rows = Number(layout.rows);
  const cols = Number(layout.cols);
  const circular = layout.kind === 'circular';
  const out = [];
  const push = (rr, cc) => {
    if (rr < 0 || rr >= rows) return;
    if (circular) cc = ((cc % cols) + cols) % cols;
    else if (cc < 0 || cc >= cols) return;
    if (rr === r && cc === c) return;
    if (!out.some(([a, b]) => a === rr && b === cc)) out.push([rr, cc]);
  };
  push(r, c - 1);
  push(r, c + 1);
  if (mode === 'cross' || mode === 'all') {
    push(r - 1, c);
    push(r + 1, c);
  }
  if (mode === 'all') {
    push(r - 1, c - 1);
    push(r - 1, c + 1);
    push(r + 1, c - 1);
    push(r + 1, c + 1);
  }
  return out;
}

/** Unit-circle positions for circular layouts (ring 0 is the innermost ring). */
export function circularPosition(r, c, rows, cols) {
  const angle = (2 * Math.PI * c) / cols - Math.PI / 2;
  const radius = rows <= 1 ? 1 : 0.45 + (0.55 * r) / (rows - 1);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, angle };
}
