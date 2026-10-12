import { Router } from 'express';
import { db, getSettings, logActivity } from '../db.js';
import { HttpError, clean, endTime, fmtDate, fmtTime12, requireFields, slotsOverlap, todayISO } from '../util.js';
import {
  editablePlan,
  generatePlan,
  getPapers,
  getPlanDetail,
  getSlot,
  placeStudent,
  planOptions,
  planSummary,
  reassignInvigilators,
  setPlanRooms,
  studentsForPapers,
  suggestRooms,
  swapSeats,
  touch,
  unseatStudent,
} from '../services/plans.js';
import { teacherContext } from '../services/invigilation.js';
import { notifyPlan } from '../services/mailer.js';
import { normalizeSemester } from './people.js';

const router = Router();

/* ------------------------------------------------------------------ slots */

function slotInput(body) {
  requireFields(body, ['exam_name', 'date', 'start_time']);
  const date = clean(body.date);
  const start = clean(body.start_time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Choose a valid exam date.');
  if (!/^\d{1,2}:\d{2}$/.test(start)) throw new HttpError(400, 'Choose a valid start time.');
  const duration = Math.round(Number(body.duration_min || 90));
  if (!(duration >= 15 && duration <= 600)) throw new HttpError(400, 'Duration must be between 15 minutes and 10 hours.');
  const papers = Array.isArray(body.papers) ? body.papers : [];
  const seen = new Set();
  const cleanPapers = [];
  for (const p of papers) {
    const courseId = Number(p.course_id);
    if (!courseId) continue;
    if (!db.prepare('SELECT 1 FROM courses WHERE id = ?').get(courseId)) throw new HttpError(400, 'One of the papers uses an unknown course.');
    const semester = normalizeSemester(p.semester);
    const key = `${courseId}:${semester ?? '*'}`;
    if (seen.has(key)) throw new HttpError(400, 'The same course and semester is listed twice.');
    seen.add(key);
    cleanPapers.push({
      id: p.id ? Number(p.id) : null,
      course_id: courseId,
      semester,
      subject: clean(p.subject),
      subject_code: clean(p.subject_code)?.toUpperCase() ?? null,
    });
  }
  return {
    exam_name: clean(body.exam_name),
    date,
    start_time: start.padStart(5, '0'),
    duration_min: duration,
    session: clean(body.session),
    papers: cleanPapers,
  };
}

function savePapers(slotId, papers) {
  const existing = db.prepare('SELECT id FROM slot_papers WHERE slot_id = ?').all(slotId).map((r) => r.id);
  const keep = new Set(papers.filter((p) => p.id && existing.includes(p.id)).map((p) => p.id));
  for (const id of existing) if (!keep.has(id)) db.prepare('DELETE FROM slot_papers WHERE id = ?').run(id);
  const upd = db.prepare('UPDATE slot_papers SET course_id = ?, semester = ?, subject = ?, subject_code = ? WHERE id = ?');
  const ins = db.prepare('INSERT INTO slot_papers (slot_id, course_id, semester, subject, subject_code) VALUES (?, ?, ?, ?, ?)');
  for (const p of papers) {
    if (p.id && keep.has(p.id)) upd.run(p.course_id, p.semester, p.subject, p.subject_code, p.id);
    else ins.run(slotId, p.course_id, p.semester, p.subject, p.subject_code);
  }
}

function studentIdsForSlot(slotId) {
  return new Set(studentsForPapers(getPapers(slotId)).flatMap((g) => g.students.map((s) => s.id)));
}

router.get('/slots', (_req, res) => {
  const slots = db.prepare('SELECT * FROM slots ORDER BY date, start_time').all();
  const plans = new Map(db.prepare('SELECT id, slot_id FROM plans').all().map((p) => [p.slot_id, p.id]));
  const out = slots.map((s) => {
    const papers = getPapers(s.id);
    const planId = plans.get(s.id);
    return {
      ...s,
      end_time: endTime(s),
      papers,
      student_count: papers.reduce((n, p) => n + p.student_count, 0),
      plan: planId ? planSummary(planId) : null,
      clashes: [],
    };
  });
  // Students who would have to be in two overlapping slots at once.
  const cache = new Map();
  const ids = (id) => cache.get(id) || cache.set(id, studentIdsForSlot(id)).get(id);
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      if (!slotsOverlap(out[i], out[j])) continue;
      const a = ids(out[i].id);
      const b = ids(out[j].id);
      let shared = 0;
      for (const x of a) if (b.has(x)) shared++;
      if (shared) {
        out[i].clashes.push({ slot_id: out[j].id, students: shared });
        out[j].clashes.push({ slot_id: out[i].id, students: shared });
      }
    }
  }
  res.json(out);
});

router.get('/slots/:id', (req, res) => {
  const slot = getSlot(Number(req.params.id));
  if (!slot) throw new HttpError(404, 'Exam slot not found.');
  const plan = db.prepare('SELECT id, status FROM plans WHERE slot_id = ?').get(slot.id);
  res.json({ ...slot, plan: plan || null });
});

router.post('/slots', (req, res) => {
  const s = slotInput(req.body);
  let id;
  db.transaction(() => {
    id = db
      .prepare('INSERT INTO slots (exam_name, date, start_time, duration_min, session) VALUES (?, ?, ?, ?, ?)')
      .run(s.exam_name, s.date, s.start_time, s.duration_min, s.session).lastInsertRowid;
    savePapers(id, s.papers);
  })();
  logActivity(req.user, 'Scheduled exam slot', `${s.exam_name} · ${fmtDate(s.date)} ${fmtTime12(s.start_time)}`);
  res.status(201).json({ id: Number(id) });
});

router.put('/slots/:id', (req, res) => {
  const s = slotInput(req.body);
  const id = Number(req.params.id);
  const plan = db.prepare('SELECT status FROM plans WHERE slot_id = ?').get(id);
  if (plan && plan.status !== 'draft')
    throw new HttpError(409, 'The seating plan for this slot is approved. Reopen the plan before changing the slot.');
  db.transaction(() => {
    const r = db
      .prepare('UPDATE slots SET exam_name = ?, date = ?, start_time = ?, duration_min = ?, session = ? WHERE id = ?')
      .run(s.exam_name, s.date, s.start_time, s.duration_min, s.session, id);
    if (!r.changes) throw new HttpError(404, 'Exam slot not found.');
    savePapers(id, s.papers);
  })();
  logActivity(req.user, 'Updated exam slot', `${s.exam_name} · ${fmtDate(s.date)} ${fmtTime12(s.start_time)}`);
  res.json({ ok: true });
});

router.delete('/slots/:id', (req, res) => {
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(req.params.id);
  if (!slot) throw new HttpError(404, 'Exam slot not found.');
  db.prepare('DELETE FROM slots WHERE id = ?').run(slot.id);
  logActivity(req.user, 'Deleted exam slot', `${slot.exam_name} · ${fmtDate(slot.date)} ${fmtTime12(slot.start_time)}`);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ plans */

router.get('/plans', (_req, res) => {
  const rows = db
    .prepare('SELECT p.id, p.slot_id FROM plans p JOIN slots s ON s.id = p.slot_id ORDER BY s.date, s.start_time')
    .all();
  res.json(rows.map((r) => ({ ...planSummary(r.id), slot: getSlot(r.slot_id) })));
});

router.get('/plans/:id', (req, res) => res.json(getPlanDetail(Number(req.params.id))));

router.post('/plans/generate', (req, res) => {
  const result = generatePlan({
    slotId: Number(req.body?.slot_id),
    roomIds: Array.isArray(req.body?.room_ids) ? req.body.room_ids : null,
    options: req.body?.options || {},
    user: req.user,
  });
  res.json(result);
});

router.post('/plans/generate-all', (req, res) => {
  const settings = getSettings();
  const slots = db
    .prepare(
      `SELECT s.id FROM slots s LEFT JOIN plans p ON p.slot_id = s.id
       WHERE p.id IS NULL AND s.date >= ? ORDER BY s.date, s.start_time`,
    )
    .all(todayISO());
  const results = [];
  for (const { id } of slots) {
    const slot = getSlot(id);
    const label = `${slot.exam_name} · ${fmtDate(slot.date, { day: 'numeric', month: 'short' })} ${fmtTime12(slot.start_time)}`;
    if (!slot.papers.length) {
      results.push({ slot_id: id, label, ok: false, message: 'No papers scheduled' });
      continue;
    }
    try {
      const { suggested } = suggestRooms(slot, null, settings.adjacency_mode);
      const r = generatePlan({ slotId: id, roomIds: suggested, user: req.user });
      results.push({ slot_id: id, label, ok: true, plan_id: r.planId, message: r.warnings.join(' ') || `${r.seated} students seated` });
    } catch (e) {
      results.push({ slot_id: id, label, ok: false, message: e.message });
    }
  }
  res.json({ results });
});

router.post('/plans/:id/swap', (req, res) => {
  swapSeats(Number(req.params.id), req.body?.a || {}, req.body?.b || {});
  res.json({ ok: true });
});

router.post('/plans/:id/place', (req, res) => {
  placeStudent(Number(req.params.id), Number(req.body?.student_id), req.body?.to || {});
  res.json({ ok: true });
});

router.post('/plans/:id/unseat', (req, res) => {
  unseatStudent(Number(req.params.id), req.body || {});
  res.json({ ok: true });
});

router.put('/plans/:id/rooms', (req, res) => {
  setPlanRooms(Number(req.params.id), Array.isArray(req.body?.room_ids) ? req.body.room_ids : []);
  res.json({ ok: true });
});

router.post('/plans/:id/reassign', (req, res) => {
  const issues = reassignInvigilators(Number(req.params.id), req.user);
  res.json({ ok: true, unfilled: issues.reduce((n, i) => n + i.missing, 0) });
});

router.get('/plans/:id/teachers', (req, res) => {
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id);
  if (!plan) throw new HttpError(404, 'Seating plan not found.');
  const slot = getSlot(plan.slot_id);
  const ctx = teacherContext(slot, plan.id, { ...getSettings(), ...planOptions(plan) });
  const current = new Map(
    db.prepare('SELECT id, teacher_id, room_id, role FROM duties WHERE plan_id = ?').all(plan.id).map((d) => [d.teacher_id, d]),
  );
  const list = [...ctx.values()].map((c) => {
    const reasons = [];
    if (c.overlap) reasons.push('On duty in another exam at this time');
    if (c.unavailable) reasons.push(`Unavailable: ${c.unavailable}`);
    if (!c.overlap && c.restViolation) reasons.push('Already has a duty this day');
    if (c.overMax) reasons.push(`Reached personal limit (${c.teacher.max_duties})`);
    return {
      id: c.teacher.id,
      name: c.teacher.name,
      department: c.teacher.department,
      designation: c.teacher.designation,
      total: c.total,
      same_day: c.sameDay,
      tier: c.tier === Infinity ? 3 : c.tier,
      reasons,
      assigned: current.get(c.teacher.id) || null,
    };
  });
  list.sort((a, b) => a.tier - b.tier || a.total - b.total || a.name.localeCompare(b.name));
  res.json(list);
});

router.post('/plans/:id/duties', (req, res) => {
  const planId = Number(req.params.id);
  editablePlan(planId);
  const teacherId = Number(req.body?.teacher_id);
  const roomId = req.body?.room_id ? Number(req.body.room_id) : null;
  const role = roomId ? 'invigilator' : 'reserve';
  if (!db.prepare('SELECT 1 FROM teachers WHERE id = ?').get(teacherId)) throw new HttpError(400, 'Choose a teacher.');
  const existing = db.prepare('SELECT id FROM duties WHERE plan_id = ? AND teacher_id = ?').get(planId, teacherId);
  if (existing) db.prepare('UPDATE duties SET room_id = ?, role = ? WHERE id = ?').run(roomId, role, existing.id);
  else db.prepare('INSERT INTO duties (plan_id, room_id, teacher_id, role) VALUES (?, ?, ?, ?)').run(planId, roomId, teacherId, role);
  touch(planId);
  res.json({ ok: true });
});

router.put('/plans/:id/duties/:dutyId', (req, res) => {
  const planId = Number(req.params.id);
  editablePlan(planId);
  const duty = db.prepare('SELECT * FROM duties WHERE id = ? AND plan_id = ?').get(req.params.dutyId, planId);
  if (!duty) throw new HttpError(404, 'Duty not found.');
  const teacherId = Number(req.body?.teacher_id);
  if (!db.prepare('SELECT 1 FROM teachers WHERE id = ?').get(teacherId)) throw new HttpError(400, 'Choose a teacher.');
  const other = db.prepare('SELECT * FROM duties WHERE plan_id = ? AND teacher_id = ?').get(planId, teacherId);
  db.transaction(() => {
    if (other && other.id !== duty.id) {
      // the chosen teacher already has a position in this plan: swap their positions
      const move = db.prepare('UPDATE duties SET room_id = ?, role = ? WHERE id = ?');
      move.run(duty.room_id, duty.role, other.id);
      move.run(other.room_id, other.role, duty.id);
    } else {
      db.prepare('UPDATE duties SET teacher_id = ? WHERE id = ?').run(teacherId, duty.id);
    }
  })();
  touch(planId);
  res.json({ ok: true });
});

router.delete('/plans/:id/duties/:dutyId', (req, res) => {
  const planId = Number(req.params.id);
  editablePlan(planId);
  db.prepare('DELETE FROM duties WHERE id = ? AND plan_id = ?').run(req.params.dutyId, planId);
  touch(planId);
  res.json({ ok: true });
});

router.post('/plans/:id/approve', (req, res) => {
  const planId = Number(req.params.id);
  editablePlan(planId);
  const detail = getPlanDetail(planId);
  const errors = detail.issues.filter((i) => i.severity === 'error');
  if (errors.length && !req.body?.force)
    throw new HttpError(409, `This plan still has ${errors.length} problem${errors.length > 1 ? 's' : ''}. Resolve them or approve anyway.`, { issues: errors });
  if (!detail.seats.length) throw new HttpError(400, 'There are no seated students in this plan.');
  db.prepare("UPDATE plans SET status = 'approved', approved_at = ?, approved_by = ? WHERE id = ?").run(
    new Date().toISOString(),
    req.user.id,
    planId,
  );
  logActivity(req.user, 'Approved seating plan', `${detail.slot.exam_name} · ${fmtDate(detail.slot.date)} ${fmtTime12(detail.slot.start_time)}`);
  res.json({ ok: true });
});

router.post('/plans/:id/reopen', (req, res) => {
  const planId = Number(req.params.id);
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
  if (!plan) throw new HttpError(404, 'Seating plan not found.');
  db.prepare("UPDATE plans SET status = 'draft', approved_at = NULL, approved_by = NULL WHERE id = ?").run(planId);
  const slot = getSlot(plan.slot_id);
  logActivity(req.user, 'Reopened seating plan', `${slot.exam_name} · ${fmtDate(slot.date)} ${fmtTime12(slot.start_time)}`);
  res.json({ ok: true });
});

router.post('/plans/:id/notify', async (req, res) => {
  const ids = Array.isArray(req.body?.teacher_ids) ? req.body.teacher_ids.map(Number) : undefined;
  const result = await notifyPlan(Number(req.params.id), req.user, { teacherIds: ids });
  res.json(result);
});

router.delete('/plans/:id', (req, res) => {
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id);
  if (!plan) throw new HttpError(404, 'Seating plan not found.');
  const slot = getSlot(plan.slot_id);
  db.prepare('DELETE FROM plans WHERE id = ?').run(plan.id);
  logActivity(req.user, 'Deleted seating plan', `${slot.exam_name} · ${fmtDate(slot.date)} ${fmtTime12(slot.start_time)}`);
  res.json({ ok: true });
});

/** Duty roster across every plan (for reports). */
router.get('/roster', (_req, res) => {
  const slots = db
    .prepare(
      `SELECT s.*, p.id AS plan_id, p.status FROM slots s JOIN plans p ON p.slot_id = s.id ORDER BY s.date, s.start_time`,
    )
    .all()
    .map((s) => ({ ...s, end_time: endTime(s) }));
  const teachers = db.prepare('SELECT id, name, emp_code, department, designation, email, phone, is_active FROM teachers ORDER BY name').all();
  const duties = db
    .prepare(
      `SELECT d.teacher_id, d.plan_id, d.role, r.name AS room_name FROM duties d LEFT JOIN rooms r ON r.id = d.room_id`,
    )
    .all();
  res.json({ slots, teachers, duties });
});

router.get('/plans/:id/emails', (req, res) => {
  res.json(
    db
      .prepare('SELECT id, teacher_id, to_email, to_name, subject, status, error, created_at FROM emails WHERE plan_id = ? ORDER BY id DESC')
      .all(req.params.id),
  );
});

export default router;

