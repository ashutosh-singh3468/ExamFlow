import { db, getSettings, logActivity, parseJSON } from '../db.js';
import { buildSeats, capacityOf } from '../../shared/layout.js';
import { generateSeating, prepareRoom, roomConflicts } from './seating.js';
import { assignInvigilators, requiredInvigilators, teacherContext } from './invigilation.js';
import { HttpError, endTime, fmtDate, fmtTime12, naturalCompare, paperShort, slotsOverlap } from '../util.js';

export const ROOM_SQL = `
  SELECT r.*, l.name AS layout_name, l.kind, l.rows, l.cols, l.numbering, l.prefix
  FROM rooms r JOIN layouts l ON l.id = r.layout_id`;

export function roomRecord(row) {
  const blocked = parseJSON(row.blocked_seats, []);
  const layout = {
    id: row.layout_id,
    name: row.layout_name,
    kind: row.kind,
    rows: row.rows,
    cols: row.cols,
    numbering: row.numbering,
    prefix: row.prefix,
  };
  return {
    id: row.id,
    name: row.name,
    building: row.building,
    floor: row.floor,
    notes: row.notes,
    is_active: !!row.is_active,
    layout_id: row.layout_id,
    layout,
    blocked,
    capacity: capacityOf(layout, blocked),
  };
}

export function getRooms(ids) {
  if (ids) {
    if (!ids.length) return [];
    const rows = db.prepare(`${ROOM_SQL} WHERE r.id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    const byId = new Map(rows.map((r) => [r.id, roomRecord(r)]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }
  return db.prepare(`${ROOM_SQL} ORDER BY r.building, r.name`).all().map(roomRecord);
}

const paperStudentCount = db.prepare(
  `SELECT COUNT(*) AS n FROM students WHERE course_id = ? AND (? IS NULL OR semester = ?)`,
);

export function getPapers(slotId) {
  const papers = db
    .prepare(
      `SELECT sp.*, c.code AS course_code, c.name AS course_name, c.department
       FROM slot_papers sp JOIN courses c ON c.id = sp.course_id
       WHERE sp.slot_id = ? ORDER BY sp.id`,
    )
    .all(slotId);
  return papers.map((p, i) => ({
    ...p,
    color: i,
    short: paperShort(p),
    student_count: paperStudentCount.get(p.course_id, p.semester, p.semester).n,
  }));
}

export function getSlot(slotId) {
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
  if (!slot) return null;
  return { ...slot, end_time: endTime(slot), papers: getPapers(slotId) };
}

const studentsOfPaper = db.prepare(
  `SELECT id, roll_no, name, semester, course_id FROM students WHERE course_id = ? AND (? IS NULL OR semester = ?)`,
);

export function studentsForPapers(papers) {
  const seen = new Set();
  return papers.map((p) => {
    const list = studentsOfPaper.all(p.course_id, p.semester, p.semester).filter((s) => !seen.has(s.id));
    list.forEach((s) => seen.add(s.id));
    list.sort((a, b) => naturalCompare(a.roll_no, b.roll_no));
    return { paperId: p.id, paper: p, students: list };
  });
}

/** Rooms already used by plans whose slot overlaps this one. Map room_id → slot description. */
export function busyRooms(slot, excludePlanId) {
  const rows = db
    .prepare(
      `SELECT DISTINCT sa.room_id, s.id AS slot_id, s.exam_name, s.date, s.start_time, s.duration_min
       FROM seat_assignments sa JOIN plans p ON p.id = sa.plan_id JOIN slots s ON s.id = p.slot_id
       WHERE s.date = ? AND p.id != ?`,
    )
    .all(slot.date, excludePlanId ?? -1);
  const busy = new Map();
  for (const r of rows) {
    if (r.slot_id !== slot.id && slotsOverlap(r, slot)) busy.set(r.room_id, `${r.exam_name} (${r.start_time})`);
  }
  return busy;
}

export function planOptions(plan, settings = getSettings()) {
  const o = parseJSON(plan?.options, {});
  return {
    adjacency: o.adjacency ?? settings.adjacency_mode,
    room_usage: o.room_usage ?? settings.room_usage,
    students_per_invigilator: o.students_per_invigilator ?? settings.students_per_invigilator,
    min_invigilators_per_room: o.min_invigilators_per_room ?? settings.min_invigilators_per_room,
    reserve_invigilators: o.reserve_invigilators ?? settings.reserve_invigilators,
    avoid_same_department: o.avoid_same_department ?? settings.avoid_same_department,
  };
}

export function getPlanDetail(planId, { withIssues = true } = {}) {
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
  if (!row) throw new HttpError(404, 'Seating plan not found.');
  const settings = getSettings();
  const options = planOptions(row, settings);
  const plan = { ...row, options, room_ids: parseJSON(row.room_ids, []) };
  const slot = getSlot(plan.slot_id);

  const seats = db
    .prepare(
      `SELECT sa.room_id, sa.r, sa.c, sa.student_id, sa.paper_id, s.roll_no, s.name, s.semester
       FROM seat_assignments sa JOIN students s ON s.id = sa.student_id
       WHERE sa.plan_id = ?`,
    )
    .all(planId);
  const roomIds = [...plan.room_ids];
  for (const s of seats) if (!roomIds.includes(s.room_id)) roomIds.push(s.room_id);

  const paperById = new Map(slot.papers.map((p) => [p.id, p]));
  const rooms = getRooms(roomIds).map((room) => {
    const own = seats.filter((s) => s.room_id === room.id);
    const departments = [...new Set(own.map((s) => paperById.get(s.paper_id)?.department).filter(Boolean))];
    return {
      ...room,
      seats: buildSeats(room.layout, room.blocked),
      assigned: own.length,
      required_invigilators: requiredInvigilators(own.length, options),
      departments,
    };
  });

  const duties = db
    .prepare(
      `SELECT d.id, d.room_id, d.teacher_id, d.role, t.name, t.email, t.department, t.designation, t.phone, t.emp_code
       FROM duties d JOIN teachers t ON t.id = d.teacher_id
       WHERE d.plan_id = ? ORDER BY d.role, t.name`,
    )
    .all(planId);

  const groups = studentsForPapers(slot.papers);
  const seatedIds = new Set(seats.map((s) => s.student_id));
  const unseated = groups.flatMap((g) =>
    g.students.filter((s) => !seatedIds.has(s.id)).map((s) => ({ ...s, paper_id: g.paperId })),
  );
  const expected = groups.reduce((n, g) => n + g.students.length, 0);

  const usedRooms = rooms.filter((r) => r.assigned > 0);
  const stats = {
    expected,
    seated: seats.length,
    unseated: unseated.length,
    rooms_used: usedRooms.length,
    rooms_selected: rooms.length,
    capacity_used: usedRooms.reduce((n, r) => n + r.capacity, 0),
    invigilators: duties.filter((d) => d.role === 'invigilator').length,
    reserves: duties.filter((d) => d.role === 'reserve').length,
    invigilators_required: usedRooms.reduce((n, r) => n + r.required_invigilators, 0),
  };

  const detail = { plan, slot, rooms, seats, duties, unseated, stats, issues: [] };
  if (withIssues) detail.issues = computeIssues(detail, settings);
  stats.errors = detail.issues.filter((i) => i.severity === 'error').length;
  stats.warnings = detail.issues.filter((i) => i.severity === 'warning').length;
  return detail;
}

export function computeIssues(detail, settings = getSettings()) {
  const { plan, slot, rooms, seats, duties, unseated } = detail;
  const issues = [];
  const mode = plan.options.adjacency;

  for (const p of slot.papers) {
    if (p.student_count === 0)
      issues.push({ type: 'paper', severity: 'warning', message: `${paperShort(p)} has no students uploaded.` });
  }

  for (const room of rooms) {
    const own = seats.filter((s) => s.room_id === room.id);
    if (!own.length) continue;
    const valid = new Set(room.seats.map((s) => s.key));
    const invalid = own.filter((s) => !valid.has(`${s.r}-${s.c}`));
    if (invalid.length)
      issues.push({
        type: 'layout',
        severity: 'error',
        room_id: room.id,
        message: `${invalid.length} student(s) in ${room.name} sit on seats that no longer exist (layout changed). Regenerate or move them.`,
      });
    const map = new Map(own.map((s) => [`${s.r}-${s.c}`, s.paper_id]));
    const pairs = roomConflicts(room, mode, map);
    if (pairs.length)
      issues.push({
        type: 'adjacency',
        severity: 'error',
        room_id: room.id,
        seats: [...new Set(pairs.flat())],
        message: `${pairs.length} pair${pairs.length > 1 ? 's' : ''} of students from the same paper sit next to each other in ${room.name}.`,
      });
    if (!room.is_active)
      issues.push({ type: 'room', severity: 'warning', room_id: room.id, message: `${room.name} is marked inactive.` });

    const assigned = duties.filter((d) => d.room_id === room.id && d.role === 'invigilator').length;
    if (assigned < room.required_invigilators)
      issues.push({
        type: 'invigilator',
        severity: 'error',
        room_id: room.id,
        message: `${room.name} needs ${room.required_invigilators - assigned} more invigilator${room.required_invigilators - assigned > 1 ? 's' : ''}.`,
      });
  }

  if (unseated.length)
    issues.push({
      type: 'unseated',
      severity: 'error',
      message: `${unseated.length} student${unseated.length > 1 ? 's have' : ' has'} not been given a seat.`,
    });

  const busy = busyRooms(slot, plan.id);
  for (const room of rooms) {
    if (room.assigned && busy.has(room.id))
      issues.push({
        type: 'room-clash',
        severity: 'error',
        room_id: room.id,
        message: `${room.name} is also booked for ${busy.get(room.id)} at an overlapping time.`,
      });
  }

  const ctx = teacherContext(slot, plan.id, settings);
  for (const d of duties) {
    const c = ctx.get(d.teacher_id);
    const base = { type: 'duty', teacher_id: d.teacher_id, room_id: d.room_id };
    if (!c) {
      issues.push({ ...base, severity: 'warning', message: `${d.name} is marked inactive but still has a duty.` });
      continue;
    }
    if (c.overlap)
      issues.push({ ...base, severity: 'error', message: `${d.name} is already on duty in another exam at the same time.` });
    if (c.unavailable)
      issues.push({ ...base, severity: 'error', message: `${d.name} is unavailable for this slot (${c.unavailable}).` });
    if (!c.overlap && c.restViolation)
      issues.push({
        ...base,
        severity: 'warning',
        message: `${d.name} has another duty on ${fmtDate(slot.date, { day: 'numeric', month: 'short' })} — breaks the no-continuous-duty rule.`,
      });
    if (c.overMax)
      issues.push({
        ...base,
        severity: 'warning',
        message: `${d.name} is over their limit of ${c.teacher.max_duties} duties.`,
      });
  }
  return issues;
}

function roomsForDuty(planId, papers) {
  const paperDept = new Map(papers.map((p) => [p.id, p.department]));
  const rows = db
    .prepare('SELECT room_id, paper_id, COUNT(*) AS n FROM seat_assignments WHERE plan_id = ? GROUP BY room_id, paper_id')
    .all(planId);
  const byRoom = new Map();
  for (const r of rows) {
    const e = byRoom.get(r.room_id) || { room_id: r.room_id, count: 0, departments: new Set() };
    e.count += r.n;
    if (paperDept.get(r.paper_id)) e.departments.add(paperDept.get(r.paper_id));
    byRoom.set(r.room_id, e);
  }
  return [...byRoom.values()];
}

export function generatePlan({ slotId, roomIds, options = {}, user }) {
  const settings = getSettings();
  const slot = getSlot(slotId);
  if (!slot) throw new HttpError(404, 'Exam slot not found.');
  if (!slot.papers.length) throw new HttpError(400, 'Add at least one paper to this exam slot before generating seating.');
  const existing = db.prepare('SELECT * FROM plans WHERE slot_id = ?').get(slotId);
  if (existing && existing.status !== 'draft')
    throw new HttpError(409, 'This plan has been approved. Reopen it for editing before regenerating.');

  const opts = { ...planOptions(existing, settings), ...pick(options, Object.keys(planOptions(null, settings))) };
  const busy = busyRooms(slot, existing?.id);
  const ids = (roomIds?.length ? roomIds : parseJSON(existing?.room_ids, [])).map(Number);
  if (!ids.length) throw new HttpError(400, 'Select at least one classroom.');
  const rooms = getRooms(ids).filter((r) => r.is_active && !busy.has(r.id));
  if (!rooms.length) throw new HttpError(400, 'None of the selected classrooms are available for this slot.');

  const groups = studentsForPapers(slot.papers);
  const seed = Number(options.seed) || Date.now();
  const result = generateSeating(
    rooms,
    groups.map((g) => ({ paperId: g.paperId, students: g.students })),
    { adjacency: opts.adjacency, roomUsage: opts.room_usage, seed },
  );

  const now = new Date().toISOString();
  let planId = existing?.id;
  let dutyIssues = [];
  db.transaction(() => {
    if (existing) {
      db.prepare(
        `UPDATE plans SET room_ids = ?, options = ?, generated_at = ?, updated_at = ?, status = 'draft',
         approved_at = NULL, approved_by = NULL, notified_at = NULL WHERE id = ?`,
      ).run(JSON.stringify(rooms.map((r) => r.id)), JSON.stringify(opts), now, now, planId);
      db.prepare('DELETE FROM seat_assignments WHERE plan_id = ?').run(planId);
      db.prepare('DELETE FROM duties WHERE plan_id = ?').run(planId);
    } else {
      planId = db
        .prepare('INSERT INTO plans (slot_id, room_ids, options, generated_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(slotId, JSON.stringify(rooms.map((r) => r.id)), JSON.stringify(opts), now, now).lastInsertRowid;
    }
    const ins = db.prepare(
      'INSERT INTO seat_assignments (plan_id, room_id, r, c, student_id, paper_id) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const a of result.assignments) ins.run(planId, a.room_id, a.r, a.c, a.student_id, a.paper_id);
    dutyIssues = writeDuties(planId, slot, { ...settings, ...opts }, seed);
  })();

  logActivity(
    user,
    existing ? 'Regenerated seating plan' : 'Generated seating plan',
    `${slot.exam_name} · ${fmtDate(slot.date)} ${fmtTime12(slot.start_time)} — ${result.assignments.length} students in ${result.roomsUsed.length} rooms`,
  );
  const warnings = [...result.warnings];
  if (dutyIssues.length)
    warnings.push(
      `Not enough available teachers: ${dutyIssues.reduce((n, i) => n + i.missing, 0)} invigilator position(s) are unfilled.`,
    );
  return { planId: Number(planId), warnings, seated: result.assignments.length, unseated: result.unseated.length };
}

function writeDuties(planId, slot, settings, seed) {
  db.prepare('DELETE FROM duties WHERE plan_id = ?').run(planId);
  const { duties, issues } = assignInvigilators({
    slot,
    planId,
    rooms: roomsForDuty(planId, slot.papers),
    settings,
    seed,
  });
  const ins = db.prepare('INSERT INTO duties (plan_id, room_id, teacher_id, role) VALUES (?, ?, ?, ?)');
  for (const d of duties) ins.run(planId, d.room_id, d.teacher_id, d.role);
  return issues;
}

export function reassignInvigilators(planId, user) {
  const plan = editablePlan(planId);
  const slot = getSlot(plan.slot_id);
  const settings = { ...getSettings(), ...planOptions(plan) };
  let issues;
  db.transaction(() => {
    issues = writeDuties(planId, slot, settings, Date.now());
    touch(planId);
  })();
  logActivity(user, 'Reassigned invigilators', `${slot.exam_name} · ${fmtDate(slot.date)} ${fmtTime12(slot.start_time)}`);
  return issues;
}

export function editablePlan(planId) {
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
  if (!plan) throw new HttpError(404, 'Seating plan not found.');
  if (plan.status !== 'draft') throw new HttpError(409, 'This plan is approved and locked. Reopen it to make changes.');
  return plan;
}

export const touch = (planId) =>
  db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), planId);

function validSeat(planId, { room_id, r, c }) {
  const [room] = getRooms([Number(room_id)]);
  if (!room) throw new HttpError(400, 'Unknown classroom.');
  const ok = buildSeats(room.layout, room.blocked).some((s) => s.r === Number(r) && s.c === Number(c));
  if (!ok) throw new HttpError(400, `Seat does not exist in ${room.name}.`);
  return { room_id: room.id, r: Number(r), c: Number(c) };
}

export function swapSeats(planId, a, b) {
  editablePlan(planId);
  const A = validSeat(planId, a);
  const B = validSeat(planId, b);
  const get = db.prepare('SELECT * FROM seat_assignments WHERE plan_id = ? AND room_id = ? AND r = ? AND c = ?');
  const del = db.prepare('DELETE FROM seat_assignments WHERE plan_id = ? AND room_id = ? AND r = ? AND c = ?');
  const ins = db.prepare(
    'INSERT INTO seat_assignments (plan_id, room_id, r, c, student_id, paper_id) VALUES (?, ?, ?, ?, ?, ?)',
  );
  db.transaction(() => {
    const sa = get.get(planId, A.room_id, A.r, A.c);
    const sb = get.get(planId, B.room_id, B.r, B.c);
    if (sa) del.run(planId, A.room_id, A.r, A.c);
    if (sb) del.run(planId, B.room_id, B.r, B.c);
    if (sa) ins.run(planId, B.room_id, B.r, B.c, sa.student_id, sa.paper_id);
    if (sb) ins.run(planId, A.room_id, A.r, A.c, sb.student_id, sb.paper_id);
    ensureRoomListed(planId, [A.room_id, B.room_id]);
    touch(planId);
  })();
}

export function placeStudent(planId, studentId, to) {
  const plan = editablePlan(planId);
  const T = validSeat(planId, to);
  const slot = getSlot(plan.slot_id);
  const group = studentsForPapers(slot.papers).find((g) => g.students.some((s) => s.id === Number(studentId)));
  if (!group) throw new HttpError(400, 'This student is not writing any paper in this slot.');
  db.transaction(() => {
    db.prepare('DELETE FROM seat_assignments WHERE plan_id = ? AND student_id = ?').run(planId, studentId);
    db.prepare('DELETE FROM seat_assignments WHERE plan_id = ? AND room_id = ? AND r = ? AND c = ?').run(
      planId,
      T.room_id,
      T.r,
      T.c,
    );
    db.prepare(
      'INSERT INTO seat_assignments (plan_id, room_id, r, c, student_id, paper_id) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(planId, T.room_id, T.r, T.c, studentId, group.paperId);
    ensureRoomListed(planId, [T.room_id]);
    touch(planId);
  })();
}

export function unseatStudent(planId, seat) {
  editablePlan(planId);
  db.prepare('DELETE FROM seat_assignments WHERE plan_id = ? AND room_id = ? AND r = ? AND c = ?').run(
    planId,
    seat.room_id,
    seat.r,
    seat.c,
  );
  touch(planId);
}

function ensureRoomListed(planId, roomIds) {
  const plan = db.prepare('SELECT room_ids FROM plans WHERE id = ?').get(planId);
  const ids = parseJSON(plan.room_ids, []);
  let changed = false;
  for (const id of roomIds) {
    if (!ids.includes(id)) {
      ids.push(id);
      changed = true;
    }
  }
  if (changed) db.prepare('UPDATE plans SET room_ids = ? WHERE id = ?').run(JSON.stringify(ids), planId);
}

export function setPlanRooms(planId, roomIds) {
  editablePlan(planId);
  const occupied = db.prepare('SELECT DISTINCT room_id FROM seat_assignments WHERE plan_id = ?').all(planId);
  const ids = [...new Set([...roomIds.map(Number), ...occupied.map((r) => r.room_id)])];
  db.prepare('UPDATE plans SET room_ids = ? WHERE id = ?').run(JSON.stringify(ids), planId);
  // invigilators for rooms that are no longer part of the plan are released
  db.prepare(
    `DELETE FROM duties WHERE plan_id = ? AND room_id IS NOT NULL AND room_id NOT IN (${ids.map(() => '?').join(',') || 'NULL'})`,
  ).run(planId, ...ids);
  touch(planId);
}

/** Rooms with their spaced capacity for a slot's paper mix plus the fewest rooms that fit. */
export function suggestRooms(slot, planId, adjacency) {
  const groups = studentsForPapers(slot.papers);
  const counts = groups.map((g) => g.students.length);
  const total = counts.reduce((a, b) => a + b, 0);
  const pmax = total ? Math.max(...counts) / total : 1;
  const busy = busyRooms(slot, planId);
  const rooms = getRooms().map((r) => {
    const { independent } = prepareRoom(r, adjacency);
    return {
      ...r,
      effective: Math.max(1, Math.min(r.capacity, Math.floor(independent / pmax))),
      busy: busy.get(r.id) || null,
    };
  });
  const candidates = rooms.filter((r) => r.is_active && !r.busy).sort((a, b) => b.effective - a.effective);
  const suggested = [];
  let acc = 0;
  for (const r of candidates) {
    if (acc >= total) break;
    suggested.push(r.id);
    acc += r.effective;
  }
  return { total, counts, rooms, suggested };
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj?.[k] !== undefined && obj[k] !== null && obj[k] !== '') out[k] = obj[k];
  return out;
}

/** Lightweight summary used by lists and the dashboard. */
export function planSummary(planId) {
  const d = getPlanDetail(planId);
  return {
    id: d.plan.id,
    status: d.plan.status,
    slot_id: d.plan.slot_id,
    generated_at: d.plan.generated_at,
    updated_at: d.plan.updated_at,
    approved_at: d.plan.approved_at,
    notified_at: d.plan.notified_at,
    stats: d.stats,
    issues: d.issues,
  };
}
