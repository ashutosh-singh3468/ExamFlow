import { Router } from 'express';
import { db, logActivity } from '../db.js';
import { HttpError } from '../util.js';

const router = Router();

const SCOPES = {
  plans: ['DELETE FROM emails', 'DELETE FROM plans'],
  schedule: ['DELETE FROM emails', 'DELETE FROM plans', 'DELETE FROM teacher_unavailability', 'DELETE FROM slots'],
  students: ['DELETE FROM students'],
  teachers: ["DELETE FROM users WHERE role = 'teacher'", 'DELETE FROM teachers'],
  everything: [
    'DELETE FROM emails',
    'DELETE FROM plans',
    'DELETE FROM teacher_unavailability',
    'DELETE FROM slots',
    'DELETE FROM students',
    'DELETE FROM courses',
    "DELETE FROM users WHERE role = 'teacher'",
    'DELETE FROM teachers',
    'DELETE FROM rooms',
    'DELETE FROM layouts',
    'DELETE FROM activity',
  ],
};

const LABELS = {
  plans: 'all seating plans and sent emails',
  schedule: 'the exam schedule, seating plans and availability records',
  students: 'all students',
  teachers: 'all teachers and their accounts',
  everything: 'all data (administrators and settings are kept)',
};

router.post('/data/clear', (req, res) => {
  const scope = req.body?.scope;
  if (!SCOPES[scope]) throw new HttpError(400, 'Unknown data scope.');
  if (req.body?.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.');
  db.transaction(() => SCOPES[scope].forEach((sql) => db.prepare(sql).run()))();
  logActivity(req.user, 'Cleared data', LABELS[scope]);
  res.json({ ok: true, message: `Removed ${LABELS[scope]}.` });
});

export default router;
