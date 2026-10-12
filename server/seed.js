import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { db, saveSettings } from './db.js';
import { seededRandom } from './services/seating.js';
import { generatePlan, getSlot, suggestRooms } from './services/plans.js';
import { notifyPlan } from './services/mailer.js';

/**
 * Demo data so the system can be explored straight away.
 * Sign-in details are listed in README.md.
 */

const FIRST = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Rohan', 'Kabir',
  'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Pari', 'Myra', 'Anika', 'Navya', 'Kiara', 'Ira', 'Meera', 'Riya',
  'Rahul', 'Karan', 'Nikhil', 'Siddharth', 'Varun', 'Yash', 'Pranav', 'Dev', 'Harsh', 'Manav', 'Om', 'Tanish',
  'Sneha', 'Pooja', 'Kavya', 'Nisha', 'Priya', 'Shruti', 'Tanvi', 'Isha', 'Aditi', 'Neha', 'Sakshi', 'Simran',
  'Mohammed', 'Faisal', 'Zoya', 'Sara', 'Aman', 'Gurpreet', 'Harleen', 'Joseph', 'Mary', 'Thomas', 'Lakshmi', 'Arun',
];
const LAST = [
  'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Menon', 'Das', 'Bose',
  'Chatterjee', 'Mukherjee', 'Joshi', 'Kulkarni', 'Deshpande', 'Rao', 'Pillai', 'Khan', 'Ahmed', 'Mehta', 'Shah', 'Jain',
  'Agarwal', 'Bansal', 'Malhotra', 'Kapoor', 'Chopra', 'Saxena', 'Mishra', 'Pandey', 'Tiwari', 'Yadav', 'Thakur', 'Gill',
];

const COURSES = [
  { code: 'BCA', name: 'Bachelor of Computer Applications', department: 'Computer Science', sems: { 1: ['Programming in C', 'BCA101'], 3: ['Data Structures', 'BCA301'], 5: ['Web Technologies', 'BCA501'] } },
  { code: 'BBA', name: 'Bachelor of Business Administration', department: 'Management', sems: { 1: ['Principles of Management', 'BBA101'], 3: ['Marketing Management', 'BBA301'], 5: ['Financial Management', 'BBA501'] } },
  { code: 'BCOM', name: 'Bachelor of Commerce', department: 'Commerce', sems: { 1: ['Financial Accounting', 'BCM101'], 3: ['Corporate Accounting', 'BCM301'], 5: ['Income Tax Law', 'BCM501'] } },
  { code: 'BSC-CS', name: 'B.Sc. Computer Science', department: 'Computer Science', sems: { 1: ['Discrete Mathematics', 'BCS101'], 3: ['Operating Systems', 'BCS301'], 5: ['Computer Networks', 'BCS501'] } },
  { code: 'BSC-PHY', name: 'B.Sc. Physics', department: 'Physics', sems: { 1: ['Mechanics', 'BPH101'], 3: ['Electromagnetism', 'BPH301'], 5: ['Quantum Physics', 'BPH501'] } },
  { code: 'BTECH-CSE', name: 'B.Tech Computer Science & Engineering', department: 'Computer Science', sems: { 1: ['Engineering Mathematics I', 'MA101'], 3: ['Database Systems', 'CS301'], 5: ['Machine Learning', 'CS501'] } },
  { code: 'BTECH-ME', name: 'B.Tech Mechanical Engineering', department: 'Mechanical', sems: { 1: ['Engineering Graphics', 'ME101'], 3: ['Thermodynamics', 'ME301'], 5: ['Machine Design', 'ME501'] } },
  { code: 'MBA', name: 'Master of Business Administration', department: 'Management', sems: { 1: ['Managerial Economics', 'MBA101'], 3: ['Strategic Management', 'MBA301'] } },
];

const DEPARTMENTS = ['Computer Science', 'Management', 'Commerce', 'Physics', 'Mathematics', 'Mechanical', 'English', 'Chemistry'];
const DESIGNATIONS = ['Professor', 'Associate Professor', 'Assistant Professor', 'Assistant Professor', 'Assistant Professor'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function workingDay(offset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  let added = 0;
  const step = offset >= 0 ? 1 : -1;
  while (added !== offset) {
    d.setDate(d.getDate() + step);
    if (d.getDay() !== 0) added += step;
  }
  return iso(d);
}

export async function seedDemo() {
  const rng = seededRandom(20261009);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  db.transaction(() => {
    for (const t of ['emails', 'duties', 'seat_assignments', 'plans', 'teacher_unavailability', 'slot_papers', 'slots', 'students', 'courses', 'rooms', 'layouts', 'users', 'teachers', 'activity', 'settings'])
      db.prepare(`DELETE FROM ${t}`).run();

    saveSettings({});
    db.prepare(
      "INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES ('Admin', 'admin@example.edu', ?, 'admin', 0)",
    ).run(bcrypt.hashSync('Admin@123', 10));

    // Layout types
    const layout = db.prepare('INSERT INTO layouts (name, kind, rows, cols, numbering, prefix, description) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const L1 = layout.run('Type 1 — Standard classroom', 'grid', 6, 8, 'row-letter', '', '6 rows × 8 seats. Most lecture rooms.').lastInsertRowid;
    const L2 = layout.run('Type 2 — Small classroom', 'grid', 5, 6, 'row-letter', '', '5 rows × 6 seats. Tutorial rooms.').lastInsertRowid;
    const L3 = layout.run('Type 3 — Seminar hall (circular)', 'circular', 3, 14, 'sequential', '', '3 rings of 14 seats around the centre.').lastInsertRowid;
    const L4 = layout.run('Type 4 — Examination hall', 'grid', 8, 12, 'row-letter', '', 'Large hall, 8 rows × 12 seats.').lastInsertRowid;

    const room = db.prepare('INSERT INTO rooms (name, building, floor, layout_id, blocked_seats, is_active, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
    room.run('A-101', 'Academic Block A', 'Ground', L1, '[]', 1, null);
    room.run('A-102', 'Academic Block A', 'Ground', L1, '[]', 1, null);
    room.run('A-103', 'Academic Block A', 'Ground', L1, '["0-0","0-7"]', 1, 'Two front corner benches are broken.');
    room.run('A-201', 'Academic Block A', 'First', L1, '[]', 1, null);
    room.run('A-202', 'Academic Block A', 'First', L1, '[]', 1, null);
    room.run('A-203', 'Academic Block A', 'First', L2, '[]', 1, null);
    room.run('B-101', 'Academic Block B', 'Ground', L2, '[]', 1, null);
    room.run('B-102', 'Academic Block B', 'Ground', L2, '[]', 1, null);
    room.run('B-201', 'Academic Block B', 'First', L1, '["2-3","2-4"]', 1, 'Pillar in the middle of row C.');
    room.run('Seminar Hall', 'Main Building', 'Second', L3, '[]', 1, null);
    room.run('Main Exam Hall', 'Main Building', 'Ground', L4, '[]', 1, null);
    room.run('Library Annex', 'Library', 'First', L2, '[]', 0, 'Closed for renovation.');

    // Courses & students
    const insCourse = db.prepare('INSERT INTO courses (code, name, department) VALUES (?, ?, ?)');
    const insStudent = db.prepare('INSERT INTO students (roll_no, name, course_id, semester, email) VALUES (?, ?, ?, ?, ?)');
    const year = new Date().getFullYear() % 100;
    for (const c of COURSES) {
      c.id = insCourse.run(c.code, c.name, c.department).lastInsertRowid;
      for (const sem of Object.keys(c.sems)) {
        const n = 34 + Math.floor(rng() * 30);
        const batch = year - Math.floor((Number(sem) - 1) / 2);
        const code = c.code.replace(/[^A-Z]/g, '');
        for (let i = 1; i <= n; i++) {
          const roll = `${batch}${code}${String(i).padStart(3, '0')}`;
          const name = `${pick(FIRST)} ${pick(LAST)}`;
          insStudent.run(roll, name, c.id, sem, null);
        }
      }
    }

    // Teachers
    const insTeacher = db.prepare(
      'INSERT INTO teachers (emp_code, name, email, department, designation, phone, max_duties) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const usedEmails = new Set();
    const teachers = [{ first: 'Ananya', last: 'Sharma', dept: 'Computer Science', desig: 'Associate Professor', title: 'Dr.' }];
    while (teachers.length < 36) {
      const first = pick(FIRST);
      const last = pick(LAST);
      const key = `${first}.${last}`.toLowerCase();
      if (usedEmails.has(key)) continue;
      usedEmails.add(key);
      const desig = pick(DESIGNATIONS);
      teachers.push({ first, last, dept: DEPARTMENTS[teachers.length % DEPARTMENTS.length], desig, title: desig === 'Professor' ? 'Dr.' : rng() < 0.4 ? 'Dr.' : 'Prof.' });
    }
    teachers.forEach((t, i) => {
      t.id = insTeacher.run(
        `EMP${1001 + i}`,
        `${t.title} ${t.first} ${t.last}`,
        `${t.first}.${t.last}`.toLowerCase() + '@example.edu',
        t.dept,
        t.desig,
        `98${String(Math.floor(rng() * 1e8)).padStart(8, '0')}`,
        t.desig === 'Professor' ? 3 : null,
      ).lastInsertRowid;
    });
    // A ready-to-use teacher account for the demo
    db.prepare(
      "INSERT INTO users (name, email, password_hash, role, teacher_id, must_change_password) VALUES (?, ?, ?, 'teacher', ?, 0)",
    ).run('Dr. Ananya Sharma', 'ananya.sharma@example.edu', bcrypt.hashSync('Teacher@123', 10), teachers[0].id);

    // Exam schedule
    const insSlot = db.prepare('INSERT INTO slots (exam_name, date, start_time, duration_min, session) VALUES (?, ?, ?, ?, ?)');
    const insPaper = db.prepare('INSERT INTO slot_papers (slot_id, course_id, semester, subject, subject_code) VALUES (?, ?, ?, ?, ?)');
    const byCode = Object.fromEntries(COURSES.map((c) => [c.code, c]));
    const addSlot = (exam, date, start, session, papers) => {
      const id = insSlot.run(exam, date, start, 90, session).lastInsertRowid;
      for (const [code, sem] of papers) {
        const c = byCode[code];
        insPaper.run(id, c.id, String(sem), c.sems[sem][0], c.sems[sem][1]);
      }
      return Number(id);
    };
    const MID = 'Mid-Semester Examination';
    const past = addSlot('Unit Test I', workingDay(-6), '09:30', 'Morning', [['BCA', 5], ['BBA', 5], ['BCOM', 5]]);
    const d1m = addSlot(MID, workingDay(3), '09:30', 'Morning', [['BCA', 1], ['BBA', 1], ['BCOM', 1], ['BSC-CS', 1]]);
    const d1a = addSlot(MID, workingDay(3), '14:00', 'Afternoon', [['BCA', 3], ['BBA', 3], ['BCOM', 3], ['BSC-CS', 3]]);
    const d2m = addSlot(MID, workingDay(4), '09:30', 'Morning', [['BSC-PHY', 1], ['BTECH-CSE', 1], ['BTECH-ME', 1], ['MBA', 1]]);
    addSlot(MID, workingDay(4), '14:00', 'Afternoon', [['BSC-PHY', 3], ['BTECH-CSE', 3], ['BTECH-ME', 3], ['MBA', 3]]);
    addSlot(MID, workingDay(5), '09:30', 'Morning', [['BCA', 5], ['BBA', 5], ['BCOM', 5], ['BSC-CS', 5]]);
    addSlot(MID, workingDay(5), '14:00', 'Afternoon', [['BSC-PHY', 5], ['BTECH-CSE', 5], ['BTECH-ME', 5]]);

    // Availability requests
    const insUn = db.prepare('INSERT INTO teacher_unavailability (teacher_id, date, slot_id, reason) VALUES (?, ?, ?, ?)');
    insUn.run(teachers[3].id, workingDay(3), null, 'Attending a conference');
    insUn.run(teachers[7].id, workingDay(4), d2m, 'Medical appointment');
    insUn.run(teachers[12].id, workingDay(5), null, 'Lab practical duty');

    seedDemo.slots = { past, d1m, d1a, d2m };
  })();

  // Generate a few plans so every stage of the workflow is visible.
  const admin = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
  const { past, d1m, d1a, d2m } = seedDemo.slots;
  const gen = (slotId) => {
    const slot = getSlot(slotId);
    const { suggested } = suggestRooms(slot, null, 'cross');
    return generatePlan({ slotId, roomIds: suggested, options: { seed: slotId * 7919 }, user: admin }).planId;
  };
  const approve = (planId) =>
    db.prepare("UPDATE plans SET status = 'approved', approved_at = ?, approved_by = ? WHERE id = ?").run(new Date().toISOString(), admin.id, planId);

  // make sure the demo teacher account has duties to look at
  const demoTeacher = db.prepare("SELECT teacher_id FROM users WHERE role = 'teacher'").get().teacher_id;
  const giveDuty = (planId) => {
    if (db.prepare('SELECT 1 FROM duties WHERE plan_id = ? AND teacher_id = ?').get(planId, demoTeacher)) return;
    const d = db.prepare("SELECT id FROM duties WHERE plan_id = ? AND role = 'invigilator' ORDER BY id DESC LIMIT 1").get(planId);
    if (d) db.prepare('UPDATE duties SET teacher_id = ? WHERE id = ?').run(demoTeacher, d.id);
  };

  const pPast = gen(past);
  approve(pPast);
  await notifyPlan(pPast, admin);
  const p1 = gen(d1m);
  giveDuty(p1);
  approve(p1);
  await notifyPlan(p1, admin);
  const p2 = gen(d1a);
  approve(p2);
  gen(d2m);
  db.prepare("INSERT INTO activity (user_id, user_name, action, details) VALUES (?, ?, 'Loaded demo data', 'Classrooms, courses, students, teachers and an exam schedule')").run(admin.id, admin.name);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--force')) {
    console.log('This replaces ALL data with demo data. Run with --force to continue (npm run seed).');
    process.exit(1);
  }
  await seedDemo();
  console.log('Demo data loaded. Sign in with the accounts listed in README.md.');
}
