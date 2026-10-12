import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { http, useAction } from '@/lib/api';
import { downloadWorkbook, normalizeHeader, readSheet, type Sheet } from '@/lib/excel';
import { Badge, Button, Callout, Select, Stepper, cn } from './ui';
import { Modal, useToast } from './overlays';

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
  example?: string;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  courses_created?: string[];
  errors: { row: number; message: string }[];
}

export function ImportWizard({
  open,
  onClose,
  title,
  entity,
  fields,
  endpoint,
  templateName,
  templateRows,
  uniqueKey,
  modes,
  notes,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  entity: string;
  fields: ImportField[];
  endpoint: string;
  templateName: string;
  templateRows: string[][];
  uniqueKey: string;
  modes?: { value: string; label: string; description: string; danger?: boolean }[];
  notes?: React.ReactNode;
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [mode, setMode] = useState(modes?.[0]?.value || 'upsert');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [drag, setDrag] = useState(false);
  const [readError, setReadError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const run = useAction((body: { rows: Record<string, string | number>[]; mode: string }) => http.post<ImportResult>(endpoint, body));

  useEffect(() => {
    if (open) {
      setStep(0);
      setSheet(null);
      setResult(null);
      setReadError('');
      setMode(modes?.[0]?.value || 'upsert');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async (file: File) => {
    setReadError('');
    try {
      const s = await readSheet(file);
      if (!s.rows.length) throw new Error('No data rows were found in the first sheet.');
      const auto: Record<string, number> = {};
      const norm = s.headers.map(normalizeHeader);
      for (const f of fields) {
        const aliases = [f.key, f.label, ...f.aliases].map(normalizeHeader);
        let idx = norm.findIndex((h) => aliases.includes(h));
        if (idx < 0) idx = norm.findIndex((h) => aliases.some((a) => a.length > 3 && h.includes(a)));
        if (idx >= 0 && !Object.values(auto).includes(idx)) auto[f.key] = idx;
      }
      setSheet(s);
      setFileName(file.name);
      setMapping(auto);
      setStep(1);
    } catch (e) {
      setReadError(e instanceof Error ? e.message : 'This file could not be read.');
    }
  };

  const mapped = useMemo(() => {
    if (!sheet) return [];
    return sheet.rows.map((r) => {
      const o: Record<string, string | number> = { _row: r._row };
      for (const f of fields) o[f.key] = mapping[f.key] !== undefined ? r.cells[mapping[f.key]] : '';
      return o;
    });
  }, [sheet, mapping, fields]);

  const checks = useMemo(() => {
    const missingRequired = mapped.filter((r) => fields.some((f) => f.required && !String(r[f.key] ?? '').trim())).length;
    const seen = new Map<string, number>();
    let dupes = 0;
    for (const r of mapped) {
      const k = String(r[uniqueKey] ?? '').trim().toLowerCase();
      if (!k) continue;
      seen.set(k, (seen.get(k) || 0) + 1);
      if (seen.get(k) === 2) dupes++;
    }
    return { missingRequired, dupes, ready: mapped.length - missingRequired };
  }, [mapped, fields, uniqueKey]);

  const unmappedRequired = fields.filter((f) => f.required && mapping[f.key] === undefined);
  const currentMode = modes?.find((m) => m.value === mode);

  const doImport = () =>
    run.mutate(
      { rows: mapped, mode },
      {
        onSuccess: (res) => {
          setResult(res);
          setStep(2);
          toast.success(`${entity} imported`, `${res.created} added, ${res.updated} updated`);
        },
        onError: (e) => toast.error('Import failed', e.message),
      },
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      footer={
        step === 0 ? (
          <Button onClick={onClose}>Cancel</Button>
        ) : step === 1 ? (
          <>
            <Button variant="ghost" onClick={() => setStep(0)}>
              Choose another file
            </Button>
            <Button
              variant={currentMode?.danger ? 'danger' : 'primary'}
              disabled={!!unmappedRequired.length || !checks.ready}
              loading={run.isPending}
              onClick={doImport}
            >
              Import {checks.ready.toLocaleString()} {entity.toLowerCase()}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        )
      }
    >
      <Stepper className="mb-6" current={step} steps={[{ label: 'Upload file' }, { label: 'Match columns' }, { label: 'Finished' }]} />

      {step === 0 && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) load(f);
            }}
            onClick={() => input.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition',
              drag ? 'border-ink bg-mark-soft shadow-ink-sm' : 'border-line hover:border-ink hover:bg-paper',
            )}
          >
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl border border-ink bg-mark text-ink shadow-ink-sm">
              <UploadCloud className="size-6" />
            </div>
            <div className="text-[15px] font-semibold">Drop your Excel or CSV file here</div>
            <div className="mt-1 text-[13px] text-muted">or click to browse · .xlsx, .xls, .csv</div>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.xls,.csv,.ods"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) load(f);
                e.target.value = '';
              }}
            />
          </div>
          {readError && <Callout tone="error" icon={<AlertTriangle className="size-4" />}>{readError}</Callout>}
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-subtle/40 p-4 sm:flex-row sm:items-center">
            <FileSpreadsheet className="size-8 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1 text-[13px]">
              <div className="font-medium">Not sure about the format?</div>
              <div className="text-muted">
                Columns: {fields.map((f) => f.label + (f.required ? '*' : '')).join(', ')}. Column names don’t need to match exactly — you can match them in the next step.
              </div>
            </div>
            <Button
              size="sm"
              icon={<Download className="size-4" />}
              onClick={(e) => {
                e.stopPropagation();
                downloadWorkbook(templateName, [{ name: entity, rows: [fields.map((f) => f.label), ...templateRows] }]);
              }}
            >
              Download template
            </Button>
          </div>
          {notes}
        </div>
      )}

      {step === 1 && sheet && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-[13px]">
            <FileSpreadsheet className="size-5 text-emerald-600" />
            <span className="min-w-0 flex-1 truncate font-medium">{fileName}</span>
            <span className="text-muted">
              {sheet.rows.length.toLocaleString()} rows · sheet “{sheet.sheetName}”
            </span>
          </div>

          <div>
            <div className="mb-2 text-[13px] font-semibold">Match your columns</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => {
                const idx = mapping[f.key];
                const sample = idx !== undefined ? sheet.rows.slice(0, 3).map((r) => r.cells[idx]).filter(Boolean).join(', ') : '';
                return (
                  <div key={f.key} className="rounded-xl border border-line p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[13px] font-medium">
                        {f.label}
                        {f.required && <span className="text-rose-500">*</span>}
                      </span>
                      {idx !== undefined ? <CheckCircle2 className="size-4 text-emerald-500" /> : f.required ? <Badge tone="red">Required</Badge> : <Badge>Optional</Badge>}
                    </div>
                    <Select
                      value={idx ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMapping((m) => {
                          const n = { ...m };
                          if (v === '') delete n[f.key];
                          else n[f.key] = Number(v);
                          return n;
                        });
                      }}
                    >
                      <option value="">— Not in file —</option>
                      {sheet.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </Select>
                    <div className="mt-1.5 truncate text-xs text-muted">{sample ? `e.g. ${sample}` : f.example ? `Expected like: ${f.example}` : ' '}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-[13px]">
            <Badge tone="green" icon={<CheckCircle2 className="size-3" />}>{checks.ready.toLocaleString()} ready</Badge>
            {checks.missingRequired > 0 && <Badge tone="amber">{checks.missingRequired} missing required values (skipped)</Badge>}
            {checks.dupes > 0 && <Badge tone="amber">{checks.dupes} duplicates in file (last one wins)</Badge>}
          </div>

          {!!unmappedRequired.length && (
            <Callout tone="warning" icon={<AlertTriangle className="size-4" />}>
              Choose a column for: {unmappedRequired.map((f) => f.label).join(', ')}
            </Callout>
          )}

          <div className="overflow-hidden rounded-xl border border-line">
            <div className="border-b border-line bg-subtle/60 px-3 py-2 text-xs font-medium text-muted">Preview (first 5 rows)</div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    {fields.map((f) => (
                      <th key={f.key} className="whitespace-nowrap border-b border-line px-3 py-2 text-left text-xs font-medium text-muted">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mapped.slice(0, 5).map((r) => (
                    <tr key={String(r._row)}>
                      {fields.map((f) => (
                        <td key={f.key} className={cn('whitespace-nowrap border-b border-line px-3 py-2', f.required && !r[f.key] && 'bg-rose-50')}>
                          {String(r[f.key] ?? '') || <span className="text-muted">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {modes && (
            <div className="grid gap-2 sm:grid-cols-2">
              {modes.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition',
                    mode === m.value ? (m.danger ? 'border-rose-400 bg-rose-50' : 'border-ink bg-mark-soft shadow-ink-sm') : 'border-line hover:bg-subtle',
                  )}
                >
                  <div className="text-[13px] font-semibold">{m.label}</div>
                  <div className="mt-0.5 text-xs text-muted">{m.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && result && (
        <div className="space-y-4">
          <div className="flex flex-col items-center py-4 text-center">
            <div className="mb-3 flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-7" />
            </div>
            <div className="text-lg font-semibold">Import complete</div>
            <div className="mt-1 text-[14px] text-muted">
              {result.created.toLocaleString()} added · {result.updated.toLocaleString()} updated · {result.skipped.toLocaleString()} skipped
            </div>
          </div>
          {!!result.courses_created?.length && (
            <Callout tone="info" title="New courses created">
              {result.courses_created.join(', ')} — you can rename them on the Courses page.
            </Callout>
          )}
          {!!result.errors.length && (
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="flex items-center gap-2 border-b border-line bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-900">
                <X className="size-4" /> {result.errors.length} row(s) were skipped
              </div>
              <ul className="max-h-48 divide-y divide-line overflow-y-auto text-[13px] scrollbar-thin">
                {result.errors.slice(0, 100).map((e, i) => (
                  <li key={i} className="flex gap-3 px-3 py-2">
                    <span className="w-16 shrink-0 text-muted">Row {e.row}</span>
                    <span>{e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
