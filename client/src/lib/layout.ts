import * as shared from '@shared/layout.js';
import type { Adjacency, LayoutShape, Seat } from './types';

export const NUMBERING_FORMATS = shared.NUMBERING_FORMATS as { value: string; label: string; example: string }[];
export const ADJACENCY_MODES = shared.ADJACENCY_MODES as { value: Adjacency; label: string; hint: string }[];

export const buildSeats = (layout: LayoutShape, blocked: string[] = []): Seat[] => shared.buildSeats(layout, blocked);
export const capacityOf = (layout: LayoutShape, blocked: string[] = []): number => shared.capacityOf(layout, blocked);
export const neighborCoords = (layout: LayoutShape, r: number, c: number, mode: Adjacency): [number, number][] =>
  shared.neighborCoords(layout, r, c, mode) as [number, number][];
export const circularPosition = (r: number, c: number, rows: number, cols: number) =>
  shared.circularPosition(r, c, rows, cols) as { x: number; y: number; angle: number };
export const rowLetter = (i: number): string => shared.rowLetter(i);
