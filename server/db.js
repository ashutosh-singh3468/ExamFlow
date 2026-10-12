import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'examflow.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY,
  emp_code TEXT UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  email TEXT UNIQUE COLLATE NOCASE,
  department TEXT,
  designation TEXT,
  phone TEXT,
  max_duties INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher')),
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS layouts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'grid' CHECK (kind IN ('grid', 'circular')),
  rows INTEGER NOT NULL,
  cols INTEGER NOT NULL,
  numbering TEXT NOT NULL DEFAULT 'row-letter',
  prefix TEXT NOT NULL DEFAULT '',
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  building TEXT,
  floor TEXT,
  layout_id INTEGER NOT NULL REFERENCES layouts(id),
  blocked_seats TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  department TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  roll_no TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  semester TEXT,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_students_course ON students(course_id, semester);

CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY,
  exam_name TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 90,
  session TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_slots_date ON slots(date, start_time);

CREATE TABLE IF NOT EXISTS slot_papers (
  id INTEGER PRIMARY KEY,
  slot_id INTEGER NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  semester TEXT,
  subject TEXT,
  subject_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_slot_papers_slot ON slot_papers(slot_id);

CREATE TABLE IF NOT EXISTS teacher_unavailability (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  slot_id INTEGER REFERENCES slots(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_unavail_teacher ON teacher_unavailability(teacher_id, date);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY,
  slot_id INTEGER NOT NULL UNIQUE REFERENCES slots(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'notified')),
  room_ids TEXT NOT NULL DEFAULT '[]',
  options TEXT NOT NULL DEFAULT '{}',
  generated_at TEXT,
  updated_at TEXT,
  approved_at TEXT,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notified_at TEXT
);

CREATE TABLE IF NOT EXISTS seat_assignments (
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  r INTEGER NOT NULL,
  c INTEGER NOT NULL,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  paper_id INTEGER REFERENCES slot_papers(id) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, room_id, r, c),
  UNIQUE (plan_id, student_id)
);

CREATE TABLE IF NOT EXISTS duties (
  id INTEGER PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'invigilator' CHECK (role IN ('invigilator', 'reserve')),
  UNIQUE (plan_id, teacher_id)
);
CREATE INDEX IF NOT EXISTS idx_duties_teacher ON duties(teacher_id);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY,
  plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  to_email TEXT,
  to_name TEXT,
  subject TEXT,
  body_html TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

export const DEFAULT_SETTINGS = {
  institution_name: 'Demo Institute of Technology',
  institution_short: 'DIT',
  institution_address: 'Campus Road, City — 000000',
  exam_cell_name: 'Office of the Controller of Examinations',
  controller_name: 'Controller of Examinations',
  default_duration_min: 90,
  sessions: [
    { name: 'Morning', start: '09:30' },
    { name: 'Afternoon', start: '14:00' },
  ],
  adjacency_mode: 'cross',
  room_usage: 'minimum',
  students_per_invigilator: 30,
  min_invigilators_per_room: 1,
  reserve_invigilators: 0,
  max_duties_per_day: 1,
  min_gap_minutes: 60,
  avoid_same_department: true,
  report_before_min: 20,
  smtp_host: '',
  smtp_port: 587,
  smtp_secure: false,
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  app_url: '',
};

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    try {
      out[key] = JSON.parse(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function saveSettings(patch) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) {
      if (!(k in DEFAULT_SETTINGS)) continue;
      stmt.run(k, JSON.stringify(v));
    }
  });
  tx(Object.entries(patch));
  return getSettings();
}

export function logActivity(user, action, details = null) {
  db.prepare('INSERT INTO activity (user_id, user_name, action, details) VALUES (?, ?, ?, ?)').run(
    user?.id ?? null,
    user?.name ?? 'System',
    action,
    details,
  );
}

export function isEmpty() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;
}

export const parseJSON = (s, fallback) => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};
