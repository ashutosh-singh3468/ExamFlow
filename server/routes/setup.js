import { Router } from 'express';
import { db, getSettings, logActivity, parseJSON } from '../db.js';
import { capacityOf, NUMBERING_FORMATS } from '../../shared/layout.js';
import { HttpError, clean, requireFields, todayISO } from '../util.js';
import { getRooms, getSlot, suggestRooms } from '../services/plans.js';

const router = Router();

/* ---------------------------------------------------------------- layouts */

function layoutInput(body) {
  requireFields(body, ['name', 'rows', 'cols']);
  const kind = body.kind === 'circular' ? 'circular' : 'grid';
  const rows = Math.round(Number(body.rows));
  const cols = Math.round(Number(body.cols));
  const maxRows = kind === 'circular' ? 8 : 40;
  const maxCols = kind === 'circular' ? 60 : 40;
  if (!(rows >= 1 && rows <= maxRows)) throw new HttpError(400, `${kind === 'circular' ? 'Rings' : 'Rows'} must be between 1 and ${maxRows}.`);
  if (!(cols >= (kind === 'circular' ? 3 : 1) && cols <= maxCols))
    throw new HttpError(400, `${kind === 'circular' ? 'Seats per ring' : 'Columns'} must be between ${kind === 'circular' ? 3 : 1} and ${maxCols}.`);
  const numbering = NUMBERING_FORMATS.some((f) => f.value === body.numbering) ? body.numbering : 'row-letter';
  return {
    name: clean(body.name),
    kind,
    rows,
    cols,
    numbering,
    prefix: clean(body.prefix) || '',
    description: clean(body.description),
  };
}

router.get('/layouts', (_req, res) => {
  const layouts = db
    .prepare(
      `SELECT l.*, (SELECT COUNT(*) FROM rooms r WHERE r.layout_id = l.id) AS room_count
       FROM layouts l ORDER BY l.id`,
    )
    .all()
    .map((l) => ({ ...l, capacity: capacityOf(l) }));
  res.json(layouts);
});

router.post('/layouts', (req, res) => {
  const l = layoutInput(req.body);
  const id = db
    .prepare('INSERT INTO layouts (name, kind, rows, cols, numbering, prefix, description) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(l.name, l.kind, l.rows, l.cols, l.numbering, l.prefix, l.description).lastInsertRowid;
  logActivity(req.user, 'Created layout type', l.name);
  res.status(201).json({ id });
});

router.put('/layouts/:id', (req, res) => {
  const l = layoutInput(req.body);
  const r = db
    .prepare('UPDATE layouts SET name = ?, kind = ?, rows = ?, cols = ?, numbering = ?, prefix = ?, description = ? WHERE id = ?')
    .run(l.name, l.kind, l.rows, l.cols, l.numbering, l.prefix, l.description, req.params.id);
  if (!r.changes) throw new HttpError(404, 'Layout not found.');
  logActivity(req.user, 'Updated layout type', l.name);
  res.json({ ok: true });
});

router.delete('/layouts/:id', (req, res) => {
  const used = db.prepare('SELECT COUNT(*) AS n FROM rooms WHERE layout_id = ?').get(req.params.id).n;
  if (used) throw new HttpError(409, `This layout is used by ${used} classroom${used > 1 ? 's' : ''}. Move them to another layout first.`);
  db.prepare('DELETE FROM layouts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ rooms */

function roomInput(body) {
  requireFields(body, ['name', 'layout_id']);
  const layout = db.prepare('SELECT * FROM layouts WHERE id = ?').get(body.layout_id);
  if (!layout) throw new HttpError(400, 'Choose a valid layout type.');
  const blocked = Array.isArray(body.blocked) ? body.blocked.filter((k) => /^\d+-\d+$/.test(k)) : [];
  if (capacityOf(layout, blocked) < 1) throw new HttpError(400, 'A classroom needs at least one usable seat.');
  return {
    name: clean(body.name),
    building: clean(body.building),
    floor: clean(body.floor),
    layout_id: layout.id,
    blocked: JSON.stringify(blocked),
    is_active: body.is_active === false ? 0 : 1,
    notes: clean(body.notes),
  };
}

router.get('/rooms', (_req, res) => {
  const today = todayISO();
  const bookings = db
    .prepare(
      `SELECT sa.room_id, COUNT(DISTINCT p.id) AS n FROM seat_assignments sa
       JOIN plans p ON p.id = sa.plan_id JOIN slots s ON s.id = p.slot_id
       WHERE s.date >= ? GROUP BY sa.room_id`,
    )
    .all(today);
  const byRoom = new Map(bookings.map((b) => [b.room_id, b.n]));
  res.json(getRooms().map((r) => ({ ...r, upcoming_bookings: byRoom.get(r.id) || 0 })));
});

router.post('/rooms', (req, res) => {
  const r = roomInput(req.body);
  if (db.prepare('SELECT 1 FROM rooms WHERE name = ?').get(r.name)) throw new HttpError(409, `A classroom named "${r.name}" already exists.`);
  const id = db
    .prepare('INSERT INTO rooms (name, building, floor, layout_id, blocked_seats, is_active, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(r.name, r.building, r.floor, r.layout_id, r.blocked, r.is_active, r.notes).lastInsertRowid;
  logActivity(req.user, 'Added classroom', r.name);
  res.status(201).json({ id });
});

router.put('/rooms/:id', (req, res) => {
  const r = roomInput(req.body);
  const dup = db.prepare('SELECT id FROM rooms WHERE name = ? AND id != ?').get(r.name, req.params.id);
  if (dup) throw new HttpError(409, `A classroom named "${r.name}" already exists.`);
  const out = db
    .prepare('UPDATE rooms SET name = ?, building = ?, floor = ?, layout_id = ?, blocked_seats = ?, is_active = ?, notes = ? WHERE id = ?')
    .run(r.name, r.building, r.floor, r.layout_id, r.blocked, r.is_active, r.notes, req.params.id);
  if (!out.changes) throw new HttpError(404, 'Classroom not found.');
  logActivity(req.user, 'Updated classroom', r.name);
  res.json({ ok: true });
});

router.patch('/rooms/:id/active', (req, res) => {
  db.prepare('UPDATE rooms SET is_active = ? WHERE id = ?').run(req.body?.is_active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.delete('/rooms/:id', (req, res) => {
  const used = db
    .prepare(
      `SELECT COUNT(DISTINCT p.id) AS n FROM seat_assignments sa JOIN plans p ON p.id = sa.plan_id
       WHERE sa.room_id = ? AND p.status != 'draft'`,
    )
    .get(req.params.id).n;
  if (used)
    throw new HttpError(409, `This classroom is part of ${used} approved plan${used > 1 ? 's' : ''}. Mark it inactive instead.`);
  const room = db.prepare('SELECT name FROM rooms WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  logActivity(req.user, 'Deleted classroom', room?.name);
  res.json({ ok: true });
});

/** Rooms with their spaced capacity for a slot's paper mix, plus a suggested selection. */
router.get('/rooms/for-slot/:slotId', (req, res) => {
  const slot = getSlot(Number(req.params.slotId));
  if (!slot) throw new HttpError(404, 'Exam slot not found.');
  const plan = db.prepare('SELECT * FROM plans WHERE slot_id = ?').get(slot.id);
  const adjacency = String(req.query.adjacency || parseJSON(plan?.options, {}).adjacency || getSettings().adjacency_mode);
  const { total, counts, rooms, suggested } = suggestRooms(slot, plan?.id, adjacency);
  res.json({
    total,
    papers: slot.papers.map((p, i) => ({ ...p, students: counts[i] })),
    rooms,
    suggested,
    current: parseJSON(plan?.room_ids, []),
    plan: plan ? { id: plan.id, status: plan.status, options: parseJSON(plan.options, {}) } : null,
  });
});

/* ---------------------------------------------------------------- courses */

router.get('/courses', (_req, res) => {
  const courses = db.prepare('SELECT * FROM courses ORDER BY code').all();
  const sems = db
    .prepare('SELECT course_id, semester, COUNT(*) AS n FROM students GROUP BY course_id, semester ORDER BY semester')
    .all();
  res.json(
    courses.map((c) => {
      const semesters = sems
        .filter((s) => s.course_id === c.id)
        .map((s) => ({ semester: s.semester, count: s.n }))
        .sort((a, b) => String(a.semester).localeCompare(String(b.semester), undefined, { numeric: true }));
      return { ...c, student_count: semesters.reduce((n, s) => n + s.count, 0), semesters };
    }),
  );
});

function courseInput(body) {
  requireFields(body, ['code', 'name']);
  return { code: clean(body.code).toUpperCase(), name: clean(body.name), department: clean(body.department) };
}

router.post('/courses', (req, res) => {
  const c = courseInput(req.body);
  if (db.prepare('SELECT 1 FROM courses WHERE code = ?').get(c.code)) throw new HttpError(409, `Course code ${c.code} already exists.`);
  const id = db.prepare('INSERT INTO courses (code, name, department) VALUES (?, ?, ?)').run(c.code, c.name, c.department).lastInsertRowid;
  logActivity(req.user, 'Added course', `${c.code} — ${c.name}`);
  res.status(201).json({ id });
});

router.put('/courses/:id', (req, res) => {
  const c = courseInput(req.body);
  const dup = db.prepare('SELECT id FROM courses WHERE code = ? AND id != ?').get(c.code, req.params.id);
  if (dup) throw new HttpError(409, `Course code ${c.code} already exists.`);
  db.prepare('UPDATE courses SET code = ?, name = ?, department = ? WHERE id = ?').run(c.code, c.name, c.department, req.params.id);
  res.json({ ok: true });
});

router.delete('/courses/:id', (req, res) => {
  const inSlots = db.prepare('SELECT COUNT(*) AS n FROM slot_papers WHERE course_id = ?').get(req.params.id).n;
  if (inSlots) throw new HttpError(409, `This course is scheduled in ${inSlots} exam paper${inSlots > 1 ? 's' : ''}. Remove it from the exam schedule first.`);
  const c = db.prepare('SELECT code FROM courses WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
  logActivity(req.user, 'Deleted course', c?.code);
  res.json({ ok: true });
});

export default router;
