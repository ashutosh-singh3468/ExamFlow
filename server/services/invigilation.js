import { db } from '../db.js';
import { slotGap, slotsOverlap } from '../util.js';
import { seededRandom } from './seating.js';

export function requiredInvigilators(studentCount, options) {
  if (!studentCount) return 0;
  const per = Math.max(1, Number(options.students_per_invigilator) || 30);
  const min = Math.max(1, Number(options.min_invigilators_per_room) || 1);
  return Math.max(min, Math.ceil(studentCount / per));
}

/**
 * Build the duty context for a slot: every active teacher with their workload and the
 * reasons they may not be suitable for this slot.
 */
export function teacherContext(slot, planId, settings) {
  const teachers = db.prepare('SELECT * FROM teachers WHERE is_active = 1 ORDER BY name').all();
  const otherDuties = db
    .prepare(
      `SELECT d.teacher_id, d.room_id, d.role, s.id AS slot_id, s.date, s.start_time, s.duration_min
       FROM duties d JOIN plans p ON p.id = d.plan_id JOIN slots s ON s.id = p.slot_id
       WHERE d.plan_id != ?
       ORDER BY s.date, s.start_time`,
    )
    .all(planId ?? -1);
  const unavailable = db
    .prepare('SELECT teacher_id, slot_id, reason FROM teacher_unavailability WHERE date = ?')
    .all(slot.date);

  const maxPerDay = Math.max(1, Number(settings.max_duties_per_day) || 1);
  const minGap = Math.max(0, Number(settings.min_gap_minutes) || 0);

  const ctx = new Map();
  for (const t of teachers) {
    ctx.set(t.id, {
      teacher: t,
      total: 0,
      sameDay: 0,
      overlap: false,
      tooClose: false,
      unavailable: null,
      lastRoom: null,
    });
  }
  for (const d of otherDuties) {
    const c = ctx.get(d.teacher_id);
    if (!c) continue;
    c.total++;
    if (d.date === slot.date) {
      c.sameDay++;
      if (slotsOverlap(d, slot)) c.overlap = true;
      else if (slotGap(d, slot) < minGap) c.tooClose = true;
    }
    if (d.room_id) c.lastRoom = d.room_id;
  }
  for (const u of unavailable) {
    const c = ctx.get(u.teacher_id);
    if (!c) continue;
    if (u.slot_id == null || u.slot_id === slot.id) c.unavailable = u.reason || 'Marked unavailable';
  }
  for (const c of ctx.values()) {
    c.restViolation = c.tooClose || c.sameDay >= maxPerDay;
    c.overMax = c.teacher.max_duties != null && c.total >= c.teacher.max_duties;
    // tier 0 = ideal, 1 = breaks rest rule, 2 = exceeds personal max, Infinity = impossible
    c.tier = c.overlap || c.unavailable ? Infinity : c.overMax ? 2 : c.restViolation ? 1 : 0;
  }
  return ctx;
}

/**
 * Assign invigilators to rooms for one plan.
 * @param rooms [{room_id, count, departments:Set<string>}]
 */
export function assignInvigilators({ slot, planId, rooms, settings, seed }) {
  const rng = seededRandom(seed ?? Date.now());
  const ctx = teacherContext(slot, planId, settings);
  const avoidDept = settings.avoid_same_department !== false;
  const jitter = new Map([...ctx.keys()].map((id) => [id, rng() * 0.01]));
  const chosen = new Set();
  const duties = [];
  const issues = [];

  const needs = rooms
    .filter((r) => r.count > 0)
    .map((r) => ({ ...r, need: requiredInvigilators(r.count, settings), got: 0 }))
    .sort((a, b) => b.count - a.count);

  const pick = (room) => {
    let best = null;
    let bestScore = Infinity;
    for (const [id, c] of ctx) {
      if (chosen.has(id) || c.tier === Infinity) continue;
      let score = c.tier * 1000 + c.total * 10 + c.sameDay * 3;
      if (room && avoidDept && c.teacher.department && room.departments?.has(c.teacher.department)) score += 4;
      if (room && c.lastRoom === room.room_id) score += 1;
      score += jitter.get(id);
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    }
    return best;
  };

  // Round-robin so every room gets its first invigilator before any room gets a second.
  const maxNeed = Math.max(0, ...needs.map((n) => n.need));
  for (let round = 0; round < maxNeed; round++) {
    for (const room of needs) {
      if (room.got >= room.need || round >= room.need) continue;
      const id = pick(room);
      if (id == null) continue;
      chosen.add(id);
      room.got++;
      duties.push({ room_id: room.room_id, teacher_id: id, role: 'invigilator' });
    }
  }
  const reserves = Math.max(0, Number(settings.reserve_invigilators) || 0);
  for (let i = 0; i < reserves; i++) {
    const id = pick(null);
    if (id == null) break;
    chosen.add(id);
    duties.push({ room_id: null, teacher_id: id, role: 'reserve' });
  }
  for (const room of needs) {
    if (room.got < room.need) issues.push({ room_id: room.room_id, missing: room.need - room.got });
  }
  return { duties, issues };
}
