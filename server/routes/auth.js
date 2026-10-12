import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, logActivity } from '../db.js';
import { authenticate, clearSession, issueSession, loadUser } from '../auth.js';
import { HttpError } from '../util.js';

const router = Router();

const attempts = new Map();
function throttle(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (list.length >= 10) throw new HttpError(429, 'Too many sign-in attempts. Please wait a few minutes and try again.');
  list.push(now);
  attempts.set(key, list);
}

router.post('/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw new HttpError(400, 'Enter your email and password.');
  throttle(`${req.ip}:${email}`);
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    // First sign-in for a teacher: their Employee ID is the initial password.
    const t = db.prepare('SELECT * FROM teachers WHERE email = ? AND is_active = 1').get(email);
    if (t?.emp_code && password.trim().toUpperCase() === t.emp_code.toUpperCase()) {
      const id = db
        .prepare(
          `INSERT INTO users (name, email, password_hash, role, teacher_id, must_change_password)
           VALUES (?, ?, ?, 'teacher', ?, 1)`,
        )
        .run(t.name, t.email, bcrypt.hashSync(password, 10), t.id).lastInsertRowid;
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }
  }
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    throw new HttpError(401, 'That email and password combination is not correct.');
  attempts.delete(`${req.ip}:${email}`);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  issueSession(res, user);
  const me = loadUser.get(user.id);
  res.json({ user: { ...me, must_change_password: !!me.must_change_password } });
});

router.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

router.post('/change-password', authenticate, (req, res) => {
  const { current, next } = req.body || {};
  if (!next || String(next).length < 8) throw new HttpError(400, 'Choose a password with at least 8 characters.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(String(current || ''), user.password_hash))
    throw new HttpError(400, 'Your current password is not correct.');
  if (String(current) === String(next)) throw new HttpError(400, 'Your new password must be different from the current one.');
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
    bcrypt.hashSync(String(next), 10),
    user.id,
  );
  logActivity(req.user, 'Changed password');
  res.json({ ok: true });
});

export default router;
