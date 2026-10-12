# ExamFlow — Exam & Class Slot Management System

A complete web application for a college examination cell. It automates:

- **Exam seating**: clash-free seating plans in seconds; students of the same paper never sit side by side.
- **Classroom allocation**: uses the fewest rooms that still keep papers apart, or spreads students across every room you choose.
- **Invigilation duties**: shared fairly among teachers, never on dates they marked unavailable, and no back-to-back duties.
- **Approval workflow**: Generate → Review & edit → Approve → Notify.
- **Printable outputs**: seating charts, attendance sheets, notice-board summaries, duty lists and duty letters (PDF), plus Excel exports.
- **Email notifications**: each invigilator gets their room, date, time, duration and reporting time, with a calendar invite attached.
- **Teacher portal**: teachers see their duties and their room's seating, mark the days they can't invigilate, and download a duty letter.
- **Student seat finder**: a public page where students type their roll number to see their room, seat number and a map of the room.

---

## 1. Quick start (Windows)

1. Install **Node.js 20 or 22 LTS** from <https://nodejs.org> (choose the "LTS" installer, keep the default options).
2. Double-click **`start.bat`** in this folder.
   - The first run installs everything and builds the app (takes 1–3 minutes).
   - Your browser opens at <http://localhost:4000>.
3. Sign in with a demo account (below).

To stop ExamFlow, close the black command window.

### Commands (any operating system)

```bash
npm install
npm run build
npm start
```

The app runs on port 4000. To use another port, set the `PORT` environment variable first (on Windows: `set PORT=8080`).

## 2. Demo accounts

On first start ExamFlow loads demo data: 12 classrooms in 4 layout types, 8 courses, about 1,150 students, 36 teachers and a week of exams.

| Role | Email | Password |
|---|---|---|
| Exam cell administrator | `admin@example.edu` | `Admin@123` |
| Teacher (demo) | `ananya.sharma@example.edu` | `Teacher@123` |
| Any other teacher | their email | their **Employee ID**, e.g. `EMP1010` (they must choose a new password) |
| Student | — | open **Find your exam seat** on the sign-in page and enter a roll number, e.g. `26BCA001` |

> **Before real use:** sign in as admin, change the admin password (**Account**), add your own admin account under **Settings → Administrators**, then clear the demo data in **Settings → Data & backup → Everything**.

## 3. Using it on the college network

Run ExamFlow on one computer, such as the exam cell PC. When it starts, the window prints a line like:

```
➜ On college network: http://192.168.1.25:4000
```

Teachers and students on the same Wi-Fi/LAN open that address in any browser, including on their phones. Put the address in **Settings → Institution → ExamFlow web address** so that emails include a "View my duties" button.

If other computers can't connect, allow Node.js through the Windows Firewall (Windows asks the first time ExamFlow starts; choose **Private networks**).

## 4. Step-by-step workflow

1. **Settings → Institution**: your college name, address and controller's name. These are printed on every PDF and email.
2. **Classrooms → Layout types**: seat arrangements, e.g. *Type 1: 6 × 8 grid*, *Type 2: 5 × 6 grid*, *Type 3: circular*. Choose the seat numbering style (A1, A2… or 1, 2, 3…).
3. **Classrooms → Rooms**: add each room, pick its layout, and click seats on the map to block broken benches or pillars.
4. **Students → Import Excel**: upload your student list. Columns are matched automatically and you can adjust them. A template is available in the dialog.
5. **Teachers → Import Excel**: upload staff with Employee ID and email.
6. **Exam schedule → Add exam slot**: date, session (morning/afternoon), duration, and the papers (course + semester + subject) written in that sitting.
7. **Generate seating**: choose the slot, the rooms (or click *Auto-select fewest rooms*) and the rules.
8. **Review & edit**: click a student and then another seat to swap them (drag-and-drop also works, and Ctrl+Z undoes). You can move students between rooms, change invigilators and fix anything shown under *Checks*.
9. **Approve**: the plan is locked, and students can now find their seats online.
10. **Notify teachers**: duty emails go out. Then print the seating charts, attendance sheets and notices from **Reports & print**.

## 5. Excel formats

Column names don't need to match exactly. Common variants such as *Enrollment No*, *Programme* and *Sem* are recognised. Semesters written as `3`, `III`, `Sem 3` or `3rd` all become `3`.

**Students:** Roll number*, Student name*, Course*, Semester, Email
**Teachers:** Teacher name*, Employee ID*, Email, Department, Designation, Phone, Max duties

\* = required. Excel (`.xlsx`, `.xls`), CSV and OpenDocument files are supported.

## 6. Email setup

Without email settings, ExamFlow runs in **preview mode**: emails are created and shown under **Notifications** but not delivered. To send real emails, open **Settings → Email** and enter your SMTP server.

| Provider | Host | Port | SSL |
|---|---|---|---|
| Gmail / Google Workspace | `smtp.gmail.com` | 465 | on |
| Outlook / Microsoft 365 | `smtp.office365.com` | 587 | off |

For Gmail, turn on 2-step verification and create an **App password** (Google Account → Security → App passwords). Use that 16-character password, not your normal one. Click **Send test** to check.

## 7. How the seating algorithm works

1. Each room becomes a seat graph: the usable seats, plus which seats count as neighbours under the chosen rule. The rules are *side by side*, *side + front/back* (default) or *all around*. In circular rooms, seats wrap around each ring.
2. From the share of the largest paper, ExamFlow works out how full each room can be while still keeping same-paper students apart. One dominant paper needs empty buffer seats; a balanced mix fills the room.
3. It picks the fewest rooms that fit and gives each room a proportional slice of every paper. Roll numbers therefore form neat ranges per room, such as "26BCA001–26BCA024 → A-101".
4. Inside a room it fills seats column by column, always choosing the paper with the most students still waiting that doesn't clash with a seated neighbour. A repair pass then swaps students to remove any remaining clash.
5. **Invigilators** are assigned room by room. ExamFlow prefers the teacher with the fewest duties so far. It skips teachers who are unavailable, already on duty at that time, over their personal limit, or have a duty the same day ("no continuous duty"). It avoids putting teachers in rooms with their own department's students, and rotates rooms between duties.

Any rule that can't be met is listed under **Checks** in the plan, so the exam cell can see and fix it before approving.

## 8. Backup & reset

- **Backup:** Settings → Data & backup → *Download backup*. All data is in a single file, `data/examflow.db`.
- **Restore:** stop ExamFlow and replace `data/examflow.db` with the backup.
- **Reload the demo data:** `npm run seed`. This **erases everything**.

## 9. For developers

| Part | Technology |
|---|---|
| Server | Node.js, Express 5, SQLite (better-sqlite3), JWT cookie sessions, Nodemailer |
| Web app | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query |
| Documents | jsPDF + AutoTable (PDF), SheetJS (Excel) — generated in the browser |

```
server/
  index.js              Express app, static hosting, first-run demo data
  db.js                 schema & settings
  routes/               auth, setup (layouts/rooms/courses), people, exams (slots/plans), system, portal
  services/seating.js   seating algorithm
  services/invigilation.js  duty assignment
  services/plans.js     plan loading, conflict checks, editing
  services/mailer.js    duty emails + calendar invites
shared/layout.js        seat numbering & neighbour rules (used by server and browser)
client/src/
  pages/admin/…         dashboard, schedule, plan wizard & editor, classrooms, students, teachers, reports, settings
  pages/teacher/…       my duties, duty room, availability
  pages/FindSeat.tsx    public seat finder
  lib/pdf.ts            printable documents
```

Development mode with live reload:

```bash
npm run dev
```

This serves the web app at <http://localhost:5173> and proxies the API on port 4000. `npm run typecheck` checks the TypeScript.
