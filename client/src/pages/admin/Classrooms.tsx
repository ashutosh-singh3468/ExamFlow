import { Building2, CircleDot, Grid3x3, LayoutTemplate, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { http, useAction, useApi, errorMessage } from '@/lib/api';
import { capacityOf, NUMBERING_FORMATS } from '@/lib/layout';
import type { Layout, LayoutKind, Room } from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  PageLoader,
  SearchInput,
  Segmented,
  Select,
  Switch,
  Tabs,
  Textarea,
  cn,
} from '@/components/ui';
import { Menu, MenuDivider, MenuItem, Modal, useConfirm, useToast } from '@/components/overlays';
import { LabelCell, LayoutThumb, SeatMap } from '@/components/SeatMap';
import { plural } from '@/lib/format';

/* ------------------------------------------------------------ room editor */

interface RoomForm {
  id?: number;
  name: string;
  building: string;
  floor: string;
  layout_id: number | '';
  blocked: string[];
  is_active: boolean;
  notes: string;
}

function RoomEditor({ open, onClose, room, layouts, buildings }: { open: boolean; onClose: () => void; room: Room | null; layouts: Layout[]; buildings: string[] }) {
  const toast = useToast();
  const [f, setF] = useState<RoomForm>({ name: '', building: '', floor: '', layout_id: '', blocked: [], is_active: true, notes: '' });
  useEffect(() => {
    if (!open) return;
    setF(
      room
        ? { id: room.id, name: room.name, building: room.building || '', floor: room.floor || '', layout_id: room.layout_id, blocked: room.blocked, is_active: room.is_active, notes: room.notes || '' }
        : { name: '', building: buildings[0] || '', floor: '', layout_id: layouts[0]?.id ?? '', blocked: [], is_active: true, notes: '' },
    );
  }, [open, room, layouts, buildings]);
  const layout = layouts.find((l) => l.id === f.layout_id);
  const save = useAction((body: RoomForm) => (body.id ? http.put(`/rooms/${body.id}`, body) : http.post('/rooms', body)));
  const toggle = (key: string) => setF((s) => ({ ...s, blocked: s.blocked.includes(key) ? s.blocked.filter((k) => k !== key) : [...s.blocked, key] }));
  const capacity = layout ? capacityOf(layout, f.blocked) : 0;

  const submit = () =>
    save.mutate(f, {
      onSuccess: () => {
        toast.success(room ? 'Classroom updated' : 'Classroom added', `${f.name} · ${plural(capacity, 'seat')}`);
        onClose();
      },
      onError: (e) => toast.error('Could not save classroom', e.message),
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={room ? `Edit ${room.name}` : 'Add a classroom'}
      description="Pick a layout type, then click any seat on the map to block it (broken bench, pillar, invigilator desk…)."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={save.isPending} disabled={!f.name || !f.layout_id}>
            {room ? 'Save changes' : 'Add classroom'}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <Field label="Room name / number" required>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. A-101" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Building">
              <Input list="buildings" value={f.building} onChange={(e) => setF({ ...f, building: e.target.value })} placeholder="Block A" />
              <datalist id="buildings">
                {buildings.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
            <Field label="Floor">
              <Input value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} placeholder="Ground" />
            </Field>
          </div>
          <Field label="Layout type" required hint={layout ? `${layout.kind === 'circular' ? `${layout.rows} rings × ${layout.cols} seats` : `${layout.rows} rows × ${layout.cols} seats`}` : undefined}>
            <Select value={f.layout_id} onChange={(e) => setF({ ...f, layout_id: Number(e.target.value), blocked: [] })}>
              {layouts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Anything invigilators should know" rows={2} />
          </Field>
          <div className="rounded-xl border border-line p-4">
            <Switch checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Available for exams" description="Inactive rooms are never used for seating." />
          </div>
        </div>
        <div className="flex min-w-0 flex-col rounded-xl border border-line bg-subtle/40">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="text-[13px]">
              <span className="font-semibold tabular">{capacity}</span> <span className="text-muted">usable seats</span>
              {f.blocked.length > 0 && <span className="text-muted"> · {f.blocked.length} blocked</span>}
            </div>
            {f.blocked.length > 0 && (
              <Button size="xs" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setF({ ...f, blocked: [] })}>
                Unblock all
              </Button>
            )}
          </div>
          <div className="flex min-h-[320px] flex-1 overflow-auto p-5 scrollbar-thin">
            {layout ? (
              <SeatMap layout={layout} blocked={f.blocked} size="sm" cell={(info) => <LabelCell info={info} interactive onClick={() => toggle(info.key)} />} />
            ) : (
              <span className="text-sm text-muted">Create a layout type first.</span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- layout editor */

interface LayoutForm {
  id?: number;
  name: string;
  kind: LayoutKind;
  rows: number;
  cols: number;
  numbering: string;
  prefix: string;
  description: string;
}

function LayoutEditor({ open, onClose, layout }: { open: boolean; onClose: () => void; layout: Layout | null }) {
  const toast = useToast();
  const [f, setF] = useState<LayoutForm>({ name: '', kind: 'grid', rows: 6, cols: 8, numbering: 'row-letter', prefix: '', description: '' });
  useEffect(() => {
    if (!open) return;
    setF(
      layout
        ? { id: layout.id, name: layout.name, kind: layout.kind, rows: layout.rows, cols: layout.cols, numbering: layout.numbering, prefix: layout.prefix, description: layout.description || '' }
        : { name: '', kind: 'grid', rows: 6, cols: 8, numbering: 'row-letter', prefix: '', description: '' },
    );
  }, [open, layout]);
  const save = useAction((body: LayoutForm) => (body.id ? http.put(`/layouts/${body.id}`, body) : http.post('/layouts', body)));
  const valid = f.name && f.rows > 0 && f.cols > 0 && (f.kind === 'grid' ? f.rows <= 40 && f.cols <= 40 : f.rows <= 8 && f.cols >= 3 && f.cols <= 60);
  const preview = { ...f, rows: Math.min(Number(f.rows) || 0, 40), cols: Math.min(Number(f.cols) || 0, 60) };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={layout ? `Edit ${layout.name}` : 'New layout type'}
      description="Layout types are reusable seating templates. Every classroom uses one."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid}
            loading={save.isPending}
            onClick={() =>
              save.mutate(f, {
                onSuccess: () => {
                  toast.success(layout ? 'Layout updated' : 'Layout created');
                  onClose();
                },
                onError: (e) => toast.error('Could not save layout', e.message),
              })
            }
          >
            {layout ? 'Save changes' : 'Create layout'}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <Field label="Name" required>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Type 1 — Standard classroom" />
          </Field>
          <Field label="Arrangement">
            <Segmented
              value={f.kind}
              onChange={(kind) => setF({ ...f, kind, ...(kind === 'circular' ? { rows: Math.min(f.rows, 3), cols: Math.max(f.cols, 12) } : {}) })}
              items={[
                { value: 'grid', label: 'Rows & columns', icon: <Grid3x3 className="size-4" /> },
                { value: 'circular', label: 'Circular', icon: <CircleDot className="size-4" /> },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={f.kind === 'circular' ? 'Rings' : 'Rows'} hint={f.kind === 'circular' ? '1 – 8' : '1 – 40'}>
              <Input type="number" min={1} max={f.kind === 'circular' ? 8 : 40} value={f.rows} onChange={(e) => setF({ ...f, rows: Number(e.target.value) })} />
            </Field>
            <Field label={f.kind === 'circular' ? 'Seats per ring' : 'Seats per row'} hint={f.kind === 'circular' ? '3 – 60' : '1 – 40'}>
              <Input type="number" min={1} max={60} value={f.cols} onChange={(e) => setF({ ...f, cols: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Seat numbering">
            <Select value={f.numbering} onChange={(e) => setF({ ...f, numbering: e.target.value })}>
              {NUMBERING_FORMATS.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label} — {n.example}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Seat prefix" hint="Optional text before every seat number, e.g. “S-”.">
            <Input value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} maxLength={6} />
          </Field>
          <Field label="Description">
            <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Where is this layout used?" />
          </Field>
        </div>
        <div className="flex min-w-0 flex-col rounded-xl border border-line bg-subtle/40">
          <div className="border-b border-line px-4 py-3 text-[13px]">
            <span className="font-semibold tabular">{valid ? capacityOf(preview) : 0}</span> <span className="text-muted">seats · live preview</span>
          </div>
          <div className="flex min-h-[340px] flex-1 overflow-auto p-5 scrollbar-thin">
            {valid ? <SeatMap layout={preview} size="sm" cell={(info) => <LabelCell info={info} />} /> : <span className="text-sm text-muted">Enter valid dimensions to see a preview.</span>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------- page */

export default function Classrooms() {
  const rooms = useApi<Room[]>('/rooms');
  const layouts = useApi<Layout[]>('/layouts');
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'rooms' | 'layouts'>(params.get('tab') === 'layouts' ? 'layouts' : 'rooms');
  const [q, setQ] = useState('');
  const [building, setBuilding] = useState('all');
  const [editRoom, setEditRoom] = useState<Room | null | undefined>(undefined);
  const [editLayout, setEditLayout] = useState<Layout | null | undefined>(undefined);
  const toast = useToast();
  const confirm = useConfirm();
  const setActive = useAction(({ id, is_active }: { id: number; is_active: boolean }) => http.patch(`/rooms/${id}/active`, { is_active }));
  const delRoom = useAction((id: number) => http.del(`/rooms/${id}`));
  const delLayout = useAction((id: number) => http.del(`/layouts/${id}`));

  useEffect(() => {
    if (params.get('new')) {
      setEditRoom(null);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const buildings = useMemo(() => [...new Set((rooms.data || []).map((r) => r.building).filter(Boolean) as string[])].sort(), [rooms.data]);
  const filtered = (rooms.data || []).filter(
    (r) => (building === 'all' || r.building === building) && `${r.name} ${r.building} ${r.layout.name}`.toLowerCase().includes(q.toLowerCase()),
  );
  const totalSeats = (rooms.data || []).filter((r) => r.is_active).reduce((n, r) => n + r.capacity, 0);

  if (rooms.isLoading || layouts.isLoading) return <PageLoader />;
  if (rooms.error) return <ErrorState error={rooms.error} onRetry={() => rooms.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Classrooms"
        description={`${plural(rooms.data!.filter((r) => r.is_active).length, 'active room')} · ${totalSeats.toLocaleString()} exam seats available`}
        actions={
          tab === 'rooms' ? (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditRoom(null)} disabled={!layouts.data?.length}>
              Add classroom
            </Button>
          ) : (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditLayout(null)}>
              New layout type
            </Button>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-5"
        items={[
          { value: 'rooms', label: 'Rooms', count: rooms.data!.length, icon: <Building2 className="size-4" /> },
          { value: 'layouts', label: 'Layout types', count: layouts.data!.length, icon: <LayoutTemplate className="size-4" /> },
        ]}
      />

      {tab === 'rooms' && (
        <>
          {!layouts.data!.length ? (
            <Card>
              <EmptyState
                icon={<LayoutTemplate className="size-6" />}
                title="Create a layout type first"
                description="Layout types describe how seats are arranged (e.g. 6 × 8 grid or a circular hall). Classrooms are built from them."
                action={<Button variant="primary" onClick={() => { setTab('layouts'); setEditLayout(null); }}>New layout type</Button>}
              />
            </Card>
          ) : !rooms.data!.length ? (
            <Card>
              <EmptyState
                icon={<Building2 className="size-6" />}
                title="No classrooms yet"
                description="Add the rooms that can be used for examinations. You can block individual seats on each room’s map."
                action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditRoom(null)}>Add classroom</Button>}
              />
            </Card>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <SearchInput value={q} onChange={setQ} placeholder="Search rooms…" className="sm:w-72" />
                {buildings.length > 1 && (
                  <Select value={building} onChange={(e) => setBuilding(e.target.value)} className="sm:w-56">
                    <option value="all">All buildings</option>
                    {buildings.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </Select>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((r) => (
                  <Card key={r.id} className={cn('group flex flex-col transition hover:shadow-pop', !r.is_active && 'opacity-70')}>
                    <div className="flex items-start justify-between gap-2 px-5 pt-4">
                      <button className="min-w-0 text-left" onClick={() => setEditRoom(r)}>
                        <div className="flex items-center gap-2">
                          <span className="truncate font-display text-[21px] font-semibold tracking-[-0.01em]">{r.name}</span>
                          {!r.is_active && <Badge>Inactive</Badge>}
                        </div>
                        <div className="truncate text-[13px] text-muted">{[r.building, r.floor && `${r.floor} floor`].filter(Boolean).join(' · ') || 'No building set'}</div>
                      </button>
                      <Menu
                        trigger={({ onClick }) => (
                          <button onClick={onClick} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-fg" aria-label="Room actions">
                            <MoreHorizontal className="size-4" />
                          </button>
                        )}
                      >
                        <MenuItem icon={<Pencil className="size-4" />} onClick={() => setEditRoom(r)}>
                          Edit room & seats
                        </MenuItem>
                        <MenuDivider />
                        <MenuItem
                          icon={<Trash2 className="size-4" />}
                          danger
                          onClick={async () => {
                            if (!(await confirm({ title: `Delete ${r.name}?`, message: 'The room is removed from draft plans too. This cannot be undone.', confirmLabel: 'Delete room', tone: 'danger' }))) return;
                            delRoom.mutate(r.id, { onSuccess: () => toast.success('Room deleted'), onError: (e) => toast.error('Cannot delete room', e.message) });
                          }}
                        >
                          Delete room
                        </MenuItem>
                      </Menu>
                    </div>
                    <button onClick={() => setEditRoom(r)} className="flex flex-1 items-center gap-5 px-5 py-4 text-left">
                      <div className="flex h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-subtle/70 p-2">
                        <LayoutThumb layout={r.layout} blocked={r.blocked} />
                      </div>
                      <dl className="min-w-0 space-y-1.5 text-[13px]">
                        <div>
                          <dt className="sr-only">Capacity</dt>
                          <dd>
                            <span className="font-display text-[32px] font-semibold leading-none tracking-[-0.02em] tabular">{r.capacity}</span> <span className="text-muted">seats</span>
                          </dd>
                        </div>
                        <dd className="truncate text-muted" title={r.layout.name}>{r.layout.name}</dd>
                        {r.blocked.length > 0 && <dd className="text-xs text-rose-600">{r.blocked.length} seat{r.blocked.length > 1 ? 's' : ''} blocked</dd>}
                      </dl>
                    </button>
                    <div className="flex items-center justify-between border-t border-line px-5 py-3">
                      <span className="text-xs text-muted">{r.upcoming_bookings ? `Booked for ${plural(r.upcoming_bookings, 'upcoming exam')}` : 'No upcoming bookings'}</span>
                      <Switch
                        checked={r.is_active}
                        onChange={(v) => setActive.mutate({ id: r.id, is_active: v }, { onSuccess: () => toast.success(v ? `${r.name} is available` : `${r.name} marked inactive`) })}
                      />
                    </div>
                  </Card>
                ))}
              </div>
              {!filtered.length && <EmptyState title="No rooms match" description="Try a different search or building." />}
            </>
          )}
        </>
      )}

      {tab === 'layouts' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {layouts.data!.map((l) => (
            <Card key={l.id} className="flex flex-col">
              <div className="flex h-44 overflow-hidden rounded-t-xl border-b border-line bg-subtle/50 p-4">
                <LayoutThumb layout={l} />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{l.name}</div>
                    <div className="mt-0.5 text-[13px] text-muted">
                      {l.kind === 'circular' ? `${l.rows} rings × ${l.cols} seats` : `${l.rows} rows × ${l.cols} seats`} · {l.capacity} seats
                    </div>
                  </div>
                  <Badge tone={l.kind === 'circular' ? 'violet' : 'indigo'}>{l.kind === 'circular' ? 'Circular' : 'Grid'}</Badge>
                </div>
                {l.description && <p className="mt-2 text-[13px] text-muted">{l.description}</p>}
                <div className="mt-3 text-xs text-muted">
                  Numbering: {NUMBERING_FORMATS.find((n) => n.value === l.numbering)?.example} · Used by {plural(l.room_count || 0, 'room')}
                </div>
                <div className="mt-auto flex gap-2 pt-4">
                  <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditLayout(l)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="size-3.5" />}
                    onClick={async () => {
                      if (!(await confirm({ title: `Delete ${l.name}?`, confirmLabel: 'Delete', tone: 'danger' }))) return;
                      delLayout.mutate(l.id, { onSuccess: () => toast.success('Layout deleted'), onError: (e) => toast.error('Cannot delete layout', errorMessage(e)) });
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          <button
            onClick={() => setEditLayout(null)}
            className="flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-muted transition hover:border-ink hover:text-ink"
          >
            <Plus className="size-6" />
            <span className="text-[14px] font-medium">New layout type</span>
          </button>
        </div>
      )}

      <RoomEditor open={editRoom !== undefined} onClose={() => setEditRoom(undefined)} room={editRoom ?? null} layouts={layouts.data || []} buildings={buildings} />
      <LayoutEditor open={editLayout !== undefined} onClose={() => setEditLayout(undefined)} layout={editLayout ?? null} />
    </div>
  );
}
