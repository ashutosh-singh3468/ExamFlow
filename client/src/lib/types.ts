export type Role = 'admin' | 'teacher';
export type PlanStatus = 'draft' | 'approved' | 'notified';
export type LayoutKind = 'grid' | 'circular';
export type Adjacency = 'side' | 'cross' | 'all';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  teacher_id: number | null;
  must_change_password: boolean;
  department?: string | null;
  designation?: string | null;
  emp_code?: string | null;
  last_login_at?: string | null;
}

export interface LayoutShape {
  kind: LayoutKind;
  rows: number;
  cols: number;
  numbering?: string;
  prefix?: string;
}

export interface Layout extends LayoutShape {
  id: number;
  name: string;
  numbering: string;
  prefix: string;
  description: string | null;
  room_count?: number;
  capacity?: number;
}

export interface Seat {
  r: number;
  c: number;
  key: string;
  label: string;
  order: number;
}

export interface Room {
  id: number;
  name: string;
  building: string | null;
  floor: string | null;
  notes: string | null;
  is_active: boolean;
  layout_id: number;
  layout: Layout;
  blocked: string[];
  capacity: number;
  upcoming_bookings?: number;
  effective?: number;
  busy?: string | null;
}

export interface Course {
  id: number;
  code: string;
  name: string;
  department: string | null;
  student_count: number;
  semesters: { semester: string | null; count: number }[];
}

export interface Student {
  id: number;
  roll_no: string;
  name: string;
  course_id: number;
  course_code: string;
  course_name: string;
  semester: string | null;
  email: string | null;
}

export interface Teacher {
  id: number;
  emp_code: string;
  name: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  phone: string | null;
  max_duties: number | null;
  is_active: number;
  duty_count: number;
  upcoming_duties: number;
  unavailable_count: number;
  last_login_at: string | null;
  has_account: number;
}

export interface Unavailability {
  id: number;
  teacher_id: number;
  date: string;
  slot_id: number | null;
  reason: string | null;
  exam_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  session?: string | null;
}

export interface TeacherDuty {
  id: number;
  role: 'invigilator' | 'reserve';
  room_id: number | null;
  plan_id: number;
  status: PlanStatus;
  slot_id: number;
  exam_name: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  session: string | null;
  room_name: string | null;
  building: string | null;
  floor: string | null;
  students: number;
  co_invigilators?: string[];
  papers?: string[];
}

export interface Paper {
  id: number;
  slot_id: number;
  course_id: number;
  course_code: string;
  course_name: string;
  department: string | null;
  semester: string | null;
  subject: string | null;
  subject_code: string | null;
  student_count: number;
  color: number;
  short: string;
}

export interface Issue {
  type: string;
  severity: 'error' | 'warning';
  message: string;
  room_id?: number | null;
  seats?: string[];
  teacher_id?: number;
}

export interface PlanStats {
  expected: number;
  seated: number;
  unseated: number;
  rooms_used: number;
  rooms_selected: number;
  capacity_used: number;
  invigilators: number;
  reserves: number;
  invigilators_required: number;
  errors: number;
  warnings: number;
}

export interface PlanSummary {
  id: number;
  status: PlanStatus;
  slot_id: number;
  generated_at: string | null;
  updated_at: string | null;
  approved_at: string | null;
  notified_at: string | null;
  stats: PlanStats;
  issues: Issue[];
}

export interface SlotBase {
  id: number;
  exam_name: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  session: string | null;
}

export interface Slot extends SlotBase {
  papers: Paper[];
  student_count: number;
  plan: PlanSummary | null;
  clashes: { slot_id: number; students: number }[];
}

export interface PlanOptions {
  adjacency: Adjacency;
  room_usage: 'minimum' | 'all';
  students_per_invigilator: number;
  min_invigilators_per_room: number;
  reserve_invigilators: number;
  avoid_same_department: boolean;
}

export interface PlanRoom extends Room {
  seats: Seat[];
  assigned: number;
  required_invigilators: number;
  departments: string[];
}

export interface SeatAssignment {
  room_id: number;
  r: number;
  c: number;
  student_id: number;
  paper_id: number;
  roll_no: string;
  name: string;
  semester: string | null;
}

export interface Duty {
  id: number;
  room_id: number | null;
  teacher_id: number;
  role: 'invigilator' | 'reserve';
  name: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  phone: string | null;
  emp_code: string | null;
}

export interface PlanDetail {
  plan: {
    id: number;
    slot_id: number;
    status: PlanStatus;
    options: PlanOptions;
    room_ids: number[];
    generated_at: string | null;
    updated_at: string | null;
    approved_at: string | null;
    notified_at: string | null;
  };
  slot: SlotBase & { papers: Paper[] };
  rooms: PlanRoom[];
  seats: SeatAssignment[];
  duties: Duty[];
  unseated: { id: number; roll_no: string; name: string; semester: string | null; paper_id: number }[];
  stats: PlanStats;
  issues: Issue[];
}

export interface Candidate {
  id: number;
  name: string;
  department: string | null;
  designation: string | null;
  total: number;
  same_day: number;
  tier: number;
  reasons: string[];
  assigned: { id: number; room_id: number | null; role: string } | null;
}

export interface Settings {
  institution_name: string;
  institution_short: string;
  institution_address: string;
  exam_cell_name: string;
  controller_name: string;
  default_duration_min: number;
  sessions: { name: string; start: string }[];
  adjacency_mode: Adjacency;
  room_usage: 'minimum' | 'all';
  students_per_invigilator: number;
  min_invigilators_per_room: number;
  reserve_invigilators: number;
  max_duties_per_day: number;
  min_gap_minutes: number;
  avoid_same_department: boolean;
  report_before_min: number;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  app_url: string;
  has_smtp_pass?: boolean;
  smtp_configured?: boolean;
}

export interface Activity {
  id: number;
  user_name: string;
  action: string;
  details: string | null;
  created_at: string;
}

export interface EmailRow {
  id: number;
  plan_id: number | null;
  teacher_id: number | null;
  to_email: string | null;
  to_name: string | null;
  subject: string;
  status: 'sent' | 'preview' | 'failed';
  error: string | null;
  created_at: string;
  exam_name?: string;
  date?: string;
  start_time?: string;
  body_html?: string;
}
