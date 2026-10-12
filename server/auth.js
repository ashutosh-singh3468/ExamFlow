import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { db, DATA_DIR } from './db.js';
import { HttpError } from './util.js';

const COOKIE = 'ef_token';

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, '.jwt-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret);
  return secret;
}

const SECRET = loadSecret();

export function issueSession(res, user) {
  const token = jwt.sign({ uid: user.id }, SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE);
}

const loadUser = db.prepare(`
  SELECT u.id, u.name, u.email, u.role, u.teacher_id, u.must_change_password, u.last_login_at,
         t.department, t.designation, t.emp_code
  FROM users u LEFT JOIN teachers t ON t.id = u.teacher_id
  WHERE u.id = ?`);

export function authenticate(req, _res, next) {
  const header = req.headers.authorization;
  const token = req.cookies?.[COOKIE] || (header?.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return next(new HttpError(401, 'Please sign in to continue.'));
  try {
    const payload = jwt.verify(token, SECRET);
    const user = loadUser.get(payload.uid);
    if (!user) return next(new HttpError(401, 'Your session has expired. Please sign in again.'));
    req.user = { ...user, must_change_password: !!user.must_change_password };
    next();
  } catch {
    next(new HttpError(401, 'Your session has expired. Please sign in again.'));
  }
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have access to this area.'));
    next();
  };

export { loadUser };
