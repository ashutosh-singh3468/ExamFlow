import { Router } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, DEFAULT_SETTINGS, db, getSettings, logActivity, saveSettings } from '../db.js';
import { HttpError, clean, endTime, fmtDate, fmtTime12, todayISO } from '../util.js';
import { getPapers, planSummary } from '../services/plans.js';
import { sendTestEmail, smtpConfigured } from '../services/mailer.js';

const router = Router();

/* -------------------------------------------------------------- dashboard */

router.get('/dashboard', (_req, res) => {
  const today = todayISO();
  const settings = getSettings();
  const n = (sql, ...a) => db.prepare(sql).get(...a).n;

  const rooms = db.prepare('SELECT COUNT(*) AS n, SUM(is_active) AS active FROM rooms').get();
  const counts = {
    layouts: n('SELECT COUNT(*) AS n FROM layouts'),
    rooms: rooms.n,
    active_rooms: rooms.active || 0,
    courses: n('SELECT COUNT(*) AS n FROM courses'),
    students: n('SELECT COUNT(*) AS n FROM students'),
    teachers: n('SELECT COUNT(*) AS n FROM teachers WHERE is_active = 1'),
    slots: n('SELECT COUNT(*) AS n FROM slots'),
    upcoming_slots: n('SELECT COUNT(*) AS n FROM slots WHERE date >= ?', today),
    exam_days: n('SELECT COUNT(DISTINCT date) AS n FROM slots WHERE date >= ?', today),
    duties: n('SELECT COUNT(*) AS n FROM duties'),
  };
  const seatRows = db
    .prepare(`SELECT r.blocked_seats, l.rows, l.cols FROM rooms r JOIN layouts l ON l.id = r.layout_id WHERE r.is_active = 1`)
    .all();
  counts.seats = seatRows.reduce((s, r) => s + r.rows * r.cols - JSON.parse(r.blocked_seats || '[]').length, 0);

  const slots = db.prepare('SELECT * FROM slots ORDER BY date, start_time').all();
  const planBySlot = new Map(db.prepare('SELECT id, slot_id FROM plans').all().map((p) => [p.slot_id, p.id]));
  const summaries = new Map();
  for (const [slotId, planId] of planBySlot) summaries.set(slotId, planSummary(planId));

  const status = { none: 0, draft: 0, approved: 0, notified: 0 };
  for (const s of slots) {
    if (s.date < today) continue;
    const p = summaries.get(s.id);
    status[p ? p.status : 'none']++;
  }

  const upcoming = slots
    .filter((s) => s.date >= today)
    .slice(0, 8)
    .map((s) => {
      const papers = getPapers(s.id);
      return {
        ...s,
        end_time: endTime(s),
        papers,
        student_count: papers.reduce((x, p) => x + p.student_count, 0),
        plan: summaries.get(s.id) || null,
      };
    });

  const alerts = [];
  for (const s of slots) {
    if (s.date < today) continue;
    const label = `${s.exam_name} · ${fmtDate(s.date, { day: 'numeric', month: 'short' })}, ${fmtTime12(s.start_time)}`;
    const p = summaries.get(s.id);
    if (!p) {
      alerts.push({ severity: 'info', title: 'Seating not generated', message: label, link: `/plans/new?slot=${s.id}`, action: 'Generate' });
      continue;
    }
    const errors = p.issues.filter((i) => i.severity === 'error');
    const warnings = p.issues.filter((i) => i.severity === 'warning');
    if (errors.length)
      alerts.push({
        severity: 'error',
        title: `${errors.length} conflict${errors.length > 1 ? 's' : ''} to resolve`,
        message: `${label} — ${errors[0].message}`,
        link: `/plans/${p.id}`,
        action: 'Review',
      });
    else if (warnings.length)
      alerts.push({
        severity: 'warning',
        title: `${warnings.length} warning${warnings.length > 1 ? 's' : ''}`,
        message: `${label} — ${warnings[0].message}`,
        link: `/plans/${p.id}`,
        action: 'Review',
      });
    if (p.status === 'draft' && !errors.length)
      alerts.push({ severity: 'info', title: 'Ready for approval', message: label, link: `/plans/${p.id}`, action: 'Approve' });
    if (p.status === 'approved')
      alerts.push({ severity: 'info', title: 'Teachers not yet notified', message: label, link: `/plans/${p.id}`, action: 'Notify' });
  }
  const noEmail = n("SELECT COUNT(*) AS n FROM teachers WHERE is_active = 1 AND (email IS NULL OR email = '')");
  if (noEmail)
    alerts.push({
      severity: 'warning',
      title: `${noEmail} teacher${noEmail > 1 ? 's have' : ' has'} no email address`,
      message: 'They will not receive duty notifications.',
      link: '/teachers',
      action: 'Fix',
    });
  const failed = n("SELECT COUNT(*) AS n FROM emails WHERE status = 'failed'");
  if (failed)
    alerts.push({ severity: 'warning', title: `${failed} email${failed > 1 ? 's' : ''} failed to send`, message: 'Check the outbox for details.', link: '/notifications', action: 'Open' });

  const order = { error: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  const workload = db
    .prepare(
      `SELECT t.id, t.name, t.department, COUNT(d.id) AS duties
       FROM teachers t LEFT JOIN duties d ON d.teacher_id = t.id
       WHERE t.is_active = 1 GROUP BY t.id ORDER BY duties DESC, t.name`,
    )
    .all();
  const dutyCounts = workload.map((w) => w.duties);
  const avg = dutyCounts.length ? dutyCounts.reduce((a, b) => a + b, 0) / dutyCounts.length : 0;

  const activity = db.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT 12').all();

  res.json({
    counts,
    status,
    upcoming,
    alerts,
    workload: {
      teachers: workload,
      avg,
      max: dutyCounts.length ? Math.max(...dutyCounts) : 0,
      min: dutyCounts.length ? Math.min(...dutyCounts) : 0,
    },
    activity,
    setup: {
      institution: settings.institution_name !== DEFAULT_SETTINGS.institution_name,
      layouts: counts.layouts > 0,
      rooms: counts.rooms > 0,
      students: counts.students > 0,
      teachers: counts.teachers > 0,
      slots: counts.slots > 0,
      plans: planBySlot.size > 0,
      email: smtpConfigured(settings),
    },
  });
});

router.get('/activity', (_req, res) => {
  res.json(db.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT 200').all());
});

/* --------------------------------------------------------------- settings */

function publicSettings() {
  const s = getSettings();
  return { ...s, smtp_pass: '', has_smtp_pass: !!s.smtp_pass, smtp_configured: smtpConfigured(s) };
}

router.get('/settings', (_req, res) => res.json(publicSettings()));

router.put('/settings', (req, res) => {
  const patch = { ...(req.body || {}) };
  if (patch.smtp_pass === '' || patch.smtp_pass === undefined) delete patch.smtp_pass;
  if (req.body?.clear_smtp_pass) patch.smtp_pass = '';
  for (const k of ['students_per_invigilator', 'min_invigilators_per_room', 'reserve_invigilators', 'max_duties_per_day', 'min_gap_minutes', 'report_before_min', 'default_duration_min', 'smtp_port']) {
    if (k in patch) patch[k] = Math.max(0, Math.round(Number(patch[k]) || 0));
  }
  if ('students_per_invigilator' in patch) patch.students_per_invigilator = Math.max(1, patch.students_per_invigilator);
  if ('max_duties_per_day' in patch) patch.max_duties_per_day = Math.max(1, patch.max_duties_per_day);
  if ('sessions' in patch && !Array.isArray(patch.sessions)) delete patch.sessions;
  saveSettings(patch);
  logActivity(req.user, 'Updated settings');
  res.json(publicSettings());
});

router.post('/settings/test-email', async (req, res) => {
  const to = clean(req.body?.to) || req.user.email;
  await sendTestEmail(to);
  res.json({ ok: true, message: `Test email sent to ${to}.` });
});

/* ----------------------------------------------------------------- emails */

router.get('/emails', (req, res) => {
  const where = [];
  const args = [];
  if (req.query.status) {
    where.push('e.status = ?');
    args.push(req.query.status);
  }
  if (req.query.plan_id) {
    where.push('e.plan_id = ?');
    args.push(Number(req.query.plan_id));
  }
  const rows = db
    .prepare(
      `SELECT e.id, e.plan_id, e.teacher_id, e.to_email, e.to_name, e.subject, e.status, e.error, e.created_at,
              s.exam_name, s.date, s.start_time
       FROM emails e LEFT JOIN plans p ON p.id = e.plan_id LEFT JOIN slots s ON s.id = p.slot_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY e.id DESC LIMIT 500`,
    )
    .all(...args);
  const totals = db.prepare('SELECT status, COUNT(*) AS n FROM emails GROUP BY status').all();
  res.json({ items: rows, totals: Object.fromEntries(totals.map((t) => [t.status, t.n])), smtp_configured: smtpConfigured() });
});

router.get('/emails/:id', (req, res) => {
  const e = db.prepare('SELECT * FROM emails WHERE id = ?').get(req.params.id);
  if (!e) throw new HttpError(404, 'Email not found.');
  res.json(e);
});

/* ------------------------------------------------------------------ users */

router.get('/users', (_req, res) => {
  res.json(db.prepare("SELECT id, name, email, role, last_login_at, created_at FROM users WHERE role = 'admin' ORDER BY name").all());
});

router.post('/users', (req, res) => {
  const name = clean(req.body?.name);
  const email = clean(req.body?.email)?.toLowerCase();
  const password = String(req.body?.password || '');
  if (!name || !email) throw new HttpError(400, 'Enter a name and email address.');
  if (password.length < 8) throw new HttpError(400, 'The password must have at least 8 characters.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'An account with this email already exists.');
  db.prepare("INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, 'admin', 1)").run(
    name,
    email,
    bcrypt.hashSync(password, 10),
  );
  logActivity(req.user, 'Added administrator', `${name} (${email})`);
  res.status(201).json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  if (Number(req.params.id) === req.user.id) throw new HttpError(400, 'You cannot remove your own account.');
  const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
  if (admins <= 1) throw new HttpError(400, 'At least one administrator is required.');
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'admin'").run(req.params.id);
  res.json({ ok: true });
});

/* ----------------------------------------------------------------- backup */

router.get('/backup', async (req, res) => {
  const file = path.join(DATA_DIR, `backup-${Date.now()}.db`);
  await db.backup(file);
  logActivity(req.user, 'Downloaded database backup');
  res.download(file, `examflow-backup-${todayISO()}.db`, () => fs.rm(file, { force: true }, () => {}));
});

export default router;
