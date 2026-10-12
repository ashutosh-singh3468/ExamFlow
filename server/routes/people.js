import { Router } from 'express';
import { db, logActivity } from '../db.js';
import { HttpError, clean, endTime, naturalCompare, requireFields, todayISO } from '../util.js';

const router = Router();

export function normalizeSemester(v) {
  const s = clean(v);
  if (!s) return null;
  const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
  const t = s
    .toLowerCase()
    .replace(/^(semester|sem)\.?\s*[-:]?\s*/, '')
    .replace(/\s*(semester|sem)$/, '')
    .replace(/(st|nd|rd|th)$/, '')
    .trim();
  if (roman[t]) return String(roman[t]);
  if (/^\d+$/.test(t)) return String(Number(t));
  return s;
}

/* --------------------------------------------------------------- students */

router.get('/students', (req, res) => {
  const where = [];
  const args = [];
  if (req.query.q) {
    where.push('(s.roll_no LIKE ? OR s.name LIKE ? OR s.email LIKE ?)');
    const q = `%${String(req.query.q).trim()}%`;
    args.push(q, q, q);
  }
  if (req.query.course_id) {
    where.push('s.course_id = ?');
    args.push(Number(req.query.course_id));
  }
  if (req.query.semester) {
    where.push('s.semester = ?');
    args.push(String(req.query.semester));
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM students s ${w}`).get(...args).n;
  const all = req.query.pageSize === 'all';
  const pageSize = all ? total || 1 : Math.min(200, Math.max(5, Number(req.query.pageSize) || 25));
  const page = Math.max(1, Number(req.query.page) || 1);
  const items = db
    .prepare(
      `SELECT s.*, c.code AS course_code, c.name AS course_name FROM students s JOIN courses c ON c.id = s.course_id ${w}`,
    )
    .all(...args)
    .sort((a, b) => naturalCompare(a.roll_no, b.roll_no))
    .slice((page - 1) * pageSize, page * pageSize);
  res.json({ items, total, page, pageSize });
});

function studentInput(body) {
  requireFields(body, ['roll_no', 'name', 'course_id']);
  if (!db.prepare('SELECT 1 FROM courses WHERE id = ?').get(body.course_id)) throw new HttpError(400, 'Choose a valid course.');
  return {
    roll_no: clean(body.roll_no).toUpperCase(),
    name: clean(body.name),
    course_id: Number(body.course_id),
    semester: normalizeSemester(body.semester),
    email: clean(body.email),
  };
}

router.post('/students', (req, res) => {
  const s = studentInput(req.body);
  if (db.prepare('SELECT 1 FROM students WHERE roll_no = ?').get(s.roll_no))
    throw new HttpError(409, `Roll number ${s.roll_no} already exists.`);
  const id = db
    .prepare('INSERT INTO students (roll_no, name, course_id, semester, email) VALUES (?, ?, ?, ?, ?)')
    .run(s.roll_no, s.name, s.course_id, s.semester, s.email).lastInsertRowid;
  res.status(201).json({ id });
});

router.put('/students/:id', (req, res) => {
  const s = studentInput(req.body);
  const dup = db.prepare('SELECT id FROM students WHERE roll_no = ? AND id != ?').get(s.roll_no, req.params.id);
  if (dup) throw new HttpError(409, `Roll number ${s.roll_no} already exists.`);
  db.prepare('UPDATE students SET roll_no = ?, name = ?, course_id = ?, semester = ?, email = ? WHERE id = ?').run(
    s.roll_no,
    s.name,
    s.course_id,
    s.semester,
    s.email,
    req.params.id,
  );
  res.json({ ok: true });
});

router.delete('/students/:id', (req, res) => {
  db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/students/bulk-delete', (req, res) => {
  const ids = (req.body?.ids || []).map(Number).filter(Boolean);
  const del = db.prepare('DELETE FROM students WHERE id = ?');
  db.transaction(() => ids.forEach((id) => del.run(id)))();
  logActivity(req.user, 'Deleted students', `${ids.length} student record(s)`);
  res.json({ deleted: ids.length });
});

router.post('/students/import', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const mode = req.body?.mode === 'replace' ? 'replace' : 'upsert';
  if (!rows.length) throw new HttpError(400, 'The file does not contain any rows to import.');
  if (rows.length > 50000) throw new HttpError(400, 'Please import at most 50,000 students at a time.');

  const byKey = new Map();
  for (const c of db.prepare('SELECT * FROM courses').all()) {
    byKey.set(c.code.toLowerCase(), c);
    byKey.set(c.name.toLowerCase(), c);
  }
  const result = { created: 0, updated: 0, skipped: 0, courses_created: [], errors: [] };
  const findStudent = db.prepare('SELECT id FROM students WHERE roll_no = ?');
  const insert = db.prepare('INSERT INTO students (roll_no, name, course_id, semester, email) VALUES (?, ?, ?, ?, ?)');
  const update = db.prepare(
    'UPDATE students SET name = ?, course_id = ?, semester = ?, email = COALESCE(?, email) WHERE id = ?',
  );
  const insertCourse = db.prepare('INSERT INTO courses (code, name, department) VALUES (?, ?, ?)');

  db.transaction(() => {
    if (mode === 'replace') db.prepare('DELETE FROM students').run();
    rows.forEach((row, i) => {
      const line = row._row ?? i + 2;
      const roll = clean(row.roll_no)?.toUpperCase();
      const name = clean(row.name);
      const course = clean(row.course);
      if (!roll || !name || !course) {
        result.skipped++;
        result.errors.push({ row: line, message: `Missing ${[!roll && 'roll number', !name && 'name', !course && 'course'].filter(Boolean).join(', ')}` });
        return;
      }
      let c = byKey.get(course.toLowerCase());
      if (!c) {
        const code = course.toUpperCase().replace(/\s+/g, '-').slice(0, 24);
        c = byKey.get(code.toLowerCase());
        if (!c) {
          const id = insertCourse.run(code, course, clean(row.department)).lastInsertRowid;
          c = { id, code, name: course };
          result.courses_created.push(code);
        }
        byKey.set(course.toLowerCase(), c);
        byKey.set(code.toLowerCase(), c);
      }
      const sem = normalizeSemester(row.semester);
      const existing = findStudent.get(roll);
      if (existing) {
        update.run(name, c.id, sem, clean(row.email), existing.id);
        result.updated++;
      } else {
        insert.run(roll, name, c.id, sem, clean(row.email));
        result.created++;
      }
    });
  })();
  logActivity(
    req.user,
    'Imported students',
    `${result.created} added, ${result.updated} updated${result.skipped ? `, ${result.skipped} skipped` : ''}`,
  );
  res.json(result);
});

/* --------------------------------------------------------------- teachers */

function teacherInput(body) {
  requireFields(body, ['name', 'emp_code']);
  const email = clean(body.email)?.toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  const max = clean(body.max_duties);
  return {
    emp_code: clean(body.emp_code).toUpperCase(),
    name: clean(body.name),
    email,
    department: clean(body.department),
    designation: clean(body.designation),
    phone: clean(body.phone),
    max_duties: max === null ? null : Math.max(0, Math.round(Number(max))) || null,
    is_active: body.is_active === false || body.is_active === 0 ? 0 : 1,
  };
}

function syncAccount(teacherId) {
  const t = db.prepare('SELECT * FROM teachers WHERE id = ?').get(teacherId);
  const u = db.prepare('SELECT * FROM users WHERE teacher_id = ?').get(teacherId);
  if (!u || !t) return;
  if (!t.email) {
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    return;
  }
  const clash = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(t.email, u.id);
  if (!clash) db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(t.name, t.email, u.id);
}

router.get('/teachers', (_req, res) => {
  const today = todayISO();
  const teachers = db
    .prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM duties d WHERE d.teacher_id = t.id) AS duty_count,
        (SELECT COUNT(*) FROM duties d JOIN plans p ON p.id = d.plan_id JOIN slots s ON s.id = p.slot_id
           WHERE d.teacher_id = t.id AND s.date >= ?) AS upcoming_duties,
        (SELECT COUNT(*) FROM teacher_unavailability u WHERE u.teacher_id = t.id AND u.date >= ?) AS unavailable_count,
        (SELECT u.last_login_at FROM users u WHERE u.teacher_id = t.id) AS last_login_at,
        (SELECT COUNT(*) FROM users u WHERE u.teacher_id = t.id) AS has_account
       FROM teachers t ORDER BY t.name`,
    )
    .all(today, today);
  res.json(teachers);
});

router.get('/teachers/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.params.id);
  if (!t) throw new HttpError(404, 'Teacher not found.');
  res.json({ ...t, duties: teacherDuties(t.id, { includeDrafts: true }), unavailability: listUnavailability(t.id) });
});

router.post('/teachers', (req, res) => {
  const t = teacherInput(req.body);
  if (db.prepare('SELECT 1 FROM teachers WHERE emp_code = ?').get(t.emp_code))
    throw new HttpError(409, `Employee ID ${t.emp_code} already exists.`);
  if (t.email && db.prepare('SELECT 1 FROM teachers WHERE email = ?').get(t.email))
    throw new HttpError(409, `${t.email} is already used by another teacher.`);
  const id = db
    .prepare(
      'INSERT INTO teachers (emp_code, name, email, department, designation, phone, max_duties, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(t.emp_code, t.name, t.email, t.department, t.designation, t.phone, t.max_duties, t.is_active).lastInsertRowid;
  logActivity(req.user, 'Added teacher', t.name);
  res.status(201).json({ id });
});

router.put('/teachers/:id', (req, res) => {
  const t = teacherInput(req.body);
  if (db.prepare('SELECT 1 FROM teachers WHERE emp_code = ? AND id != ?').get(t.emp_code, req.params.id))
    throw new HttpError(409, `Employee ID ${t.emp_code} already exists.`);
  if (t.email && db.prepare('SELECT 1 FROM teachers WHERE email = ? AND id != ?').get(t.email, req.params.id))
    throw new HttpError(409, `${t.email} is already used by another teacher.`);
  db.prepare(
    'UPDATE teachers SET emp_code = ?, name = ?, email = ?, department = ?, designation = ?, phone = ?, max_duties = ?, is_active = ? WHERE id = ?',
  ).run(t.emp_code, t.name, t.email, t.department, t.designation, t.phone, t.max_duties, t.is_active, req.params.id);
  syncAccount(Number(req.params.id));
  res.json({ ok: true });
});

router.delete('/teachers/:id', (req, res) => {
  const locked = db
    .prepare(
      `SELECT COUNT(*) AS n FROM duties d JOIN plans p ON p.id = d.plan_id WHERE d.teacher_id = ? AND p.status != 'draft'`,
    )
    .get(req.params.id).n;
  if (locked)
    throw new HttpError(409, `This teacher has ${locked} duty assignment${locked > 1 ? 's' : ''} in approved plans. Mark them inactive instead.`);
  const t = db.prepare('SELECT name FROM teachers WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM teachers WHERE id = ?').run(req.params.id);
  logActivity(req.user, 'Removed teacher', t?.name);
  res.json({ ok: true });
});

router.post('/teachers/:id/reset-password', (req, res) => {
  const t = db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.params.id);
  if (!t) throw new HttpError(404, 'Teacher not found.');
  db.prepare('DELETE FROM users WHERE teacher_id = ?').run(t.id);
  logActivity(req.user, 'Reset teacher password', t.name);
  res.json({ ok: true, message: `${t.name} can now sign in with their Employee ID (${t.emp_code}) as the password.` });
});

router.post('/teachers/import', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) throw new HttpError(400, 'The file does not contain any rows to import.');
  const result = { created: 0, updated: 0, skipped: 0, errors: [] };
  const byCode = db.prepare('SELECT id FROM teachers WHERE emp_code = ?');
  const byEmail = db.prepare('SELECT id FROM teachers WHERE email = ?');
  const insert = db.prepare(
    'INSERT INTO teachers (emp_code, name, email, department, designation, phone, max_duties) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const update = db.prepare(
    `UPDATE teachers SET emp_code = ?, name = ?, email = COALESCE(?, email), department = COALESCE(?, department),
     designation = COALESCE(?, designation), phone = COALESCE(?, phone), max_duties = COALESCE(?, max_duties) WHERE id = ?`,
  );
  db.transaction(() => {
    rows.forEach((row, i) => {
      const line = row._row ?? i + 2;
      let t;
      try {
        t = teacherInput({ ...row, is_active: true });
      } catch (e) {
        result.skipped++;
        result.errors.push({ row: line, message: e.message });
        return;
      }
      const existing = byCode.get(t.emp_code) || (t.email && byEmail.get(t.email));
      try {
        if (existing) {
          update.run(t.emp_code, t.name, t.email, t.department, t.designation, t.phone, t.max_duties, existing.id);
          syncAccount(existing.id);
          result.updated++;
        } else {
          insert.run(t.emp_code, t.name, t.email, t.department, t.designation, t.phone, t.max_duties);
          result.created++;
        }
      } catch (e) {
        result.skipped++;
        result.errors.push({ row: line, message: /UNIQUE/.test(e.message) ? 'Duplicate email or Employee ID' : e.message });
      }
    });
  })();
  logActivity(req.user, 'Imported teachers', `${result.created} added, ${result.updated} updated`);
  res.json(result);
});

/* ----------------------------------------------------- availability helpers */

export function listUnavailability(teacherId) {
  return db
    .prepare(
      `SELECT u.*, s.exam_name, s.start_time, s.duration_min, s.session
       FROM teacher_unavailability u LEFT JOIN slots s ON s.id = u.slot_id
       WHERE u.teacher_id = ? ORDER BY u.date, s.start_time`,
    )
    .all(teacherId)
    .map((u) => ({ ...u, end_time: u.slot_id ? endTime(u) : null }));
}

export function addUnavailability(teacherId, body, user) {
  const slotId = body?.slot_id ? Number(body.slot_id) : null;
  let date = clean(body?.date);
  if (slotId) {
    const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
    if (!slot) throw new HttpError(400, 'Exam slot not found.');
    date = slot.date;
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Choose a date.');
  const dup = db
    .prepare('SELECT 1 FROM teacher_unavailability WHERE teacher_id = ? AND date = ? AND IFNULL(slot_id, 0) = IFNULL(?, 0)')
    .get(teacherId, date, slotId);
  if (dup) throw new HttpError(409, 'This unavailability is already recorded.');
  const id = db
    .prepare('INSERT INTO teacher_unavailability (teacher_id, date, slot_id, reason) VALUES (?, ?, ?, ?)')
    .run(teacherId, date, slotId, clean(body?.reason)).lastInsertRowid;
  const t = db.prepare('SELECT name FROM teachers WHERE id = ?').get(teacherId);
  logActivity(user, 'Recorded unavailability', `${t?.name} — ${date}${clean(body?.reason) ? ` (${clean(body.reason)})` : ''}`);
  return id;
}

router.get('/teachers/:id/unavailability', (req, res) => res.json(listUnavailability(Number(req.params.id))));

router.post('/teachers/:id/unavailability', (req, res) => {
  const id = addUnavailability(Number(req.params.id), req.body, req.user);
  res.status(201).json({ id });
});

router.delete('/teachers/:id/unavailability/:uid', (req, res) => {
  db.prepare('DELETE FROM teacher_unavailability WHERE id = ? AND teacher_id = ?').run(req.params.uid, req.params.id);
  res.json({ ok: true });
});

export function teacherDuties(teacherId, { includeDrafts = false } = {}) {
  return db
    .prepare(
      `SELECT d.id, d.role, d.room_id, d.plan_id, p.status, s.id AS slot_id, s.exam_name, s.date, s.start_time, s.duration_min, s.session,
              r.name AS room_name, r.building, r.floor,
              (SELECT COUNT(*) FROM seat_assignments sa WHERE sa.plan_id = p.id AND sa.room_id = d.room_id) AS students
       FROM duties d JOIN plans p ON p.id = d.plan_id JOIN slots s ON s.id = p.slot_id
       LEFT JOIN rooms r ON r.id = d.room_id
       WHERE d.teacher_id = ? ${includeDrafts ? '' : "AND p.status != 'draft'"}
       ORDER BY s.date, s.start_time`,
    )
    .all(teacherId)
    .map((d) => ({ ...d, end_time: endTime(d) }));
}

export default router;
