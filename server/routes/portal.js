import { Router } from 'express';
import { db, getSettings } from '../db.js';
import { buildSeats } from '../../shared/layout.js';
import { HttpError, clean, endTime, todayISO } from '../util.js';
import { getPapers, getRooms } from '../services/plans.js';
import { addUnavailability, listUnavailability, teacherDuties } from './people.js';

/* ------------------------------------------------- teacher self-service */

export const me = Router();

function teacherOf(req) {
  if (!req.user.teacher_id) throw new HttpError(403, 'This area is for teaching staff.');
  return req.user.teacher_id;
}

me.get('/overview', (req, res) => {
  const tid = teacherOf(req);
  const teacher = db.prepare('SELECT * FROM teachers WHERE id = ?').get(tid);
  const today = todayISO();
  const duties = teacherDuties(tid).map((d) => {
    const co = db
      .prepare(
        `SELECT t.name FROM duties d JOIN teachers t ON t.id = d.teacher_id
         WHERE d.plan_id = ? AND d.room_id IS ? AND d.teacher_id != ? AND d.room_id IS NOT NULL`,
      )
      .all(d.plan_id, d.room_id, tid)
      .map((r) => r.name);
    const papers = getPapers(d.slot_id).map((p) => p.short);
    return { ...d, co_invigilators: co, papers };
  });
  const all = db
    .prepare(
      `SELECT COUNT(p.id) AS n FROM teachers t LEFT JOIN duties d ON d.teacher_id = t.id
       LEFT JOIN plans p ON p.id = d.plan_id AND p.status != 'draft'
       WHERE t.is_active = 1 GROUP BY t.id`,
    )
    .all()
    .map((r) => r.n);
  const slots = db
    .prepare(
      `SELECT s.*, p.status AS plan_status FROM slots s LEFT JOIN plans p ON p.slot_id = s.id
       WHERE s.date >= ? ORDER BY s.date, s.start_time`,
    )
    .all(today)
    .map((s) => ({ ...s, end_time: endTime(s) }));
  const settings = getSettings();
  res.json({
    teacher,
    duties,
    stats: {
      total: duties.length,
      upcoming: duties.filter((d) => d.date >= today).length,
      completed: duties.filter((d) => d.date < today).length,
      average: all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0,
    },
    unavailability: listUnavailability(tid),
    slots,
    report_before_min: settings.report_before_min,
  });
});

me.get('/duties/:planId', (req, res) => {
  const tid = teacherOf(req);
  const duty = db
    .prepare(
      `SELECT d.*, p.status, p.slot_id FROM duties d JOIN plans p ON p.id = d.plan_id
       WHERE d.plan_id = ? AND d.teacher_id = ? AND p.status != 'draft'`,
    )
    .get(req.params.planId, tid);
  if (!duty) throw new HttpError(404, 'Duty not found.');
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(duty.slot_id);
  const papers = getPapers(duty.slot_id);
  const roomId = duty.room_id;
  const [room] = roomId ? getRooms([roomId]) : [];
  const seats = roomId
    ? db
        .prepare(
          `SELECT sa.r, sa.c, sa.student_id, sa.paper_id, s.roll_no, s.name, s.semester
           FROM seat_assignments sa JOIN students s ON s.id = sa.student_id
           WHERE sa.plan_id = ? AND sa.room_id = ?`,
        )
        .all(duty.plan_id, roomId)
    : [];
  const team = db
    .prepare(
      `SELECT d.role, d.room_id, t.name, t.department, t.phone FROM duties d JOIN teachers t ON t.id = d.teacher_id
       WHERE d.plan_id = ? AND (d.room_id IS ? OR d.role = 'reserve')`,
    )
    .all(duty.plan_id, roomId);
  res.json({
    duty,
    slot: { ...slot, end_time: endTime(slot), papers },
    room: room ? { ...room, seats: buildSeats(room.layout, room.blocked) } : null,
    seats: seats.map((s) => ({ ...s, room_id: roomId })),
    team,
  });
});

me.post('/unavailability', (req, res) => {
  const tid = teacherOf(req);
  const id = addUnavailability(tid, req.body, req.user);
  const row = db.prepare('SELECT * FROM teacher_unavailability WHERE id = ?').get(id);
  const conflict = db
    .prepare(
      `SELECT s.exam_name, s.start_time FROM duties d JOIN plans p ON p.id = d.plan_id JOIN slots s ON s.id = p.slot_id
       WHERE d.teacher_id = ? AND s.date = ? AND p.status != 'draft' AND (? IS NULL OR s.id = ?)`,
    )
    .get(tid, row.date, row.slot_id, row.slot_id);
  res.status(201).json({
    id,
    warning: conflict
      ? `You already have a confirmed duty (${conflict.exam_name}, ${conflict.start_time}) at this time. Please contact the examination cell so a replacement can be arranged.`
      : null,
  });
});

me.delete('/unavailability/:id', (req, res) => {
  const tid = teacherOf(req);
  db.prepare('DELETE FROM teacher_unavailability WHERE id = ? AND teacher_id = ?').run(req.params.id, tid);
  res.json({ ok: true });
});

/* ------------------------------------------------------- public endpoints */

export const pub = Router();

pub.get('/info', (_req, res) => {
  const s = getSettings();
  res.json({
    institution_name: s.institution_name,
    institution_short: s.institution_short,
    institution_address: s.institution_address,
    exam_cell_name: s.exam_cell_name,
    controller_name: s.controller_name,
    report_before_min: s.report_before_min,
  });
});

const lookups = new Map();
pub.get('/seat', (req, res) => {
  const now = Date.now();
  const list = (lookups.get(req.ip) || []).filter((t) => now - t < 60 * 1000);
  if (list.length > 30) throw new HttpError(429, 'Too many searches. Please wait a minute and try again.');
  list.push(now);
  lookups.set(req.ip, list);

  const roll = clean(req.query.roll);
  if (!roll) throw new HttpError(400, 'Enter your roll number.');
  const student = db
    .prepare(
      `SELECT s.id, s.roll_no, s.name, s.semester, c.code AS course_code, c.name AS course_name
       FROM students s JOIN courses c ON c.id = s.course_id WHERE s.roll_no = ?`,
    )
    .get(roll);
  if (!student) throw new HttpError(404, 'No student found with this roll number. Check it and try again.');
  const rows = db
    .prepare(
      `SELECT sa.plan_id, sa.room_id, sa.r, sa.c, sa.paper_id, s.id AS slot_id, s.exam_name, s.date, s.start_time, s.duration_min, s.session
       FROM seat_assignments sa JOIN plans p ON p.id = sa.plan_id JOIN slots s ON s.id = p.slot_id
       WHERE sa.student_id = ? AND p.status != 'draft' AND s.date >= ?
       ORDER BY s.date, s.start_time`,
    )
    .all(student.id, todayISO());
  const exams = rows.map((r) => {
    const [room] = getRooms([r.room_id]);
    const seats = buildSeats(room.layout, room.blocked);
    const seat = seats.find((s) => s.r === r.r && s.c === r.c);
    const paper = getPapers(r.slot_id).find((p) => p.id === r.paper_id);
    return {
      slot: { id: r.slot_id, exam_name: r.exam_name, date: r.date, start_time: r.start_time, end_time: endTime(r), duration_min: r.duration_min, session: r.session },
      paper: paper ? { short: paper.short, subject: paper.subject, subject_code: paper.subject_code } : null,
      room: { id: room.id, name: room.name, building: room.building, floor: room.floor, layout: room.layout, blocked: room.blocked },
      seat: { r: r.r, c: r.c, label: seat?.label ?? `${r.r + 1}-${r.c + 1}` },
    };
  });
  res.json({ student: { roll_no: student.roll_no, name: student.name, course_code: student.course_code, course_name: student.course_name, semester: student.semester }, exams });
});
