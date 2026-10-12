export interface Sheet {
  sheetName: string;
  headers: string[];
  rows: { _row: number; cells: string[] }[];
}

export async function readSheet(file: File): Promise<Sheet> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, blankrows: false });
  let h = 0;
  for (let i = 0; i < Math.min(10, matrix.length); i++) {
    if (matrix[i].filter((v) => String(v ?? '').trim()).length >= 2) {
      h = i;
      break;
    }
  }
  const headerRow = matrix[h] || [];
  const width = Math.max(headerRow.length, ...matrix.slice(h + 1, h + 50).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => String(headerRow[i] ?? '').trim() || `Column ${i + 1}`);
  const rows = matrix
    .slice(h + 1)
    .map((r, idx) => ({ _row: h + idx + 2, cells: headers.map((_, i) => String(r[i] ?? '').trim()) }))
    .filter((r) => r.cells.some(Boolean));
  return { sheetName, headers, rows };
}

export async function downloadWorkbook(filename: string, sheets: { name: string; rows: (string | number | null)[][] }[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws['!cols'] = (s.rows[0] || []).map((_, i) => ({
      wch: Math.min(40, Math.max(10, ...s.rows.slice(0, 200).map((r) => String(r[i] ?? '').length + 2))),
    }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export const normalizeHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
